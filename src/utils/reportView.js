import { STATUS } from '../collectors/runner';

/**
 * Read one collector's outcome from a report.
 * @returns {{status: string, reason: string|null, data: object|null, durationMs: number|null}}
 *   `data` is non-null only when the collector succeeded.
 */
export function selectCollector(report, id) {
  const diag = report?.diagnostics?.find((d) => d.id === id);
  if (!diag) return { status: STATUS.DISABLED, reason: 'Not collected', data: null, durationMs: null };
  const data = diag.status === STATUS.OK ? (report.details[id] ?? report.volatile[id] ?? null) : null;
  return { status: diag.status, reason: diag.reason ?? null, data, durationMs: diag.durationMs };
}

/** Counts of collectors by status, for the overview. */
export function countStatuses(report) {
  const counts = { ok: 0, unsupported: 0, timeout: 0, error: 0, disabled: 0 };
  for (const d of report?.diagnostics ?? []) counts[d.status] = (counts[d.status] ?? 0) + 1;
  return counts;
}

export function formatValue(value) {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.length ? value.join(', ') : '—';
  return String(value);
}

export function shortHash(hash, length = 12) {
  return hash ? `${hash.slice(0, length)}…${hash.slice(-4)}` : 'unavailable';
}

export function formatTimestamp(iso) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? 'unknown time' : date.toLocaleString();
}
