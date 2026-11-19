export const PROJECT_NAME = 'Browser Fingerprinting & Privacy Intelligence Platform';

/** Navigation. Labels "Overview", "History" and "Privacy & consent" are relied on by tests and docs. */
export const NAV = [
  { id: 'overview', label: 'Overview', icon: 'M3 12l9-8 9 8M5 10v10h5v-6h4v6h5V10' },
  { id: 'fingerprint', label: 'Fingerprint', icon: 'M12 3a7 7 0 00-7 7v3m14 0v-3a7 7 0 00-7-7m0 6a3 3 0 00-3 3v6m6-9v3a8 8 0 01-1 4M8 14v2a8 8 0 002 5' },
  { id: 'exposure', label: 'Privacy risks', icon: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zm10 3a3 3 0 100-6 3 3 0 000 6z' },
  { id: 'lab', group: 'experiments', label: 'Laboratory', icon: 'M9 3h6M10 3v6l-5 9a2 2 0 002 3h10a2 2 0 002-3l-5-9V3' },
  { id: 'protection', group: 'experiments', label: 'Protection test', icon: 'M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3zM8 12h8M12 8v8' },
  { id: 'history', label: 'History', icon: 'M12 7v5l3 2M3 12a9 9 0 109-9 9 9 0 00-7 3M3 4v4h4' },
  { id: 'reports', label: 'Reports', icon: 'M7 3h8l4 4v14H7zM15 3v4h4M10 12h6M10 16h6' },
  { id: 'privacy', label: 'Privacy & consent', icon: 'M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3zM9 12l2 2 4-4' },
];

export const NAV_GROUP_LABELS = { experiments: 'Experiments' };

/**
 * NAV grouped for display. The flat order of NAV is unchanged; consecutive items that share a `group` are
 * shown under one heading (Laboratory and Protection test under "Experiments").
 */
export function navSections(items = NAV) {
  const sections = [];
  for (const item of items) {
    const last = sections[sections.length - 1];
    if (item.group && last && last.group === item.group) last.items.push(item);
    else sections.push({ group: item.group ?? null, label: item.group ? NAV_GROUP_LABELS[item.group] : null, items: [item] });
  }
  return sections;
}
