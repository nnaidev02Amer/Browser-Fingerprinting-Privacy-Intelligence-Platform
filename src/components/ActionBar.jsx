import { Button } from './ui';

/**
 * Global actions. "Collect" becomes "Refresh" once a result exists; refreshing
 * re-runs every collector using the consent choices that are current right now.
 */
export default function ActionBar({ hasReport, collecting, progress, behavioralOn, onCollect, onCopy, onDownload, onSave, notice }) {
  const percent = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={onCollect} disabled={collecting}>
          {collecting ? 'Collecting…' : hasReport ? 'Refresh' : 'Collect fingerprint'}
        </Button>
        <Button onClick={onCopy} disabled={!hasReport || collecting}>Copy JSON</Button>
        <Button onClick={onDownload} disabled={!hasReport || collecting}>Download JSON</Button>
        <Button onClick={onSave} disabled={!hasReport || collecting}>Save snapshot</Button>
      </div>

      {behavioralOn && (
        // Uncontrolled on purpose: nothing ever reads what is typed. Only key
        // timing is measured (by the behavioural hook), never the text.
        <input
          type="text"
          data-testid="typing-box"
          autoComplete="off"
          spellCheck={false}
          aria-label="Typing area for keystroke timing. The text is not stored."
          placeholder="Optional: type here to measure keystroke timing (the text is not stored)"
          className="w-full max-w-md rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
        />
      )}

      {collecting && (
        <div role="status" aria-live="polite" className="text-xs text-slate-400">
          <div className="mb-1.5 h-2 w-full max-w-md overflow-hidden rounded bg-slate-700">
            <div className="h-full rounded bg-cyan-500 transition-[width] duration-200" style={{ width: `${percent}%` }} />
          </div>
          Running collectors: {progress.done} of {progress.total} finished
        </div>
      )}

      {notice && (
        <p
          role={notice.type === 'error' ? 'alert' : 'status'}
          className={`text-xs ${notice.type === 'error' ? 'text-red-300' : 'text-emerald-300'}`}
        >
          {notice.text}
        </p>
      )}
    </div>
  );
}
