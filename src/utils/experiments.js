import { CONTEXT_FIELDS, EXPERIMENT_PRESETS, SIGNALS, categoryOfPath } from '../config/signalCatalog';
import { DIFF, compareSignals } from './compare';

const sameValue = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const show = (v) => (Array.isArray(v) ? v.join(', ') || '—' : String(v ?? '—')); // always a display string

/** Which recorded context values differ between two runs (none of them are part of the hash). */
export function diffContext(before, after) {
  const out = [];
  for (const key of Object.keys(CONTEXT_FIELDS)) {
    if (!sameValue(before?.[key], after?.[key])) {
      out.push({ key, label: CONTEXT_FIELDS[key].label, why: CONTEXT_FIELDS[key].why, before: show(before?.[key]), after: show(after?.[key]) });
    }
  }
  return out;
}

/** Plain-language reasons a signal may have moved, taken from the signal catalog. */
export function explainPath(path) {
  const id = path.split('.')[0];
  const meta = SIGNALS[id];
  return {
    path,
    id,
    category: categoryOfPath(path),
    label: meta?.label ?? id,
    causes: meta?.changesWhen ?? [],
    note: id === 'fingerprintjs' ? 'This is a composite value: it changes whenever any attribute inside FingerprintJS changes, so it often moves together with other signals.' : null,
  };
}

/** Did the run show what its preset hypothesised? Phrased as an observation, never as proof. */
function assessHypothesis(run, comparison) {
  const preset = EXPERIMENT_PRESETS.find((p) => p.id === run.presetId);
  if (!preset || preset.id === 'baseline' || preset.id === 'custom' || !comparison) return null;

  const changedIds = new Set(comparison.changedPaths.map((p) => p.split('.')[0]));
  const watched = preset.watch.filter((id) => changedIds.has(id));

  if (preset.id === 'display') {
    const screenChanged = changedIds.has('screen');
    const onlyComposite = !comparison.sameHash && !screenChanged && [...changedIds].every((id) => id === 'fingerprintjs');
    if (comparison.contextChanges.length && comparison.sameHash) {
      return { tone: 'confirmed', text: 'Display values moved but the hash did not change: this app\'s screen signal and the FingerprintJS composite both ignored the change.' };
    }
    if (onlyComposite) {
      return { tone: 'differs', text: 'The hash changed, but only through the FingerprintJS composite identifier. This app\'s own screen signal did not change, because it ignores zoom, pixel ratio and window size. FingerprintJS reacted to the display change, so display scaling can still alter the hash.' };
    }
    if (screenChanged) {
      return { tone: 'differs', text: 'A stable screen signal (resolution or colour depth) changed, so this was more than zoom or window size.' };
    }
    return { tone: 'none', text: 'No display change was recorded between this run and the baseline, so there is nothing to compare.' };
  }
  if (watched.length) return { tone: 'confirmed', text: `Observed change in the watched signal(s): ${watched.map((id) => SIGNALS[id].label).join(', ')}.` };
  return { tone: 'none', text: 'None of the watched signals changed. The setting may not have taken effect, the page may need a reload, or your browser may not expose this signal.' };
}

/**
 * Analyse an experiment: every run is compared with the first (baseline) run.
 * @returns {null | {runs: object[], distinctHashes: number, baseline: object, summary: string[], repeatable: boolean|null}}
 */
export function analyzeExperiment(experiment) {
  if (!experiment || experiment.runs.length === 0) return null;
  const sorted = [...experiment.runs].sort((a, b) => Date.parse(a.savedAt) - Date.parse(b.savedAt));
  const baseline = sorted[0];

  const groupOf = new Map();
  for (const r of sorted) if (r.hash && !groupOf.has(r.hash)) groupOf.set(r.hash, groupOf.size);

  const runs = sorted.map((run, index) => {
    const hashGroup = run.hash ? groupOf.get(run.hash) : null;
    if (index === 0) return { run, index, hashGroup, comparison: null, assessment: null };

    const { rows } = compareSignals(baseline.signals, run.signals);
    const changedPaths = rows.filter((r) => r.status !== DIFF.UNCHANGED).map((r) => r.path);
    const comparison = {
      sameHash: run.hash !== null && run.hash === baseline.hash,
      changedPaths,
      rows: rows.filter((r) => r.status !== DIFF.UNCHANGED),
      explanations: [...new Set(changedPaths.map((p) => p.split('.')[0]))].map((id) => explainPath(id)),
      contextChanges: diffContext(baseline.context, run.context),
    };
    return { run, index, hashGroup, comparison, assessment: assessHypothesis(run, comparison) };
  });

  const distinctHashes = groupOf.size;
  const others = runs.slice(1);
  const summary = [`${runs.length} run${runs.length === 1 ? '' : 's'} recorded, with ${distinctHashes} distinct configuration hash${distinctHashes === 1 ? '' : 'es'}.`];

  let repeatable = null;
  if (others.length) {
    repeatable = others.every((r) => r.comparison.sameHash);
    if (repeatable) summary.push('Every run produced the same hash as the baseline, so the stable signals were repeatable under this configuration.');
  }
  for (const r of others) {
    const name = `Run ${r.index + 1} ("${r.run.label}")`;
    if (!r.comparison.sameHash) {
      const ids = [...new Set(r.comparison.changedPaths.map((p) => p.split('.')[0]))].map((id) => SIGNALS[id]?.label ?? id);
      summary.push(`${name} differs from the baseline in ${r.comparison.changedPaths.length} stable signal${r.comparison.changedPaths.length === 1 ? '' : 's'} (${ids.join(', ') || 'unavailable signals'}).`);
    } else if (r.comparison.contextChanges.length) {
      summary.push(`${name} changed ${r.comparison.contextChanges.map((c) => c.label.toLowerCase()).join(', ')} but kept the same hash: variable signals are excluded from it.`);
    }
  }

  return { baseline, runs, distinctHashes, summary, repeatable };
}
