import { SIGNALS } from '../config/signalCatalog';
import { ROLE, ROLE_TEXT, analyzeDistinguishability } from '../utils/distinguishability';
import { EvidenceBadges } from './Evidence';
import { PlainBox } from './Guidance';
import { Card, Pill } from './ui';

const ROLE_TONE = { [ROLE.DISTINGUISHES]: 'cyan', [ROLE.SHARED]: 'neutral', [ROLE.UNSTABLE]: 'amber', [ROLE.UNREADABLE]: 'neutral', [ROLE.INSUFFICIENT]: 'neutral' };
const ROLE_LABEL = { [ROLE.DISTINGUISHES]: 'Tells setups apart', [ROLE.SHARED]: 'Same in every setup', [ROLE.UNSTABLE]: 'Changes by itself', [ROLE.UNREADABLE]: 'Not readable', [ROLE.INSUFFICIENT]: 'Not enough data yet' };

/**
 * "Which details could tell my setups apart?" Qualitative, from the runs the user recorded. A "setup" is a
 * named way of running the browser; runs with the same name are repeat runs of the same setup.
 * No percentages, entropy or rarity: it only describes the user's own setups.
 */
export default function DistinguishabilityPanel({ observations }) {
  const d = analyzeDistinguishability(observations);

  return (
    <Card id="distinguishability" title="Which details could tell my setups apart?" actions={<EvidenceBadges kinds={['measured']} />}
      subtitle="Uses only the runs you recorded. A setup is a way you ran your browser, for example Baseline, or Baseline with one setting changed.">
      {!d.hasData ? (
        <p className="text-sm text-slate-400" data-testid="distinct-empty">No setups yet. Record some runs first.</p>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-300" data-testid="distinct-summary">
            {d.configs.length} setup{d.configs.length === 1 ? '' : 's'} ({d.configs.map((c) => `${c.label}: ${c.sessions} run${c.sessions === 1 ? '' : 's'}`).join('; ')}).
            {d.sufficient && ` ${d.counts[ROLE.DISTINGUISHES]} detail(s) tell them apart, ${d.counts[ROLE.SHARED]} are the same in all of them, ${d.counts[ROLE.UNSTABLE]} change by themselves.`}
          </p>

          {!d.sufficient ? (
            <p className="text-sm text-slate-400" data-testid="distinct-insufficient">
              Not enough data yet. Record at least two different setups, and at least two runs of one of them, so we can tell a real difference from normal variation.
            </p>
          ) : (
            <>
              <PlainBox testId="distinct-plain">
                <p>
                  {d.separatingSet.length
                    ? `To tell your setups apart, a website would only need to look at: ${d.separatingSet.map((id) => SIGNALS[id].label).join(', ')}.`
                    : 'None of the details we measure could tell these setups apart.'}
                </p>
                <p className="text-slate-400">This only describes your own setups. It does not say how common or rare any detail is among other people.</p>
              </PlainBox>

              <div className="rounded-lg border border-slate-700/70 bg-slate-950/60 p-3 text-sm leading-relaxed text-slate-300" data-testid="distinct-v2">
                <p className="font-medium text-slate-100">The detail</p>
                <p className="mt-1" data-testid="distinct-set">
                  {d.separatingSet.length
                    ? `A small set of ${d.separatingSet.length} attribute(s) separated every pair that could be separated: ${d.separatingSet.map((id) => SIGNALS[id].label).join(', ')}. The set is found step by step and is not guaranteed to be the smallest possible.`
                    : 'No measured attribute separated any pair of setups.'}
                </p>
                {d.interchangeable.length > 0 && (
                  <p className="mt-1" data-testid="distinct-interchangeable">Interchangeable here (they separated exactly the same pairs): {d.interchangeable.map((g) => g.map((id) => SIGNALS[id].label).join(' and ')).join('; ')}.</p>
                )}
                {d.inseparablePairs.length > 0 && (
                  <p className="mt-1" data-testid="distinct-inseparable">No measured detail separates: {d.inseparablePairs.map(([a, b]) => `${a} and ${b}`).join('; ')}.</p>
                )}
                <p className="mt-2 text-xs text-slate-400">This says nothing about how rare any value is among other users.</p>
              </div>
            </>
          )}

          <ul className="space-y-2" data-testid="distinct-attributes">
            {d.attributes.map((a) => (
              <li key={a.id} className="rounded-lg border border-slate-700/70 bg-slate-950/60 p-3 text-sm" data-testid={`distinct-${a.id}`} data-role={a.role}>
                <p className="flex flex-wrap items-center gap-2 font-medium text-slate-100">{a.label}<Pill tone={ROLE_TONE[a.role]}>{ROLE_LABEL[a.role]}</Pill></p>
                <p className="mt-1 text-xs leading-relaxed text-slate-300">{ROLE_TEXT[a.role]}</p>
              </li>
            ))}
          </ul>

          {d.pairs.length > 0 && (
            <ul className="space-y-1 text-sm text-slate-300" data-testid="distinct-pairs">
              {d.pairs.map((p) => (
                <li key={`${p.a}|${p.b}`}>{p.a} vs {p.b}: {p.indistinguishable ? 'no measured detail tells these two apart' : `${p.differing.length} detail(s) differ (${p.differing.map((id) => SIGNALS[id].label).join(', ')})`}.</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}
