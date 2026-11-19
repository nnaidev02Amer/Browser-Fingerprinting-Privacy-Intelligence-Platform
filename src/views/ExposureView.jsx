import { EvidenceBadges, SourceList } from '../components/Evidence';
import { Button, Card, EmptyState, PageHeader, Pill, StatTile } from '../components/ui';
import { SOURCES } from '../config/sources';
import { CATEGORY_BY_ID, EXPOSURE_CLASSES, EXPOSURE_RUBRIC_NOTE } from '../config/signalCatalog';
import { NextSteps, PlainBox } from '../components/Guidance';
import { analyzeExposure } from '../utils/privacyAnalysis';

const TONE = { shared: 'neutral', narrows: 'cyan', reveals: 'amber' };
const OBSERVATION_LABEL = { protective: 'Protective', notable: 'Notable', neutral: 'Info' };
const OBSERVATION_TONE = { protective: 'emerald', notable: 'amber', neutral: 'neutral' };

function SignalRow({ signal }) {
  return (
    <li className="rounded-lg border border-slate-700/70 bg-slate-950/60 p-3 text-sm" data-testid={`exposure-${signal.id}`}>
      <p className="flex flex-wrap items-center gap-2 font-medium text-slate-100">
        <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: CATEGORY_BY_ID[signal.category].color }} />
        {signal.label}
        <Pill tone={TONE[signal.exposureClass]}>{signal.exposureLabel}</Pill>
      </p>
      <p className="mt-1.5 leading-relaxed text-slate-300"><span className="text-slate-400">Exposes: </span>{signal.exposes}</p>
      <p className="mt-1 leading-relaxed text-slate-300"><span className="text-slate-400">Why it matters: </span>{signal.identifies}</p>
    </li>
  );
}

