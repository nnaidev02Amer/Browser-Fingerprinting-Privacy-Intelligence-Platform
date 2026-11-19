import { CATEGORIES } from '../config/signalCatalog';

/**
 * Small dependency-free charts. Every chart renders only the data it is given (never placeholders), pairs
 * colour with text, and offers a text alternative (legend, counts or an accessible label).
 */

/** Segmented bar: how many stable signals per category feed the hash. */
export function CompositionBar({ groups }) {
  const parts = groups.filter((g) => g.inHash > 0);
  const total = parts.reduce((n, g) => n + g.inHash, 0);
  if (!total) return <p className="text-sm text-slate-400">No stable signals were collected, so nothing feeds the hash.</p>;

  return (
    <div>
      <div
        role="img"
        aria-label={`Hash composition: ${parts.map((g) => `${g.category.short} ${g.inHash}`).join(', ')}`}
        className="flex h-4 w-full overflow-hidden rounded-md border border-slate-700"
      >
        {parts.map((g) => (
          <div key={g.category.id} className="motion-grow-x h-full" style={{ width: `${(g.inHash / total) * 100}%`, backgroundColor: g.category.color }} title={`${g.category.label}: ${g.inHash}`} />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-300">
        {parts.map((g) => (
          <li key={g.category.id} className="flex items-center gap-1.5">
            <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: g.category.color }} />
            {g.category.short} <span className="tabular-nums text-slate-400">{g.inHash}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const STATUS_COLORS = { ok: '#7fbf8a', unsupported: '#8a9087', timeout: '#d9a441', error: '#d4675d', disabled: '#3a3e3a' };
const STATUS_NAMES = { ok: 'Collected', unsupported: 'Unsupported', timeout: 'Timed out', error: 'Failed', disabled: 'Disabled' };

/** Donut of collector outcomes for the latest run. */
export function StatusDonut({ counts }) {
  const entries = Object.keys(STATUS_NAMES).map((k) => [k, counts[k] ?? 0]).filter(([, n]) => n > 0);
  const total = entries.reduce((n, [, c]) => n + c, 0);
  if (!total) return null;

  let offset = 25; // start at 12 o'clock
  return (
    <div className="flex flex-wrap items-center gap-5">
      <svg viewBox="0 0 36 36" className="h-28 w-28 shrink-0" role="img" aria-label={`Collector results: ${entries.map(([k, n]) => `${n} ${STATUS_NAMES[k].toLowerCase()}`).join(', ')}`}>
        <circle cx="18" cy="18" r="15.9155" fill="none" stroke="#1e211f" strokeWidth="4" />
        {entries.map(([k, n]) => {
          const pct = (n / total) * 100;
          const el = <circle key={k} cx="18" cy="18" r="15.9155" fill="none" stroke={STATUS_COLORS[k]} strokeWidth="4" strokeDasharray={`${pct} ${100 - pct}`} strokeDashoffset={offset} />;
          offset -= pct;
          return el;
        })}
        <text x="18" y="19.5" textAnchor="middle" className="fill-slate-50" style={{ font: '600 7px system-ui' }}>{total}</text>
      </svg>
      <ul className="space-y-1 text-sm text-slate-200">
        {entries.map(([k, n]) => (
          <li key={k} className="flex items-center gap-2">
            <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: STATUS_COLORS[k] }} />
            {STATUS_NAMES[k]} <span className="tabular-nums text-slate-400">{n}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const DIFF_COLORS = { changed: '#d9a441', added: '#7fbf8a', removed: '#d4675d', unchanged: '#3a3e3a' };

/** Per-category stacked bars for one comparison: changed / added / removed / unchanged signal counts. */
export function CategoryDiffBars({ summary }) {
  const rows = CATEGORIES.filter((c) => summary[c.id]);
  if (!rows.length) return null;
  return (
    <ul className="space-y-3" aria-label="Differences by category">
      {rows.map((c) => {
        const s = summary[c.id];
        const total = s.changed + s.added + s.removed + s.unchanged;
        return (
          <li key={c.id} data-testid={`category-diff-${c.id}`}>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="flex items-center gap-2 text-slate-100"><span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: c.color }} />{c.label}</span>
              <span className="text-xs tabular-nums text-slate-400">
                {s.changed} changed · {s.added} added · {s.removed} removed · {s.unchanged} unchanged
              </span>
            </div>
            <div className="mt-1 flex h-2 overflow-hidden rounded bg-slate-800" role="img" aria-label={`${c.label}: ${s.changed} changed, ${s.added} added, ${s.removed} removed, ${s.unchanged} unchanged`}>
              {['changed', 'added', 'removed', 'unchanged'].map((k) => (s[k] ? <div key={k} className="motion-grow-x h-full" style={{ width: `${(s[k] / total) * 100}%`, backgroundColor: DIFF_COLORS[k] }} /> : null))}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
