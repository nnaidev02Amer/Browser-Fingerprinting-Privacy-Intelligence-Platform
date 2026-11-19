import { ATTR, countStates } from '../utils/attributes';
import { EvidenceBadges } from './Evidence';
import { Pill } from './ui';

const STATE_STYLE = {
  [ATTR.UNCHANGED]: { label: 'Unchanged', tone: 'emerald' },
  [ATTR.CHANGED]: { label: 'Changed', tone: 'amber' },
  [ATTR.LOST]: { label: 'Lost', tone: 'rose' },
  [ATTR.GAINED]: { label: 'Gained', tone: 'cyan' },
  [ATTR.UNAVAILABLE]: { label: 'Unavailable in both', tone: 'neutral' },
  [ATTR.STATUS_CHANGED]: { label: 'Status changed', tone: 'neutral' },
};

/**
 * Attribute-level view of a comparison: one row per attribute (WebGL counts once, not once per field),
 * with what the state means for tracking. The composite identifier is listed but not counted.
 * Every row is MEASURED from the two observations; the implication text states possibilities only.
 */
export default function AttributeChanges({ attributes, relationNote }) {
  const counts = countStates(attributes);
  return (
    <div className="space-y-3" data-testid="attribute-changes">
      <div className="flex flex-wrap items-center gap-2">
        <EvidenceBadges kinds={['measured']} />
        {Object.entries(counts).filter(([, n]) => n > 0).map(([state, n]) => (
          <Pill key={state} tone={STATE_STYLE[state].tone}>{STATE_STYLE[state].label}: {n}</Pill>
        ))}
      </div>
      {relationNote && <p className="text-xs leading-relaxed text-slate-400" data-testid="session-relation">{relationNote}</p>}
      <ul className="space-y-2">
        {attributes.map((a) => (
          <li key={a.id} className="rounded-lg border border-slate-700/70 bg-slate-950/60 p-3 text-sm" data-testid={`attribute-${a.id}`} data-state={a.state}>
            <p className="flex flex-wrap items-center gap-2 font-medium text-slate-100">
              {a.label}
              <Pill tone={STATE_STYLE[a.state].tone}>{STATE_STYLE[a.state].label}</Pill>
              {a.derived && <Pill>Derived, not counted</Pill>}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-slate-300">{a.implication}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
