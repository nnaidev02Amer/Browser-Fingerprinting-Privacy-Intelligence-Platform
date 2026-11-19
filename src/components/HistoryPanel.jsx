import { useEffect, useRef, useState } from 'react';
import { MAX_SNAPSHOTS } from '../services/historyStore';
import { formatTimestamp, shortHash } from '../utils/reportView';
import ComparisonView from './ComparisonView';
import { Button, Card } from './ui';

const ERROR_TEXT = {
  limit: `History limit reached (${MAX_SNAPSHOTS} snapshots). Delete a snapshot to save a new one.`,
  quota: 'Browser storage is full. Delete some snapshots and try again.',
  unavailable: 'Browser storage is unavailable, so snapshots cannot be saved.',
  other: 'The snapshot could not be saved.',
};

function SnapshotItem({ snapshot, selected, expanded, onSelect, onToggle, onDelete }) {
  const { summary } = snapshot;
  const description = [summary.browser, summary.os, summary.screen].filter(Boolean).join(' · ');

  return (
    <li className="rounded-lg border border-slate-700 bg-slate-950 p-3" data-testid="snapshot-item">
      <div className="flex flex-wrap items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 accent-cyan-400"
          checked={selected}
          onChange={onSelect}
          aria-label={`Select snapshot from ${formatTimestamp(snapshot.savedAt)} for comparison`}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-100">{formatTimestamp(snapshot.savedAt)}</p>
          <p className="break-all font-mono text-xs text-cyan-200">{snapshot.hash ? shortHash(snapshot.hash, 20) : 'No hash (SHA-256 unavailable)'}</p>
          {description && <p className="mt-1 text-xs text-slate-400">{description}</p>}
          {snapshot.incomplete && <p className="mt-1 text-xs text-amber-300">Saved with some signals unavailable.</p>}
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-label={`${expanded ? 'Hide' : 'View'} snapshot from ${formatTimestamp(snapshot.savedAt)}`}
          >
            {expanded ? 'Hide' : 'View'}
          </Button>
          <Button variant="ghost" onClick={onDelete} aria-label={`Delete snapshot from ${formatTimestamp(snapshot.savedAt)}`}>Delete</Button>
        </div>
      </div>
      {expanded && (
        <pre tabIndex={0} className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded bg-slate-900 p-3 text-xs text-slate-200" data-testid="snapshot-json">
          {JSON.stringify({ hash: snapshot.hash, hashInputVersion: snapshot.hashInputVersion, signals: snapshot.signals }, null, 2)}
        </pre>
      )}
    </li>
  );
}

