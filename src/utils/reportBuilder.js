import { APP_VERSION, FINGERPRINTJS_VERSION } from '../config/buildInfo';
import { PROJECT_NAME } from '../config/navigation';
import { EVIDENCE_KINDS } from '../config/sources';
import { groupByEnvironment } from './findings';
import { CATEGORIES, EXPOSURE_CLASSES, EXPOSURE_RUBRIC_NOTE } from '../config/signalCatalog';
import { STATUS_LABEL } from '../collectors/runner';
import { buildComposition } from './composition';
import { summariseByCategory } from './categorySummary';
import { DIFF } from './compare';
import { analyzeExperiment } from './experiments';
import { analyzeExposure } from './privacyAnalysis';
import { selectCollector } from './reportView';

export const REPORT_PROJECT = PROJECT_NAME;

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** Escape text for safe inclusion in HTML. Used for EVERY dynamic value in the report. */
export const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);

const esc = escapeHtml;
const when = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? 'unknown time' : d.toLocaleString(); };
const val = (v) => (v === null || v === undefined || v === '' ? '—' : Array.isArray(v) ? (v.join(', ') || '—') : typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v));
const clip = (v, n = 80) => { const t = typeof v === 'string' ? v : JSON.stringify(v) ?? '—'; return t.length > n ? `${t.slice(0, n - 14)}…${t.slice(-10)}` : t; };

const table = (headers, rows, cls = '') =>
  `<table class="${cls}"><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
const kv = (pairs) => `<dl>${pairs.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(val(v))}</dd></div>`).join('')}</dl>`;
const section = (n, title, body) => `<section><h2><span>${n}</span>${esc(title)}</h2>${body}</section>`;

const STYLE = `
:root{--ink:#0f172a;--muted:#475569;--line:#d9e0ec;--accent:#0e7490;--bg:#f6f8fc}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 "Segoe UI",system-ui,-apple-system,Arial,sans-serif}
main{max-width:920px;margin:0 auto;padding:32px 24px 56px;background:#fff}
header.cover{border-bottom:3px solid var(--accent);padding-bottom:16px;margin-bottom:8px}
header.cover p.kicker{margin:0;color:var(--accent);font-weight:600;letter-spacing:.06em;text-transform:uppercase;font-size:12px}
h1{margin:6px 0 4px;font-size:26px}h2{margin:34px 0 10px;font-size:18px;border-bottom:1px solid var(--line);padding-bottom:6px;display:flex;gap:10px;align-items:baseline}
h2 span{color:var(--accent);font-variant-numeric:tabular-nums}h3{margin:18px 0 6px;font-size:15px}
p,li{margin:6px 0}.muted{color:var(--muted);font-size:13px}.note{border-left:3px solid var(--accent);background:var(--bg);padding:8px 12px;margin:10px 0}
.hash{font:600 14px ui-monospace,Consolas,monospace;word-break:break-all;background:var(--bg);border:1px solid var(--line);padding:12px;border-radius:6px}
dl{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:8px 24px;margin:8px 0}dl div{min-width:0}dt{color:var(--muted);font-size:12px}dd{margin:0;word-break:break-word}
table{width:100%;border-collapse:collapse;margin:10px 0;font-size:13px}th,td{border:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top;word-break:break-word}th{background:var(--bg)}
.bar{display:flex;height:14px;border-radius:3px;overflow:hidden;border:1px solid var(--line);margin:6px 0 4px}.bar i{display:block;height:100%}
.legend{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12px;color:var(--muted)}.legend b{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:5px;vertical-align:baseline}
footer{margin-top:40px;border-top:1px solid var(--line);padding-top:12px}
@media print{body{background:#fff}main{padding:0;max-width:none}section{break-inside:avoid-page}h2{break-after:avoid}table{break-inside:auto}tr{break-inside:avoid}}
`;

