import { CompositionBar } from '../components/charts';
import { HashCard } from '../components/ReportSections';
import { Button, Card, EmptyState, PageHeader, Pill, StatusBadge } from '../components/ui';
import { EXPOSURE_CLASSES, SIGNALS } from '../config/signalCatalog';
import { buildComposition } from '../utils/composition';

const EXPOSURE_TONE = { shared: 'neutral', narrows: 'cyan', reveals: 'amber' };

function SignalDetail({ signal }) {
  const meta = SIGNALS[signal.id];
  return (
    <details className="group rounded-lg border border-slate-700/70 bg-slate-950/60 open:bg-slate-950" data-testid={`signal-${signal.id}`}>
      <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">
        <span className="font-medium">{signal.label}</span>
        <StatusBadge status={signal.status} />
        <Pill tone={meta.stable ? 'cyan' : 'neutral'}>{meta.stable ? 'Stable' : 'Variable'}</Pill>
        {signal.inHash && <Pill tone="emerald">In hash</Pill>}
        <span className="sr-only"> (expand for details)</span>
      </summary>
      <div className="space-y-2 border-t border-slate-700/70 px-3 py-3 text-sm leading-relaxed text-slate-300">
        <p><span className="font-semibold text-slate-100">What it exposes: </span>{meta.exposes}</p>
        <p><span className="font-semibold text-slate-100">How it helps identify a browser setup: </span>{meta.identifies}</p>
        {meta.stable ? (
          <>
            <p><span className="font-semibold text-slate-100">Hashed: </span>{meta.hashed}</p>
            <p><span className="font-semibold text-slate-100">Not hashed: </span>{meta.excluded}</p>
          </>
        ) : (
          <p><span className="font-semibold text-slate-100">Hashing: </span>Reported separately and never part of the configuration hash, because it changes between visits.</p>
        )}
        <p><span className="font-semibold text-slate-100">Changes when: </span>{meta.changesWhen.join('; ')}.</p>
        <p className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-slate-100">Exposure group:</span>
          <Pill tone={EXPOSURE_TONE[meta.exposureClass]}>{EXPOSURE_CLASSES[meta.exposureClass].label}</Pill>
          <span className="text-xs text-slate-400">{EXPOSURE_CLASSES[meta.exposureClass].meaning}</span>
        </p>
        {signal.status !== 'ok' && <p className="text-amber-200">In this run: {signal.status === 'disabled' ? 'not collected (consent not granted).' : `${signal.status}${signal.reason ? `: ${signal.reason}` : ''}.`}</p>}
      </div>
    </details>
  );
}

/** Fingerprint intelligence: what the fingerprint is made of and what each signal contributes. */
export default function FingerprintView({ report, onCollect }) {
  if (!report) {
    return (
      <div className="motion-view space-y-4">
        <PageHeader title="Fingerprint" subtitle="The details behind your fingerprint hash. Open any item to see what it shows, why it matters and when it changes." />
        <EmptyState title="No fingerprint collected yet" action={<Button variant="primary" onClick={onCollect}>Collect fingerprint</Button>}>
          Press Collect fingerprint to see what your browser shares and how each detail is used.
        </EmptyState>
      </div>
    );
  }

  const composition = buildComposition(report);
  const stable = composition.signals.filter((s) => s.stable);
  const variable = composition.signals.filter((s) => !s.stable);

  return (
    <div className="motion-view space-y-4">
      <PageHeader title="Fingerprint" subtitle="The details behind your fingerprint hash. Open any item to see what it shows, why it matters and when it changes." />

      <HashCard report={report} />

      <Card id="composition" title="Hash composition" subtitle={`${composition.totals.stableCollected} of ${composition.totals.stableSignals} stable signals were collected. Each segment is the number of signals from that category that feed the hash.`}>
        <CompositionBar groups={composition.groups} />
        <p className="mt-3 text-xs leading-relaxed text-slate-400">
          Segment size shows how many signals a category contributes, not how revealing it is. Signals combine into one hash: if any hashed signal changes, the whole hash changes.
        </p>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {composition.groups.map((g) => (
          <Card key={g.category.id} id={`group-${g.category.id}`} title={g.category.label} subtitle={`${g.collected} of ${g.total} collected${g.stableTotal ? ` · ${g.inHash} in hash` : ''}`}>
            <ul className="space-y-2">
              {g.signals.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-2 text-sm text-slate-200">
                  <span aria-hidden="true" className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: g.category.color }} />
                  <span className="min-w-0 flex-1">{s.label}</span>
                  <StatusBadge status={s.status} />
                  <Pill tone={s.stable ? 'cyan' : 'neutral'}>{s.stable ? 'Stable' : 'Variable'}</Pill>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card id="stable-signals" title="Stable signals (feed the hash)" subtitle="Expected to repeat on every visit from the same browser setup.">
          <ul className="space-y-3 text-sm">
            {stable.map((s) => (
              <li key={s.id}>
                <p className="flex flex-wrap items-center gap-2 font-medium text-slate-100">{s.label} <StatusBadge status={s.status} /></p>
                <p className="text-xs leading-relaxed text-slate-400">Hashed: {SIGNALS[s.id].hashed}</p>
              </li>
            ))}
          </ul>
        </Card>
        <Card id="variable-signals" title="Variable signals (never hashed)" subtitle="Change between visits, or only when you opt in. They are reported but kept out of the hash.">
          <ul className="space-y-3 text-sm">
            {variable.map((s) => (
              <li key={s.id}>
                <p className="flex flex-wrap items-center gap-2 font-medium text-slate-100">{s.label} <StatusBadge status={s.status} /></p>
                <p className="text-xs leading-relaxed text-slate-400">{SIGNALS[s.id].exposes}</p>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs leading-relaxed text-slate-400">Also never hashed: timestamps, session IDs, exact browser versions, zoom, window size and UTC offset.</p>
        </Card>
      </div>

      <Card id="signal-details" title="How each signal contributes" subtitle="Expand a signal for what it exposes, what is and is not hashed, and why it changes.">
        <div className="space-y-2">
          {[...stable, ...variable].map((s) => <SignalDetail key={s.id} signal={s} />)}
        </div>
      </Card>
    </div>
  );
}
