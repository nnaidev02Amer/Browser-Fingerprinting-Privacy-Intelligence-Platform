import { categoryOfPath } from '../config/signalCatalog';

/** Count comparison rows per category and status (changed / added / removed / unchanged). */
export function summariseByCategory(rows) {
  const out = {};
  for (const row of rows) {
    const category = categoryOfPath(row.path);
    out[category] ??= { changed: 0, added: 0, removed: 0, unchanged: 0 };
    out[category][row.status] += 1;
  }
  return out;
}

/** Number of differing signals in a category summary (changed + added + removed). */
export const differing = (counts) => counts.changed + counts.added + counts.removed;
