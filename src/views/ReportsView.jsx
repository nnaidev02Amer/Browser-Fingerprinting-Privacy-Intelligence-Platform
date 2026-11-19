import { useMemo, useState } from 'react';
import BundleExport from '../components/BundleExport';
import { Button, Card, EmptyState, ErrorState, PageHeader } from '../components/ui';
import { compareSnapshots } from '../utils/compare';
import { downloadText } from '../utils/download';
import { buildFindings } from '../utils/findings';
import { buildResearchReport } from '../utils/reportBuilder';
import { formatTimestamp, shortHash } from '../utils/reportView';

const FIELD = 'w-full rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300';

function Field({ id, label, hint, children }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs text-slate-300">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

/**
 * Generate the downloadable research report. It is built locally as a self-contained HTML document: nothing
 * is uploaded, and the file works offline (open it, or use the browser's Print > Save as PDF).
 */
export default function ReportsView({ report, experiments, history, onCollect }) {
  const [title, setTitle] = useState('');
  const [researcher, setResearcher] = useState('');
  const [institution, setInstitution] = useState('');
  const [notes, setNotes] = useState('');
  const [experimentId, setExperimentId] = useState('');
  const [firstId, setFirstId] = useState('');
  const [secondId, setSecondId] = useState('');
  const [outcome, setOutcome] = useState(null);
  const [bundleId, setBundleId] = useState('');

  const usable = experiments.experiments.filter((e) => e.runs.length > 0);
  const experiment = usable.find((e) => e.id === experimentId) ?? null;
  const snapshots = history.snapshots;

  const comparison = useMemo(() => {
    const a = snapshots.find((s) => s.id === firstId);
    const b = snapshots.find((s) => s.id === secondId);
    return a && b && a.id !== b.id ? compareSnapshots(a, b) : null;
  }, [snapshots, firstId, secondId]);

  const header = <PageHeader title="Reports and export" subtitle="Save your results as a report or a data file. Both are created in your browser and downloaded; nothing is uploaded." />;

  if (!report) {
    return (
      <div className="motion-view space-y-4">
        {header}
        <EmptyState title="Collect a fingerprint first" icon="▤" action={<Button variant="primary" onClick={onCollect}>Collect fingerprint</Button>}>
          The report describes your latest collected fingerprint, optionally together with an experiment and a snapshot comparison.
        </EmptyState>
      </div>
    );
  }

  const handleGenerate = () => {
    try {
      const findings = buildFindings({ experiments: experiments.experiments, report });
      const html = buildResearchReport({ report, experiment, comparison, findings, title, researcher, institution, notes });
      downloadText(`fingerprint-research-report-${new Date().toISOString().replace(/[:.]/g, '-')}.html`, html, 'text/html');
      setOutcome({ type: 'ok', text: 'Report generated and downloaded. Open the file in a browser; to make a PDF use Print, then Save as PDF.' });
    } catch (error) {
      setOutcome({ type: 'error', text: error?.message || 'The report could not be generated.' });
    }
  };

  const snapshotLabel = (s) => `${formatTimestamp(s.savedAt)} · ${shortHash(s.hash, 8)}`;
  const sameSelected = firstId && firstId === secondId;

  return (
    <div className="motion-view space-y-4">
      {header}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card id="report-form" title="Report details" subtitle="Optional fields appear in the report exactly as typed. Do not enter personal or sensitive information you would not want in the file.">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><Field id="report-title" label="Report title"><input id="report-title" className={FIELD} maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Browser fingerprint research report" autoComplete="off" /></Field></div>
            <Field id="report-researcher" label="Researcher (optional)"><input id="report-researcher" className={FIELD} maxLength={80} value={researcher} onChange={(e) => setResearcher(e.target.value)} autoComplete="off" /></Field>
            <Field id="report-institution" label="Institution or course (optional)"><input id="report-institution" className={FIELD} maxLength={100} value={institution} onChange={(e) => setInstitution(e.target.value)} autoComplete="off" /></Field>
            <div className="sm:col-span-2"><Field id="report-notes" label="Notes (optional)" hint={`${notes.length} / 1000 characters`}><textarea id="report-notes" className={`${FIELD} min-h-24`} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field></div>

            <Field id="report-experiment" label="Include an experiment">
              <select id="report-experiment" className={FIELD} value={experimentId} onChange={(e) => setExperimentId(e.target.value)}>
                <option value="">None</option>
                {usable.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.runs.length} runs)</option>)}
              </select>
            </Field>
            <div />

            <Field id="report-first" label="Compare: earlier snapshot">
              <select id="report-first" className={FIELD} value={firstId} onChange={(e) => setFirstId(e.target.value)} disabled={snapshots.length < 2}>
                <option value="">None</option>
                {snapshots.map((s) => <option key={s.id} value={s.id}>{snapshotLabel(s)}</option>)}
              </select>
            </Field>
            <Field id="report-second" label="Compare: later snapshot">
              <select id="report-second" className={FIELD} value={secondId} onChange={(e) => setSecondId(e.target.value)} disabled={snapshots.length < 2}>
                <option value="">None</option>
                {snapshots.map((s) => <option key={s.id} value={s.id}>{snapshotLabel(s)}</option>)}
              </select>
            </Field>
          </div>
          {snapshots.length < 2 && <p className="mt-3 text-xs text-slate-400">Save at least two snapshots to include a comparison.</p>}
          {sameSelected && <p role="alert" className="mt-3 text-xs text-amber-300">Choose two different snapshots to compare.</p>}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button variant="primary" onClick={handleGenerate}>Download report (HTML)</Button>
            <span className="text-xs text-slate-400">Self-contained file, works offline, print-ready.</span>
          </div>
          {outcome?.type === 'ok' && <p role="status" className="mt-3 text-sm text-emerald-300">{outcome.text}</p>}
          {outcome?.type === 'error' && <div className="mt-3"><ErrorState title="Report not generated">{outcome.text}</ErrorState></div>}
        </Card>

        <Card id="research-bundle" title="Research bundle (export only)" subtitle="A self-describing JSON record of one experiment so the result can be archived and its analysis re-derived. The application does not import it.">
          {usable.length === 0 ? (
            <p className="text-sm text-slate-400" data-testid="bundle-empty">Record a Laboratory experiment or a Protection test first.</p>
          ) : (
            <div className="space-y-3">
              <div>
                <label htmlFor="bundle-experiment" className="mb-1 block text-xs text-slate-300">Experiment</label>
                <select id="bundle-experiment" className={FIELD} value={bundleId} onChange={(e) => setBundleId(e.target.value)}>
                  <option value="">Choose…</option>
                  {usable.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.protocol === 'protection' ? 'Protection test' : 'Laboratory'}, {e.runs.length} runs)</option>)}
                </select>
              </div>
              {usable.find((e) => e.id === bundleId) && <BundleExport experiment={usable.find((e) => e.id === bundleId)} />}
            </div>
          )}
        </Card>

        <Card id="report-contents" title="What the report contains">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-200">
            <li>Project and experiment information</li>
            <li>Browser and environment summary</li>
            <li>Configuration hash (SHA-256)</li>
            <li>Collected signal categories and statuses</li>
            <li>Privacy exposure analysis and recommendations</li>
            <li>Optional collectors and third-party requests</li>
            <li className={experiment ? '' : 'text-slate-400'}>Experiment results {experiment ? `(${experiment.name})` : '(none selected)'}</li>
            <li className={comparison ? '' : 'text-slate-400'}>Snapshot comparison {comparison ? '(selected)' : '(none selected)'}</li>
            <li>Findings from your experiments (grouped by browser environment)</li>
            <li>Methodology</li>
            <li>Limitations</li>
          </ol>
          <div className="mt-4 rounded-lg border border-slate-700/70 bg-slate-950/50 p-3 text-xs leading-relaxed text-slate-300">
            <p className="font-medium text-slate-100">Never included</p>
            <p className="mt-1">IP address, approximate location, behavioural data, battery, permission states, media-device counts and the raw User-Agent string, even if you enabled those collectors. The report file contains your browser configuration, so share it deliberately.</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
