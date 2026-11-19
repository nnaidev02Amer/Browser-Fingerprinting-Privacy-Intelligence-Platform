import { useEffect, useState } from 'react';
import { summariseByCategory } from '../utils/categorySummary';
import { compareAttributes } from '../utils/attributes';
import { describeSessionRelation } from '../utils/observation';
import { DIFF, compareSnapshots } from '../utils/compare';
import { downloadText } from '../utils/download';
import { buildComparisonReport } from '../utils/reportBuilder';
import { formatTimestamp, shortHash } from '../utils/reportView';
import AttributeChanges from './AttributeChanges';
import { CategoryDiffBars } from './charts';
import { Button, Card } from './ui';

const stamp = (result) => result.newer.savedAt.replace(/[:.]/g, '-');

/** Export shape: only whitelisted snapshot fields (no IP, location or behavioural data exists in snapshots). */
const exportable = (r) => ({
  generatedLocally: true,
  earlier: { savedAt: r.older.savedAt, hash: r.older.hash, hashInputVersion: r.older.hashInputVersion },
  later: { savedAt: r.newer.savedAt, hash: r.newer.hash, hashInputVersion: r.newer.hashInputVersion },
  sameHash: r.sameHash,
  counts: r.counts,
  rows: r.rows,
});

// Each state has a symbol and a word as well as a colour.
const DIFF_STYLE = {
  [DIFF.CHANGED]: { label: 'Changed', symbol: '~', cls: 'border-amber-800 bg-amber-950 text-amber-200' },
  [DIFF.ADDED]: { label: 'Added', symbol: '+', cls: 'border-emerald-800 bg-emerald-950 text-emerald-200' },
  [DIFF.REMOVED]: { label: 'Removed', symbol: '−', cls: 'border-red-800 bg-red-950 text-red-200' },
  [DIFF.UNCHANGED]: { label: 'Unchanged', symbol: '=', cls: 'border-slate-700 bg-slate-900 text-slate-300' },
};

function show(value) {
  if (value === undefined) return '—';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > 90 ? `${text.slice(0, 40)}…${text.slice(-12)}` : text;
}

function Row({ row }) {
  const style = DIFF_STYLE[row.status];
  return (
    <li className={`rounded border p-2 text-xs ${style.cls}`} data-testid={`diff-${row.path}`} data-status={row.status}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono font-semibold">{style.symbol} {row.path}</span>
        <span className="rounded bg-white/10 px-1.5 py-0.5">{style.label}</span>
      </div>
      {row.status === DIFF.CHANGED && (
        <div className="mt-1 space-y-0.5 break-all font-mono">
          {row.addedItems || row.removedItems ? (
            <>
              {row.addedItems?.length > 0 && <p>+ added: {row.addedItems.join(', ')}</p>}
              {row.removedItems?.length > 0 && <p>− removed: {row.removedItems.join(', ')}</p>}
            </>
          ) : (
            <>
              <p>before: {show(row.before)}</p>
              <p>after: {show(row.after)}</p>
            </>
          )}
        </div>
      )}
      {row.status === DIFF.ADDED && <p className="mt-1 break-all font-mono">value: {show(row.after)}</p>}
      {row.status === DIFF.REMOVED && <p className="mt-1 break-all font-mono">was: {show(row.before)}</p>}
    </li>
  );
}

/** Side-by-side signal comparison of two saved snapshots (earlier vs later). */
export default function ComparisonView({ first, second, onClose }) {
  const [showUnchanged, setShowUnchanged] = useState(false);
  const result = compareSnapshots(first, second);

  // Move focus to the result when it appears, so keyboard and screen-reader users land on it.
  useEffect(() => {
    document.getElementById('comparison')?.focus();
  }, []);
  const rows = result.rows.filter((r) => showUnchanged || r.status !== DIFF.UNCHANGED);

  return (
    <Card
      id="comparison"
      focusable
      title="Snapshot comparison"
      subtitle={`Earlier: ${formatTimestamp(result.older.savedAt)} (${shortHash(result.older.hash)}) → Later: ${formatTimestamp(result.newer.savedAt)} (${shortHash(result.newer.hash)})`}
      actions={<button type="button" className="text-sm text-cyan-300 underline" onClick={onClose}>Close comparison</button>}
    >
      <div className="space-y-3">
        <p className="text-sm text-slate-200" role="status" data-testid="hash-verdict">
          {result.sameHash
            ? 'The configuration hashes are identical.'
            : 'The configuration hashes differ, so at least one stable signal changed (or a signal was unavailable in one run).'}
        </p>

        <ul className="flex flex-wrap gap-2" aria-label="Difference summary">
          {Object.values(DIFF).map((status) => (
            <li key={status} className={`rounded border px-2 py-1 text-xs ${DIFF_STYLE[status].cls}`} data-testid={`count-${status}`}>
              {DIFF_STYLE[status].symbol} {DIFF_STYLE[status].label}: {result.counts[status]}
            </li>
          ))}
        </ul>

        {result.versionMismatch && (
          <p role="alert" className="rounded border border-amber-800 bg-amber-950 p-2 text-xs text-amber-200" data-testid="version-mismatch">
            These snapshots were built from different hash-input versions ({result.older.hashInputVersion ?? 'unknown'} and {result.newer.hashInputVersion ?? 'unknown'}), so their hashes are not comparable and are not reported as identical. Compare the attributes below instead.
          </p>
        )}

        <AttributeChanges
          attributes={compareAttributes(result.older.signals, result.newer.signals)}
          relationNote={describeSessionRelation(result.older.observation, result.newer.observation)}
        />

        <CategoryDiffBars summary={summariseByCategory(result.rows)} />

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => downloadText(`comparison-${stamp(result)}.html`, buildComparisonReport({ comparison: result }), 'text/html')}>Download comparison report (HTML)</Button>
          <Button onClick={() => downloadText(`comparison-${stamp(result)}.json`, JSON.stringify(exportable(result), null, 2))}>Download comparison data (JSON)</Button>
        </div>

        <label className="flex items-center gap-2 text-xs text-slate-300">
          <input type="checkbox" className="accent-cyan-400" checked={showUnchanged} onChange={(e) => setShowUnchanged(e.target.checked)} />
          Show unchanged signals
        </label>

        {rows.length === 0 ? (
          <p className="text-sm text-slate-400">No differences to show.</p>
        ) : (
          <ul className="space-y-2">{rows.map((row) => <Row key={row.path} row={row} />)}</ul>
        )}
      </div>
    </Card>
  );
}
