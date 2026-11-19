import { EVIDENCE_KINDS, SOURCES, SOURCES_ACCESSED } from '../config/sources';
import { Pill } from './ui';

const TONE = { observed: 'cyan', measured: 'cyan', experiment: 'emerald', documented: 'neutral' };

/** Labels what a statement rests on. Text always accompanies the colour. */
export function EvidenceBadges({ kinds }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      {kinds.map((k) => <Pill key={k} tone={TONE[k] ?? 'neutral'}>{EVIDENCE_KINDS[k]?.label ?? k}</Pill>)}
    </span>
  );
}

/** Citations for the given source ids, with the date they were retrieved. */
export function SourceList({ ids }) {
  const list = ids.map((id) => SOURCES[id]).filter(Boolean);
  if (!list.length) return null;
  return (
    <ul className="mt-1 space-y-0.5 text-xs text-slate-400" aria-label="Sources">
      {list.map((s) => (
        <li key={s.id}>
          Source: {s.title}, {s.publisher}. <span className="break-all font-mono">{s.url}</span> (retrieved {s.retrieved ?? SOURCES_ACCESSED})
        </li>
      ))}
    </ul>
  );
}
