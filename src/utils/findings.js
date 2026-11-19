import { SIGNALS } from '../config/signalCatalog';
import { analyzeDistinguishability, observationsFromProtection, observationsFromRuns, ROLE } from './distinguishability';
import { OUTCOME, analyzeProtection, pickProtectionRuns } from './protectionTest';

/**
 * Findings ledger: explicit, traceable statements derived ONLY from your own stored experiments
 * and the current report. Each finding names its rule, the evidence kind, the environment it
 * describes and the ids of the records it rests on (`basis`).
 *
 * No finding contains a percentage, score, entropy or uniqueness claim. Findings are descriptions of what
 * was measured in one browser; they are never merged across browsers.
 */
const label = (id) => SIGNALS[id]?.label ?? id;
const list = (ids) => ids.map(label).join(', ');

/** "Chrome 157 / Windows" from a run summary, or "unknown environment". Major version only. */
export function environmentLabel(summary) {
  const browser = summary?.browser ? summary.browser.replace(/^(\S+(?:\s\S+)*?)\s(\d+)[\d.]*$/, '$1 $2') : null;
  const os = summary?.os ? summary.os.split(' ')[0] : null;
  if (!browser && !os) return 'unknown environment';
  return [browser, os].filter(Boolean).join(' / ');
}

const finding = (f) => ({ tone: 'neutral', ...f });

function protectionFindings(experiment) {
  const picked = pickProtectionRuns(experiment);
  if (!picked.baseline || !picked.changed) return [];
  const a = analyzeProtection(picked);
  const env = environmentLabel(picked.changed.summary);
  const change = picked.changed.label;
  const basis = [experiment.id, ...[picked.baseline, picked.changed, picked.repeat, picked.repeat2].filter(Boolean).map((r) => r.id)];
  const ids = (outcomes) => a.attributes.filter((x) => !x.derived && outcomes.includes(x.outcome)).map((x) => x.id);
  const out = [];

  const affected = ids([OUTCOME.CHANGED, OUTCOME.RANDOMISED, OUTCOME.UNAVAILABLE]);
  if (!a.hasNoiseFloor) {
    out.push(finding({ rule: 'F3', evidence: ['experiment'], environment: env, basis, experimentId: experiment.id, change, provisional: true,
      statement: `In ${env}, with the change "${change}", ${affected.length ? list(affected) : 'no measured attribute'} differed from the baseline, but no second baseline was recorded, so natural variation was not separated from the effect (provisional).` }));
  } else {
    for (const attr of a.attributes.filter((x) => !x.derived && [OUTCOME.CHANGED, OUTCOME.RANDOMISED, OUTCOME.UNAVAILABLE].includes(x.outcome))) {
      const verb = { [OUTCOME.CHANGED]: 'differed from the baseline', [OUTCOME.RANDOMISED]: 'returned different results on repeated reads', [OUTCOME.UNAVAILABLE]: 'was no longer readable' }[attr.outcome];
      out.push(finding({ rule: 'F1', evidence: ['experiment'], environment: env, basis, experimentId: experiment.id, change, attribute: attr.id, outcome: attr.outcome, tone: 'notable',
        statement: `In ${env}, with the change "${change}", ${label(attr.id)} ${verb} beyond baseline variation (${a.baselineCount} baseline runs).` }));
    }
  }
  const residual = a.residual;
  if (residual.length) {
    out.push(finding({ rule: 'F2', evidence: ['experiment'], environment: env, basis, experimentId: experiment.id, change, attributes: residual,
      statement: `In ${env}, with the change "${change}", ${residual.length} measured attribute(s) stayed identical and could still support linking: ${list(residual)}.` }));
  }
  const noisy = ids([OUTCOME.UNSTABLE_BASELINE]);
  if (noisy.length) {
    out.push(finding({ rule: 'F8', evidence: ['experiment'], environment: env, basis, experimentId: experiment.id, change, attributes: noisy,
      statement: `In ${env}, ${list(noisy)} varied between baseline runs on their own, so no conclusion is drawn about the change "${change}" for them.` }));
  }
  return out;
}

/** F6: which attributes told the setups of ONE experiment apart (needs 2 setups and 2 sessions of one). */
function distinguishFindings(experiment) {
  const observations = experiment.protocol === 'protection' ? observationsFromProtection(experiment) : observationsFromRuns(experiment.runs);
  const d = analyzeDistinguishability(observations);
  const separating = d.attributes.filter((a) => a.role === ROLE.DISTINGUISHES).map((a) => a.id);
  if (!separating.length) return [];
  const env = environmentLabel(experiment.runs[0]?.summary);
  return [finding({ rule: 'F6', evidence: ['measured'], environment: env, basis: [experiment.id, ...experiment.runs.map((r) => r.id)], experimentId: experiment.id, attributes: separating, tone: 'notable',
    statement: `In your experiment "${experiment.name}" (${env}), ${list(separating)} told your ${d.configs.length} setups apart (this describes your own setups only).` })];
}

function reportFindings(report, environment) {
  if (!report) return [];
  const noisy = ['canvas', 'audio'].filter((id) => report.details?.[id]?.consistent === false);
  return noisy.map((id) => finding({ rule: 'F7', evidence: ['observed'], environment: environment, basis: [report.meta?.generatedAt ?? 'current-report'], attribute: id, tone: 'protective',
    statement: `In ${environment}, ${label(id)} output differed between two identical reads in the current run. This project cannot tell which software did it or whether identification is prevented.` }));
}

