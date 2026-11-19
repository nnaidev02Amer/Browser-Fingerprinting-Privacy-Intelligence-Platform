import { HASH_GROUP_COLORS } from '../config/palette';
import { CATEGORY_BY_ID } from '../config/signalCatalog';
import { analyzeExperiment } from '../utils/experiments';
import { downloadText } from '../utils/download';
import { formatTimestamp, shortHash } from '../utils/reportView';
import { Button, Card, Pill } from './ui';

const ASSESSMENT_TONE = { confirmed: 'emerald', differs: 'amber', none: 'neutral' };
const ASSESSMENT_LABEL = { confirmed: 'Matches the hypothesis', differs: 'Differs from the hypothesis', none: 'No change observed' };

function GroupChip({ group }) {
  if (group === null) return <span className="text-xs text-slate-400">no hash</span>;
  const color = HASH_GROUP_COLORS[group % HASH_GROUP_COLORS.length];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-100 tabular-nums">
      <span aria-hidden="true" className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
      G{group + 1}
      <span className="sr-only"> (runs with the same group number have identical hashes)</span>
    </span>
  );
}

function RunDetails({ entry }) {
  const { comparison, assessment } = entry;
  if (!comparison) return null;
  return (
    <div className="space-y-3 border-t border-slate-700/70 pt-3 text-sm">
      {comparison.changedPaths.length === 0 ? (
        <p className="text-slate-300">No stable signal differs from the baseline.</p>
      ) : (
        <div>
          <p className="mb-1 font-medium text-slate-100">Stable signals that changed</p>
          <ul className="space-y-2">
            {comparison.explanations.map((e) => (
              <li key={e.id} className="rounded-lg border border-slate-700/70 bg-slate-950/60 p-2.5">
                <p className="flex flex-wrap items-center gap-2 text-slate-100">
                  <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: CATEGORY_BY_ID[e.category]?.color }} />
                  {e.label}
                  <span className="font-mono text-xs text-slate-400">{comparison.changedPaths.filter((p) => p.split('.')[0] === e.id).join(', ')}</span>
                </p>
                {e.causes.length > 0 && <p className="mt-1 text-xs leading-relaxed text-slate-300">Why it may change: {e.causes.join('; ')}.</p>}
                {e.note && <p className="mt-1 text-xs leading-relaxed text-slate-400">{e.note}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {comparison.contextChanges.length > 0 && (
        <div>
          <p className="mb-1 font-medium text-slate-100">Variable values that changed (never hashed)</p>
          <ul className="space-y-2">
            {comparison.contextChanges.map((c) => (
              <li key={c.key} className="rounded-lg border border-slate-700/70 bg-slate-950/60 p-2.5">
                <p className="text-slate-100">{c.label}: <span className="font-mono text-xs text-slate-300">{c.before} → {c.after}</span></p>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">{c.why}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
      {assessment && (
        <p className="flex flex-wrap items-start gap-2 leading-relaxed text-slate-200">
          <Pill tone={ASSESSMENT_TONE[assessment.tone]}>{ASSESSMENT_LABEL[assessment.tone]}</Pill>
          <span className="min-w-0 flex-1">{assessment.text}</span>
        </p>
      )}
    </div>
  );
}

/** Review the runs of one experiment: summary, hash groups and per-run explanations. */
export default function ExperimentResults({ experiment, onDeleteRun }) {
  const analysis = analyzeExperiment(experiment);

  return (
    <Card
      id="experiment-results"
      title={`Results: ${experiment.name}`}
      subtitle="Every run is compared with the first (baseline) run. Runs with the same colour and G number produced an identical hash."
      actions={analysis && <Button onClick={() => downloadText(`experiment-${experiment.id.slice(0, 8)}.json`, JSON.stringify(experiment, null, 2))}>Download experiment (JSON)</Button>}
    >
      {!analysis ? (
        <p className="text-sm text-slate-400">No runs recorded yet. Record a baseline run first.</p>
      ) : (
        <div className="space-y-4">
          <ul className="space-y-1 text-sm leading-relaxed text-slate-200" data-testid="experiment-summary">
            {analysis.summary.map((line) => <li key={line} className="flex gap-2"><span aria-hidden="true" className="text-cyan-400">▸</span><span>{line}</span></li>)}
          </ul>

          <ol className="space-y-2">
            {analysis.runs.map((entry) => (
              <li key={entry.run.id} className="rounded-lg border border-slate-700/70 bg-slate-950/40 p-3" data-testid="experiment-run">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <span className="font-semibold tabular-nums text-slate-400">#{entry.index + 1}</span>
                  <span className="font-medium text-slate-50">{entry.run.label}</span>
                  <GroupChip group={entry.hashGroup} />
                  <span className="font-mono text-xs text-slate-400">{shortHash(entry.run.hash, 10)}</span>
                  {entry.index === 0
                    ? <Pill tone="cyan">Baseline</Pill>
                    : entry.comparison.sameHash
                      ? <Pill tone="emerald">Same hash as baseline</Pill>
                      : <Pill tone="amber">Differs in {entry.comparison.changedPaths.length} signal{entry.comparison.changedPaths.length === 1 ? '' : 's'}</Pill>}
                  <span className="text-xs text-slate-400">{formatTimestamp(entry.run.savedAt)}</span>
                  <Button variant="ghost" className="ml-auto" onClick={() => onDeleteRun(entry.run.id)} aria-label={`Delete run ${entry.index + 1}: ${entry.run.label}`}>Delete</Button>
                </div>
                {entry.comparison && (entry.comparison.changedPaths.length > 0 || entry.comparison.contextChanges.length > 0 || entry.assessment) && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-cyan-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">
                      Why did this run differ?<span className="sr-only"> (run {entry.index + 1})</span>
                    </summary>
                    <div className="mt-2"><RunDetails entry={entry} /></div>
                  </details>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
    </Card>
  );
}