/** Privacy exposure: explained in plain language, from what was actually collected. */
export default function ExposureView({ report, onCollect, onNavigate, experiments = [] }) {
  const analysis = analyzeExposure(report, { experiments });

  if (!analysis) {
    return (
      <div className="motion-view space-y-4">
        <PageHeader title="Privacy risks" subtitle="What your browser reveals, which details could help a website recognise you, and what you can do about it." />
        <EmptyState title="Nothing to analyse yet" action={<Button variant="primary" onClick={onCollect}>Collect fingerprint</Button>}>
          Collect a fingerprint first. This page only talks about details that were really collected from your browser.
        </EmptyState>
      </div>
    );
  }

  const byClass = (cls) => analysis.signals.filter((s) => s.exposureClass === cls);
  const enabledCount = analysis.optional.filter((o) => o.enabled).length;

  return (
    <div className="motion-view space-y-4">
      <PageHeader title="Privacy risks" subtitle="What your browser reveals, which details could help a website recognise you, and what you can do about it." />

      <PlainBox testId="exposure-plain">
        <p>Websites can read many small details from your browser. One detail alone rarely identifies you, but <strong>several together can make your browser easy to recognise</strong>, even without cookies.</p>
        <p>Below, each detail is placed in one of three groups: shared by many browsers, narrows you down, or reveals something about you. We do not give a risk score, because an honest score would need data from many other people.</p>
      </PlainBox>

      <div className="grid gap-3 sm:grid-cols-3">
        {Object.entries(EXPOSURE_CLASSES).map(([key, cls]) => (
          <StatTile key={key} label={cls.label} value={analysis.counts[key]} tone={key === 'reveals' && analysis.counts[key] ? 'warn' : key === 'narrows' ? 'accent' : 'neutral'} hint={cls.meaning} />
        ))}
      </div>

      <Card id="exposure-method" title="How the groups work">
        <p className="text-sm leading-relaxed text-slate-300">
          Each collected signal is placed in one of three groups according to <em>what it discloses</em>. {EXPOSURE_RUBRIC_NOTE} No privacy score is shown on purpose: a trustworthy score would need measurements across many real browsers, which this project does not have. The counts above simply tell you how many collected signals fall in each group.
        </p>
      </Card>

      <Card id="exposure-observations" title="What we found in your browser" subtitle="Facts taken directly from the data we collected.">
        {analysis.observations.length === 0 ? (
          <p className="text-sm text-slate-400">No observations for the signals collected in this run.</p>
        ) : (
          <ul className="space-y-2">
            {analysis.observations.map((o) => (
              <li key={o.text} className="flex flex-wrap items-start gap-2 text-sm leading-relaxed text-slate-200">
                <Pill tone={OBSERVATION_TONE[o.tone]}>{OBSERVATION_LABEL[o.tone]}</Pill>
                <span className="min-w-0 flex-1">{o.text}<SourceList ids={o.sources ?? []} /></span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        {['reveals', 'narrows', 'shared'].map((cls) => (
          <Card key={cls} id={`exposure-${cls}`} title={`${EXPOSURE_CLASSES[cls].label} (${byClass(cls).length})`} subtitle={EXPOSURE_CLASSES[cls].meaning}>
            {byClass(cls).length === 0 ? <p className="text-sm text-slate-400">No collected signal falls in this group.</p> : <ul className="space-y-2">{byClass(cls).map((s) => <SignalRow key={s.id} signal={s} />)}</ul>}
          </Card>
        ))}
      </div>

      <Card id="exposure-optional" title="Optional extras and data sent to others" actions={<Button variant="ghost" onClick={() => onNavigate('privacy')}>Change in Privacy &amp; consent</Button>}>
        <p className="mb-3 text-sm text-slate-300">{enabledCount} of {analysis.optional.length} optional categories were enabled for this run.</p>
        <ul className="space-y-2">
          {analysis.optional.map((o) => (
            <li key={o.id} className="flex flex-wrap items-start gap-2 text-sm">
              <Pill tone={o.enabled ? 'cyan' : 'neutral'}>{o.enabled ? 'Enabled' : 'Disabled'}</Pill>
              <span className="min-w-0 flex-1 text-slate-200">
                <span className="font-medium">{o.title}</span>
                <span className="block text-xs leading-relaxed text-slate-400">{o.where}</span>
                {o.thirdParties.length > 0 && <span className="block text-xs text-amber-300">Third party: {o.thirdParties.map((t) => t.host).join(', ')}</span>}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-4 rounded-lg border border-slate-700/70 bg-slate-950/60 p-3 text-sm leading-relaxed text-slate-300">
          <p className="font-medium text-slate-100">Data processing in this run</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>All signals were computed in your browser. Fingerprint data uploaded: <strong>{report.meta.fingerprintDataTransmitted ? 'yes' : 'no'}</strong>.</li>
            <li>
              Third-party requests made: {analysis.thirdParties.length ? <strong>{analysis.thirdParties.map((t) => `${t.host} (${t.purpose})`).join('; ')}</strong> : <strong>none</strong>}.
              {analysis.thirdParties.length > 0 && ' Each is a plain request that includes none of your fingerprint; the provider sees your IP address, as any website does.'}
            </li>
            <li>The configuration hash is computed locally with SHA-256 and is never sent anywhere.</li>
          </ul>
        </div>
      </Card>

      <Card id="exposure-findings" title="What your experiments showed" subtitle="Results from your own Protection tests and Laboratory runs, grouped by browser. Different browsers are never mixed together.">
        {analysis.findings.length === 0 ? (
          <p className="text-sm text-slate-400" data-testid="no-findings">Nothing has been measured yet, so there are no experiment results to show. Run a Protection test to create some.</p>
        ) : (
          <div className="space-y-4">
            {analysis.findingGroups.map((g) => (
              <div key={g.environment} data-testid={`findings-${g.environment}`}>
                <h3 className="mb-2 text-xs font-semibold uppercase text-slate-400">{g.environment}</h3>
                <ul className="space-y-2">
                  {g.findings.map((f) => (
                    <li key={f.id} className="rounded-lg border border-slate-700/70 bg-slate-950/60 p-3 text-sm leading-relaxed" data-testid={`finding-${f.id}`} data-rule={f.rule}>
                      <p className="text-slate-200"><span className="mr-2 font-mono text-xs text-slate-400">{f.id}</span>{f.statement}</p>
                      <div className="mt-2"><EvidenceBadges kinds={f.evidence} /></div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card id="exposure-recommendations" title="What you can do" subtitle="Practical steps, each with a reason and a downside. Steps backed by your own experiments come first. They are not ordered by risk.">
        <ul className="space-y-3">
          {analysis.recommendations.map((r) => (
            <li key={r.id} className="rounded-lg border border-slate-700/70 bg-slate-950/60 p-3 text-sm leading-relaxed" data-testid={`recommendation-${r.id}`}>
              <p className="font-medium text-slate-100">{r.title}</p>
              {r.action && <p className="mt-1 text-slate-100"><span className="text-slate-400">What to do: </span>{r.action}</p>}
              <p className="mt-1 text-slate-300"><span className="text-slate-400">Why it applies: </span>{r.because}</p>
              <p className="mt-1 text-slate-300">{r.why}</p>
              <p className="mt-1 text-slate-400"><span className="font-medium">Trade-off or limit: </span>{r.tradeoff}</p>
              <div className="mt-2"><EvidenceBadges kinds={r.evidence} /></div>
              <SourceList ids={r.sources} />
            </li>
          ))}
        </ul>
      </Card>

      <Card id="exposure-mechanisms" title="Documented browser mechanisms (not tested here unless stated)" subtitle="Quoted from official documentation. This application does not claim that any of them protects you.">
        <ul className="space-y-3">
          {analysis.mechanisms.map((m) => (
            <li key={m.id} className="rounded-lg border border-slate-700/70 bg-slate-950/60 p-3 text-sm leading-relaxed" data-testid={`mechanism-${m.id}`}>
              <p className="font-medium text-slate-100">{m.title}</p>
              <p className="mt-1 text-slate-300"><span className="text-slate-400">Documentation says: </span>{m.says}</p>
              <ul className="mt-1 space-y-1">
                {SOURCES[m.source].quotes.map((q) => <li key={q} className="border-l-2 border-slate-600 pl-2 text-xs italic text-slate-300">&ldquo;{q}&rdquo;</li>)}
              </ul>
              <p className="mt-1 text-slate-300"><span className="text-slate-400">It does not say: </span>{m.notSaid}</p>
              <p className="mt-1 text-amber-200"><span className="font-medium">Tested by this project: </span>{m.testedHere}</p>
              <div className="mt-2"><EvidenceBadges kinds={['documented']} /></div>
              <SourceList ids={[m.source]} />
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs leading-relaxed text-slate-400" data-testid="unverified-note">{analysis.unverifiedNote}</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-400">Quotes were retrieved with an automated tool. Re-check them on the live pages before citing them.</p>
      </Card>

      <NextSteps steps={[
        { label: 'Run a Protection test', hint: 'Change one browser setting and see which details move.', onClick: () => onNavigate('protection'), primary: true },
        { label: 'Review your consent choices', hint: 'Decide which optional extras may be collected.', onClick: () => onNavigate('privacy') },
        { label: 'Save a report', hint: 'Export your results to share or keep.', onClick: () => onNavigate('reports') },
      ]} />
    </div>
  );
}