/**
 * @param {{experiments?: object[], report?: object, environment?: string}} input
 * @returns {object[]} findings, stable order (rule, then statement)
 */
export function buildFindings({ experiments = [], report = null, environment = 'unknown environment' } = {}) {
  const all = [
    ...experiments.filter((e) => e.protocol === 'protection').flatMap(protectionFindings),
    ...experiments.flatMap(distinguishFindings),
    ...reportFindings(report, environment),
  ];
  return all.map((f, i) => ({ ...f, id: `${f.rule}-${i + 1}` })).sort((a, b) => a.rule.localeCompare(b.rule) || a.statement.localeCompare(b.statement)).map((f, i) => ({ ...f, id: `${f.rule}-${i + 1}` }));
}

/** Findings grouped by environment. Environments are never merged. */
export function groupByEnvironment(findings) {
  const groups = new Map();
  for (const f of findings) {
    if (!groups.has(f.environment)) groups.set(f.environment, []);
    groups.get(f.environment).push(f);
  }
  return [...groups.entries()].map(([environment, items]) => ({ environment, findings: items })).sort((a, b) => a.environment.localeCompare(b.environment));
}

const EVIDENCE_RANK = { experiment: 0, measured: 0, observed: 1, documented: 2 };
const rank = (kinds) => Math.min(...kinds.map((k) => EVIDENCE_RANK[k] ?? 3));

/**
 * Recommendations bound to findings. Each has an action, why it applies (finding ids), the limit, and
 * evidence. Ordering is by evidence strength then id: it is explicitly NOT a risk ranking.
 */
export function recommendationsFromFindings(findings) {
  const recs = [];
  const by = (rule) => findings.filter((f) => f.rule === rule);

  const effectGroups = by('F1').reduce((m, f) => { (m[f.experimentId] ??= []).push(f); return m; }, {});
  for (const group of Object.values(effectGroups)) {
    const first = group[0];
    const attrs = group.map((f) => label(f.attribute));
    const residual = by('F2').find((f) => f.experimentId === first.experimentId);
    recs.push({
      id: `rec-effect-${first.experimentId}`, evidence: ['experiment'], sources: [], environment: first.environment, findings: group.map((f) => f.id),
      title: `In ${first.environment}, the change "${first.change}" affected: ${attrs.join(', ')}`,
      action: 'Repeat the Protection test with the optional A3 baseline to confirm the differences are not natural variation. If you adopt this setting, re-test after browser updates.',
      because: `Findings ${group.map((f) => f.id).join(', ')} (Protection test).`,
      why: residual ? `Attributes that stayed identical, and could still support linking, were: ${list(residual.attributes)}. This change did not address them in this test.` : 'No attribute stayed identical in this test.',
      tradeoff: 'A changed or randomised value is not evidence of better privacy: it can make a browser more distinctive. This describes one browser, one machine and one change.',
    });
  }
  const provisional = by('F3');
  if (provisional.length) {
    recs.push({ id: 'rec-record-a2', evidence: ['experiment'], sources: [], environment: provisional[0].environment, findings: provisional.map((f) => f.id),
      title: 'Record a second baseline (A2) before drawing conclusions',
      action: 'Undo the change, reload, and record A2 in the Protection test.',
      because: `Finding${provisional.length > 1 ? 's' : ''} ${provisional.map((f) => f.id).join(', ')}: no noise floor was recorded.`,
      why: 'Without a second baseline, natural variation cannot be separated from the effect of the setting.',
      tradeoff: 'Even with A2, two baselines can agree by chance; the optional A3 tightens this.' });
  }
  const separating = by('F6');
  if (separating.length) {
    recs.push({ id: 'rec-start-with-separating', evidence: ['measured'], sources: [], environment: separating[0].environment, findings: separating.map((f) => f.id),
      title: `Look first at the attributes that separated your configurations: ${list(separating[0].attributes)}`,
      action: 'Test settings that affect these attributes first, using the Protection test, and check which ones actually change.',
      because: `Finding ${separating[0].id}.`,
      why: 'These attributes differed between your own setups and stayed the same within each setup.',
      tradeoff: 'Your configurations are a handful of cases on one machine, not a population. Nothing here says how rare any value is.' });
  }
  const noisyReads = by('F7');
  if (noisyReads.length) {
    recs.push({ id: 'rec-repeat-read-noise', evidence: ['observed'], sources: [], environment: noisyReads[0].environment, findings: noisyReads.map((f) => f.id),
      title: `Repeated reads of ${noisyReads.map((f) => label(f.attribute)).join(' and ')} differed in this run`,
      action: 'Run the Protection test with a baseline and a reload to see whether this is consistent between sessions.',
      because: `Finding${noisyReads.length > 1 ? 's' : ''} ${noisyReads.map((f) => f.id).join(', ')}.`,
      why: 'Two identical reads returned different results, which is consistent with the output being altered between reads.',
      tradeoff: 'This project cannot tell which software did it, and cannot tell whether the alteration prevents identification.' });
  }
  return recs.sort((a, b) => rank(a.evidence) - rank(b.evidence) || a.id.localeCompare(b.id));
}

export { rank as evidenceRank };