function categoryBar(composition) {
  const parts = composition.groups.filter((g) => g.inHash > 0);
  const total = parts.reduce((n, g) => n + g.inHash, 0) || 1;
  const bar = parts.map((g) => `<i style="width:${((g.inHash / total) * 100).toFixed(2)}%;background:${esc(g.category.color)}" title="${esc(g.category.label)}"></i>`).join('');
  const legend = parts.map((g) => `<span><b style="background:${esc(g.category.color)}"></b>${esc(g.category.short)} (${g.inHash})</span>`).join('');
  return `<div class="bar" role="img" aria-label="Hashed signals by category">${bar}</div><div class="legend">${legend}</div>`;
}

/**
 * Build the standalone HTML research report. Pure: no network access, no globals except Date formatting.
 *
 * @param {object} input
 * @param {object} input.report        current report (required)
 * @param {object} [input.experiment]  a saved experiment (optional)
 * @param {object} [input.comparison]  result of compareSnapshots() (optional)
 * @param {string} [input.title] @param {string} [input.researcher] @param {string} [input.institution] @param {string} [input.notes]
 * @param {Date}   [input.now]
 */
export function buildResearchReport({ report, experiment = null, comparison = null, findings = [], title = '', researcher = '', institution = '', notes = '', now = new Date() }) {
  if (!report) throw new Error('A collected fingerprint is required to build a report.');

  const fp = report.stableFingerprint;
  const composition = buildComposition(report);
  const exposure = analyzeExposure(report);
  const analysis = experiment ? analyzeExperiment(experiment) : null;
  const get = (id) => selectCollector(report, id).data;
  const browser = get('browser'); const screen = get('screen'); const hardware = get('hardware'); const touch = get('touch'); const locale = get('locale'); const webgl = get('webgl');
  const heading = title.trim() || 'Browser fingerprint research report';

  // 1. Project & experiment information
  const info = section(1, 'Project and experiment information', `
    ${kv([
    ['Report title', heading], ['Project', REPORT_PROJECT], ['Researcher', researcher.trim() || null], ['Institution / course', institution.trim() || null],
    ['Generated', when(now.toISOString())], ['Fingerprint collected', when(report.meta.generatedAt)],
    ['Experiment', experiment ? experiment.name : 'None selected'], ['Experiment runs', experiment ? experiment.runs.length : null],
    ['Application version', APP_VERSION], ['FingerprintJS version', FINGERPRINTJS_VERSION], ['Hash input version', fp.hashInputVersion],
  ])}
    ${notes.trim() ? `<h3>Notes</h3><p style="white-space:pre-wrap">${esc(notes.trim())}</p>` : ''}`);

  // 2. Environment summary
  const environment = section(2, 'Browser and environment summary', `
    ${kv([
    ['Browser', browser && [browser.browser.name, browser.browser.version].filter(Boolean).join(' ')],
    ['Operating system', browser && [browser.os.name, browser.os.version].filter(Boolean).join(' ')],
    ['Device class', browser?.deviceType], ['Detection method', browser && (browser.source === 'userAgent' ? 'User-Agent string (fallback)' : 'User-Agent Client Hints')],
    ['Screen', screen && `${screen.width} × ${screen.height}, ${screen.colorDepth}-bit`], ['Logical CPU cores', hardware?.cpuLogicalCores],
    ['Device memory', hardware && (hardware.deviceMemorySupported ? `${hardware.deviceMemoryGB} GB (approx.)` : 'Not exposed')],
    ['Touch points', touch?.maxTouchPoints], ['Graphics renderer', webgl && (webgl.unmaskedInfoAvailable ? webgl.renderer : 'Hidden by browser')],
    ['Time zone', locale?.timeZone], ['Languages', locale?.languages],
  ])}
    <p class="muted">This section describes the browser used to produce the report. Share the file deliberately: it contains your browser configuration.</p>`);

  // 3. Hash
  const hashSection = section(3, 'Configuration hash', `
    ${fp.hash ? `<p class="hash">${esc(fp.hash)}</p>` : `<p class="note">The hash is unavailable: ${esc(fp.hashError)}</p>`}
    ${kv([['Algorithm', `${fp.algorithm} (Web Crypto, computed locally)`], ['Hash input version', fp.hashInputVersion], ['Stable signals used', `${fp.signalsCollected} of ${fp.signalsTotal}`]])}
    ${fp.incomplete ? `<p class="note">Some stable signals were unavailable (${esc(fp.failedSignals.map((s) => `${s.id}: ${s.status}`).join(', '))}). A hash built from fewer signals will not match a complete one.</p>` : ''}
    <p class="note">${esc(fp.disclaimer)}</p>`);

  // 4. Signal categories
  const signalsSection = section(4, 'Collected signal categories', `
    <p>Signals that feed the hash, by category:</p>${categoryBar(composition)}
    ${composition.groups.map((g) => `<h3>${esc(g.category.label)}</h3>${table(
    ['Signal', 'Collection status', 'Used in hash', 'Kind'],
    g.signals.map((s) => [s.label, STATUS_LABEL[s.status] ?? s.status, s.inHash ? 'Yes' : 'No', s.stable ? 'Stable' : 'Variable (never hashed)']),
  )}`).join('')}`);

  // 5. Privacy exposure
  const privacy = section(5, 'Privacy exposure analysis', `
    <p>${esc(exposure.collectedCount)} signals were collected: ${Object.entries(EXPOSURE_CLASSES).map(([k, c]) => `${esc(exposure.counts[k])} ${esc(c.label.toLowerCase())}`).join(', ')}.</p>
    <p class="muted">${esc(EXPOSURE_RUBRIC_NOTE)}</p>
    ${table(['Signal', 'Group', 'What it exposes'], exposure.signals.map((s) => [s.label, s.exposureLabel, s.exposes]))}
    <h3>Observations from this run</h3><ul>${exposure.observations.map((o) => `<li>${esc(o.text)}</li>`).join('') || '<li>None.</li>'}</ul>
    <h3>Recommendations</h3>${exposure.recommendations.map((r) => `<p><strong>${esc(r.title)}</strong><br>${esc(r.because)} ${esc(r.why)}<br><span class="muted">Trade-off: ${esc(r.tradeoff)}</span></p>`).join('')}`);

  // 6. Optional collectors & third parties
  const optional = section(6, 'Optional collectors and third-party requests', `
    ${table(['Optional category', 'State during collection', 'Third party contacted'], exposure.optional.map((c) => [c.title, c.enabled ? 'Enabled' : 'Disabled', c.thirdParties.length ? c.thirdParties.map((t) => t.host).join(', ') : 'None']))}
    <p>Third-party requests made in this run: ${exposure.thirdParties.length ? esc(exposure.thirdParties.map((t) => `${t.host} (${t.purpose})`).join('; ')) : 'none'}. Fingerprint data uploaded: ${report.meta.fingerprintDataTransmitted ? 'yes' : 'no'}.</p>
    <p class="muted">IP address, location, behavioural data, battery, permission states and media-device counts are never included in this report.</p>`);

  // 7. Experiment
  const experimentSection = analysis ? section(7, `Experiment results: ${experiment.name}`, `
    ${table(['#', 'Run label', 'Recorded', 'Hash (short)', 'Hash group', 'Differs from baseline'], analysis.runs.map((r) => [r.index + 1, r.run.label, when(r.run.savedAt), r.run.hash ? `${r.run.hash.slice(0, 12)}…` : 'unavailable', r.hashGroup === null ? '—' : `G${r.hashGroup + 1}`, r.index === 0 ? 'baseline' : r.comparison.sameHash ? 'No' : `Yes (${r.comparison.changedPaths.length} signals)`]))}
    <ul>${analysis.summary.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
    ${analysis.runs.filter((r) => r.index > 0).map((r) => `<h3>Run ${r.index + 1}: ${esc(r.run.label)}</h3>
      ${r.comparison.changedPaths.length ? table(['Changed signal', 'Why it may change'], r.comparison.explanations.map((e) => [e.label, `${e.causes.join('; ') || 'n/a'}${e.note ? ` ${e.note}` : ''}`])) : '<p class="muted">No stable signal differs from the baseline.</p>'}
      ${r.comparison.contextChanges.length ? table(['Variable value', 'Before', 'After', 'Note'], r.comparison.contextChanges.map((c) => [c.label, c.before, c.after, c.why])) : ''}
      ${r.assessment ? `<p class="muted">Observation: ${esc(r.assessment.text)}</p>` : ''}`).join('')}`)
    : section(7, 'Experiment results', '<p class="muted">No experiment was selected for this report.</p>');

  // 8. Comparison
  let comparisonSection;
  if (comparison) {
    const byCategory = summariseByCategory(comparison.rows);
    comparisonSection = section(8, 'Snapshot comparison', `
      ${kv([['Earlier snapshot', `${when(comparison.older.savedAt)} (${comparison.older.hash ? `${comparison.older.hash.slice(0, 12)}…` : 'no hash'})`], ['Later snapshot', `${when(comparison.newer.savedAt)} (${comparison.newer.hash ? `${comparison.newer.hash.slice(0, 12)}…` : 'no hash'})`]])}
      <p>${comparison.sameHash ? 'The configuration hashes are identical.' : 'The configuration hashes differ, so at least one stable signal changed (or a signal was unavailable in one run).'}</p>
      ${table(['Changed', 'Unchanged', 'Added', 'Removed'], [[comparison.counts.changed, comparison.counts.unchanged, comparison.counts.added, comparison.counts.removed]])}
      ${table(['Category', 'Changed', 'Added', 'Removed', 'Unchanged'], CATEGORIES.filter((c) => byCategory[c.id]).map((c) => [c.label, byCategory[c.id].changed, byCategory[c.id].added, byCategory[c.id].removed, byCategory[c.id].unchanged]))}
      ${table(['Signal', 'Result', 'Before', 'After'], comparison.rows.filter((r) => r.status !== DIFF.UNCHANGED).map((r) => [r.path, r.status, r.before === undefined ? '—' : clip(r.before), r.after === undefined ? '—' : clip(r.after)]))}`);
  } else {
    comparisonSection = section(8, 'Snapshot comparison', '<p class="muted">No comparison was selected for this report.</p>');
  }

  // 9. Findings from the user's own experiments (never merged across browser environments)
  const findingsSection = section(9, 'Findings from your experiments', findings.length === 0
    ? '<p class="muted">No findings: no Protection test or Laboratory experiment data was available. Nothing has been measured, so no experiment-based conclusion is made.</p>'
    : `<p class="muted">Derived only from your own stored experiments, grouped by browser environment. Environments are never merged. Each finding names the kind of evidence it rests on.</p>${groupByEnvironment(findings).map((g) => `<h3>${esc(g.environment)}</h3><ul>${g.findings.map((f) => `<li><strong>${esc(f.id)}</strong> ${esc(f.statement)} <span class="muted">[${esc(f.evidence.map((k) => EVIDENCE_KINDS[k]?.label ?? k).join(', '))}]</span></li>`).join('')}</ul>`).join('')}`);

  // 10-11. Methodology & limitations
  const methodology = section(10, 'Methodology', `<ol>
    <li><strong>Collection.</strong> Ten essential collectors read browser attributes locally when the user presses Collect. Every collector is isolated and time-limited and reports one of: collected, unsupported, disabled, failed or timed out.</li>
    <li><strong>Stable and variable signals.</strong> Only each collector's stable view is hashed. Timestamps, session IDs, battery, IP, location, behaviour, exact versions, zoom and window geometry are excluded by design.</li>
    <li><strong>Hash.</strong> The stable signals are serialised as canonical JSON (keys sorted) with an input-version tag and hashed with SHA-256 through the Web Crypto API, entirely in the browser.</li>
    <li><strong>Consent.</strong> Optional categories (extended details, public IP, approximate location, behavioural timing) are off by default, separately consented and revocable. Revocation cancels in-flight requests and removes that category's data.</li>
    <li><strong>Exposure groups.</strong> ${esc(EXPOSURE_RUBRIC_NOTE)} No numeric score, entropy value or risk percentage is produced.</li>
    <li><strong>Comparison and experiments.</strong> Snapshots and experiment runs are compared signal by signal. A signal is <em>changed</em> when its value differs, <em>added</em> or <em>removed</em> when it exists in only one run. Experiment runs are compared with the first (baseline) run.</li>
    <li><strong>Local only.</strong> Fingerprint data, history and this report never leave the browser. Only the optional IP and location lookups contact third parties, and they contain no fingerprint data.</li></ol>`);

  const limitations = section(11, 'Limitations', `<ul>
    <li>The configuration hash is <strong>not a unique identifier of a person or physical device</strong>: identical setups can share a hash, and it changes when the browser, settings or hardware change.</li>
    <li>Results come from one browser at one moment. They say nothing about how common any value is in a population, which is why no uniqueness or entropy figure is given.</li>
    <li>Exposure groups and recommendations are editorial explanations, not measurements or a security assessment.</li>
    <li>Privacy features (randomisation, standardisation, blocking) can alter or hide signals, and unavailable signals change the hash.</li>
    <li>Only Chromium behaviour was verified in a real browser during development; other browsers may expose fewer signals.</li>
    <li>This is an educational research prototype, not a production tracking or security product.</li></ul>`);

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(heading)}</title><style>${STYLE}</style></head><body><main>
<header class="cover"><p class="kicker">${esc(REPORT_PROJECT)}</p><h1>${esc(heading)}</h1>
<p class="muted">Generated locally on ${esc(when(now.toISOString()))}. Nothing in this report was uploaded to any service.</p></header>
${info}${environment}${hashSection}${signalsSection}${privacy}${optional}${experimentSection}${comparisonSection}${findingsSection}${methodology}${limitations}
<footer class="muted"><p>Derived from Browser-Fingerprint-Project-React by Abu Sufiun (github.com/sufiun27). No licence is claimed or granted by this report. Uses FingerprintJS 4.6.2 (Business Source License 1.1); see the project README for licensing notes.</p></footer>
</main></body></html>`;
}

/** A shorter standalone report containing just one comparison (used by the History/Analytics views). */
export function buildComparisonReport({ comparison, now = new Date(), title = 'Fingerprint snapshot comparison' }) {
  const byCategory = summariseByCategory(comparison.rows);
  const body = `
    ${kv([['Earlier snapshot', `${when(comparison.older.savedAt)} (${comparison.older.hash ? `${comparison.older.hash.slice(0, 12)}…` : 'no hash'})`], ['Later snapshot', `${when(comparison.newer.savedAt)} (${comparison.newer.hash ? `${comparison.newer.hash.slice(0, 12)}…` : 'no hash'})`]])}
    <p>${comparison.sameHash ? 'The configuration hashes are identical.' : 'The configuration hashes differ, so at least one stable signal changed (or a signal was unavailable in one run).'}</p>
    ${table(['Changed', 'Unchanged', 'Added', 'Removed'], [[comparison.counts.changed, comparison.counts.unchanged, comparison.counts.added, comparison.counts.removed]])}
    ${table(['Category', 'Changed', 'Added', 'Removed', 'Unchanged'], CATEGORIES.filter((c) => byCategory[c.id]).map((c) => [c.label, byCategory[c.id].changed, byCategory[c.id].added, byCategory[c.id].removed, byCategory[c.id].unchanged]))}
    ${table(['Signal', 'Result', 'Before', 'After'], comparison.rows.map((r) => [r.path, r.status, r.before === undefined ? '—' : clip(r.before), r.after === undefined ? '—' : clip(r.after)]))}
    <p class="note">The configuration hash is not a unique identifier of a person or physical device. The FingerprintJS composite value moves whenever any attribute inside it moves, so it often changes together with other signals.</p>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${STYLE}</style></head><body><main>
<header class="cover"><p class="kicker">${esc(REPORT_PROJECT)}</p><h1>${esc(title)}</h1><p class="muted">Generated locally on ${esc(when(now.toISOString()))}. Nothing was uploaded.</p></header>
${section(1, 'Comparison', body)}</main></body></html>`;
}