/** Saved snapshots: view, select two to compare, delete one, or clear everything (with confirmation). */
export default function HistoryPanel({ history }) {
  const { snapshots, status, dropped, error, remove, clear } = history;
  const [selected, setSelected] = useState([]); // snapshot ids, at most 2
  const [expandedId, setExpandedId] = useState(null);
  const [comparing, setComparing] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);

  // Focus management: the buttons that opened/closed these views unmount, which would drop
  // keyboard focus to <body>. Put it on the least destructive button when the dialog opens,
  // and back on a sensible element when it closes or an item is removed.
  const cancelRef = useRef(null);
  const clearButtonRef = useRef(null);
  const wasConfirming = useRef(false);
  const focusPanel = () => document.getElementById('history')?.focus();
  useEffect(() => {
    if (confirmingClear) cancelRef.current?.focus();
    else if (wasConfirming.current) (clearButtonRef.current ?? document.getElementById('history'))?.focus();
    wasConfirming.current = confirmingClear;
  }, [confirmingClear]);

  const ids = new Set(snapshots.map((s) => s.id));
  const activeSelection = selected.filter((id) => ids.has(id)); // drop ids of deleted snapshots
  const pair = activeSelection.map((id) => snapshots.find((s) => s.id === id));

  const toggleSelect = (id) => {
    setComparing(false);
    setSelected((prev) => {
      const current = prev.filter((x) => ids.has(x));
      if (current.includes(id)) return current.filter((x) => x !== id);
      return [...current, id].slice(-2); // keep the two most recent picks
    });
  };

  return (
    <div className="space-y-4">
      <Card
        id="history"
        focusable
        title="Local history"
        subtitle={`${snapshots.length} of ${MAX_SNAPSHOTS} snapshots saved`}
        actions={
          snapshots.length > 0 && !confirmingClear && (
            <Button ref={clearButtonRef} variant="secondary" onClick={() => setConfirmingClear(true)}>Clear all history</Button>
          )
        }
      >
        <p className="mb-3 rounded border border-slate-700 bg-slate-950 p-2 text-xs text-slate-400">
          History is stored only in this browser (localStorage) and is never uploaded. A snapshot keeps the stable
          signals behind the hash plus a short environment summary. IP address, location, behavioural data, battery
          and permissions are never saved. Collect a fingerprint, then choose <strong>Save snapshot</strong>.
        </p>

        {confirmingClear && (
          <div
            role="alertdialog"
            aria-label="Confirm clearing history"
            onKeyDown={(e) => { if (e.key === 'Escape') setConfirmingClear(false); }}
            className="mb-3 rounded border border-red-800 bg-red-950 p-3 text-sm text-red-100"
          >
            <p>Delete all {snapshots.length} saved snapshots from this browser? This cannot be undone.</p>
            <div className="mt-2 flex gap-2">
              <Button variant="danger" onClick={() => { clear(); setConfirmingClear(false); setSelected([]); setComparing(false); }}>
                Yes, delete everything
              </Button>
              <Button ref={cancelRef} onClick={() => setConfirmingClear(false)}>Cancel</Button>
            </div>
          </div>
        )}

        {error && <p className="mb-3 text-sm text-red-300" role="alert">{ERROR_TEXT[error] ?? ERROR_TEXT.other}</p>}
        {status === 'corrupted' && (
          <div className="mb-3 rounded border border-amber-800 bg-amber-950 p-3 text-sm text-amber-100" role="alert">
            <p>The saved history could not be read (the stored data is corrupted).</p>
            <Button className="mt-2" onClick={() => { clear(); focusPanel(); }}>Reset history</Button>
          </div>
        )}
        {status === 'unavailable' && (
          <p className="mb-3 text-sm text-amber-200" role="alert">Browser storage is unavailable. History cannot be saved or loaded.</p>
        )}
        {dropped > 0 && (
          <p className="mb-3 text-xs text-amber-300" role="status">{dropped} unreadable snapshot(s) were skipped.</p>
        )}

        {snapshots.length === 0 ? (
          <p className="text-sm text-slate-400" data-testid="history-empty">No snapshots saved yet.</p>
        ) : (
          <>
            <ul className="space-y-2">
              {snapshots.map((snapshot) => (
                <SnapshotItem
                  key={snapshot.id}
                  snapshot={snapshot}
                  selected={activeSelection.includes(snapshot.id)}
                  expanded={expandedId === snapshot.id}
                  onSelect={() => toggleSelect(snapshot.id)}
                  onToggle={() => setExpandedId(expandedId === snapshot.id ? null : snapshot.id)}
                  onDelete={() => { remove(snapshot.id); focusPanel(); }}
                />
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button variant="primary" disabled={activeSelection.length !== 2} onClick={() => setComparing(true)}>
                Compare selected
              </Button>
              <span className="text-xs text-slate-400">
                {activeSelection.length === 2 ? 'Two snapshots selected.' : `Select two snapshots to compare (${activeSelection.length}/2).`}
              </span>
            </div>
          </>
        )}
      </Card>

      {comparing && pair.length === 2 && <ComparisonView first={pair[0]} second={pair[1]} onClose={() => setComparing(false)} />}
    </div>
  );
}
