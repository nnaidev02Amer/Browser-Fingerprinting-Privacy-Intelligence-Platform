import { useState } from 'react';
import BundleExport from '../components/BundleExport';
import DistinguishabilityPanel from '../components/DistinguishabilityPanel';
import { PlainBox } from '../components/Guidance';
import { observationsFromProtection } from '../utils/distinguishability';
import { EvidenceBadges } from '../components/Evidence';
import { Button, Card, EmptyState, PageHeader, Pill } from '../components/ui';
import { EXPERIMENT_ERROR, MAX_EXPERIMENTS, MAX_LABEL, MAX_NAME, MAX_RUNS, cleanText } from '../services/experimentStore';
import { baselineStability } from '../utils/stability';
import { OPTIONAL_PROTECTION_STEP, OUTCOME, OUTCOME_TEXT, PROTECTION_STEPS, analyzeProtection, pickProtectionRuns } from '../utils/protectionTest';
import { formatTimestamp } from '../utils/reportView';

const OUTCOME_LABEL = {
  [OUTCOME.UNAFFECTED]: ['Identical', 'emerald'],
  [OUTCOME.CHANGED]: ['Changed', 'amber'],
  [OUTCOME.RANDOMISED]: ['Randomised', 'amber'],
  [OUTCOME.UNAVAILABLE]: ['Unavailable', 'rose'],
  [OUTCOME.NEWLY_READABLE]: ['Newly readable', 'cyan'],
  [OUTCOME.UNAVAILABLE_BOTH]: ['Unavailable in both', 'neutral'],
  [OUTCOME.UNSTABLE_BASELINE]: ['Varies on its own', 'neutral'],
};

const ERROR_TEXT = {
  [EXPERIMENT_ERROR.LIMIT]: `You can keep up to ${MAX_EXPERIMENTS} experiments in total. Delete one first.`,
  [EXPERIMENT_ERROR.RUN_LIMIT]: `An experiment holds up to ${MAX_RUNS} runs.`,
  [EXPERIMENT_ERROR.QUOTA]: 'Browser storage is full.',
  [EXPERIMENT_ERROR.UNAVAILABLE]: 'Browser storage is unavailable, so the test cannot be saved.',
  collect: 'The collection did not finish, so nothing was recorded.',
  other: 'The run could not be saved.',
};

const FIELD = 'w-full rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300';

/**
 * Protection test: baseline, changed configuration, baseline again. You change ONE setting yourself; the app
 * only measures which attributes this application can read were affected, beyond normal variation.
 */
export default function ProtectionView({ experiments, collecting, onCollect, selectedId, onSelect }) {
  const [name, setName] = useState('');
  const [changeLabel, setChangeLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const tests = experiments.experiments.filter((e) => e.protocol === 'protection');
  const selected = tests.find((e) => e.id === selectedId) ?? null;
  const picked = pickProtectionRuns(selected);
  const working = busy || collecting;
  const analysis = picked.baseline && picked.changed ? analyzeProtection(picked) : null;
  const fail = (reason) => setMessage({ type: 'error', text: ERROR_TEXT[reason] ?? ERROR_TEXT.other });

  const handleCreate = (event) => {
    event.preventDefault();
    const result = experiments.create(name, 'protection');
    if (!result.ok) return fail(result.reason);
    onSelect(result.id);
    setName('');
    setMessage({ type: 'ok', text: 'Test created. Record the baseline (A1) first.' });
    return undefined;
  };

  const record = async (step) => {
    setBusy(true);
    setMessage(null);
    const report = await onCollect();
    if (!report) { setBusy(false); return fail('collect'); }
    const label = step.id === 'protect-b' ? cleanText(changeLabel, MAX_LABEL) || 'Changed configuration' : step.short === 'A3' ? 'Extra baseline (A3)' : step.label.slice(0, MAX_LABEL);
    const result = experiments.record(selected.id, report, { label, presetId: step.id });
    setBusy(false);
    if (!result.ok) return fail(result.reason);
    setMessage({ type: 'ok', text: `${step.label} recorded.` });
    return undefined;
  };

  const done = (id) => Boolean({ 'protect-a1': picked.baseline, 'protect-b': picked.changed, 'protect-a2': picked.repeat, 'protect-a3': picked.repeat2 }[id]);
  const nextStep = PROTECTION_STEPS.find((s) => !done(s.id));

  return (
    <div className="motion-view space-y-4">
      <PageHeader title="Protection test" subtitle="Does a browser setting change what websites can read? Record your browser, change one setting, then record again to find out." />

      <Card id="protection-method" title="Method" actions={<EvidenceBadges kinds={['measured']} />}>
        <ol className="list-decimal space-y-1 pl-5 text-sm leading-relaxed text-slate-300">
          <li><strong className="text-slate-100">A1, baseline:</strong> record your browser as it is.</li>
          <li><strong className="text-slate-100">B, changed:</strong> you change ONE setting yourself, reload, and record. The app never changes settings.</li>
          <li><strong className="text-slate-100">A2, baseline again:</strong> undo the change, reload, record. A1 vs A2 shows how much your browser varies on its own (the noise floor). Only differences beyond it are attributed to the setting.</li>
          <li><strong className="text-slate-100">A3, optional extra baseline:</strong> reload once more without changing anything and record. A-B-A remains the standard method; A3 is an extra safeguard.</li>
        </ol>
        <p className="mt-3 text-sm leading-relaxed text-slate-300" data-testid="a3-explanation">
          <strong className="text-slate-100">Why A3 helps:</strong> two baselines can agree by chance even for a value that really varies. Every baseline is compared with every other one, so a value that is the same in A1 and A2 but different in A3 is caught as natural variation. Any attribute that differs between <em>any</em> two baselines is reported as &ldquo;varies on its own&rdquo; and is never attributed to your setting. Three runs are still a small sample.
        </p>
        <p className="mt-3 rounded-lg border border-amber-800 bg-amber-950/60 p-3 text-sm leading-relaxed text-amber-100" data-testid="protection-honesty">
          This reports what <em>changed</em>. It does not say the change is good for privacy: randomised or unusual values can make a browser more distinctive, and standardised values only help if many other browsers share them, which this project cannot measure. Results describe the browser you ran it in. No protection effectiveness is claimed for any browser.
        </p>
      </Card>

      <Card id="protection-tests" title="1. Test" subtitle={`${tests.length} saved in this browser.`}>
        <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-2">
          <div className="min-w-[12rem] flex-1">
            <label htmlFor="protection-name" className="mb-1 block text-xs text-slate-300">New test name</label>
            <input id="protection-name" className={FIELD} value={name} maxLength={MAX_NAME} autoComplete="off" onChange={(e) => setName(e.target.value)} placeholder="e.g. Browser privacy option on/off" />
          </div>
          <Button type="submit" variant="primary" disabled={working}>Create</Button>
        </form>
        {tests.length === 0 ? (
          <p className="mt-4 text-sm text-slate-400" data-testid="protection-empty">No protection tests yet. Name one above to begin.</p>
        ) : (
          <fieldset className="mt-4">
            <legend className="mb-2 text-xs text-slate-300">Select a test</legend>
            <ul className="space-y-2">
              {tests.map((t) => (
                <li key={t.id} className={`flex flex-wrap items-center gap-2 rounded-lg border p-2.5 ${selectedId === t.id ? 'border-cyan-700 bg-slate-800' : 'border-slate-700/70 bg-slate-950/50'}`} data-testid="protection-item">
                  <input id={`prot-${t.id}`} type="radio" name="protection" className="h-4 w-4 accent-cyan-400" checked={selectedId === t.id} onChange={() => { onSelect(t.id); setMessage(null); }} />
                  <label htmlFor={`prot-${t.id}`} className="min-w-0 flex-1 cursor-pointer text-sm text-slate-100">
                    <span className="font-medium">{t.name}</span>
                    <span className="block text-xs text-slate-400">{t.runs.length} of 3 steps recorded · {formatTimestamp(t.createdAt)}</span>
                  </label>
                  <Button variant="ghost" onClick={() => { experiments.deleteExperiment(t.id); if (selectedId === t.id) onSelect(null); }} aria-label={`Delete test ${t.name}`}>Delete</Button>
                </li>
              ))}
            </ul>
          </fieldset>
        )}
      </Card>

      {selected && (
        <Card id="protection-steps" title="2. Record the steps" subtitle={`Recording into "${selected.name}".`}>
          <ol className="space-y-3">
            {PROTECTION_STEPS.map((step) => {
              const isDone = done(step.id);
              const isNext = nextStep?.id === step.id;
              return (
                <li key={step.id} className={`rounded-lg border p-3 text-sm ${isNext ? 'border-cyan-700 bg-slate-800' : 'border-slate-700/70 bg-slate-950/50'}`} data-testid={`step-${step.id}`} data-done={isDone}>
                  <p className="flex flex-wrap items-center gap-2 font-medium text-slate-100">
                    {step.label}
                    <Pill tone={isDone ? 'emerald' : isNext ? 'cyan' : 'neutral'}>{isDone ? 'Recorded' : isNext ? 'Next' : 'Waiting'}</Pill>
                  </p>
                  <p className="mt-1 leading-relaxed text-slate-300">{step.instruction}</p>
                  {step.id === 'protect-b' && !isDone && (
                    <div className="mt-2 max-w-md">
                      <label htmlFor="change-label" className="mb-1 block text-xs text-slate-300">What did you change? (short label)</label>
                      <input id="change-label" className={FIELD} value={changeLabel} maxLength={MAX_LABEL} autoComplete="off" onChange={(e) => setChangeLabel(e.target.value)} placeholder="e.g. Strict tracking prevention" />
                    </div>
                  )}
                  <Button className="mt-2" variant={isNext ? 'primary' : 'secondary'} disabled={working || isDone || !isNext} onClick={() => record(step)}>
                    {working && isNext ? 'Recording…' : `Record ${step.short}`}
                  </Button>
                </li>
              );
            })}
            {done('protect-a2') && (() => {
              const step = OPTIONAL_PROTECTION_STEP;
              const isDone = done(step.id);
              return (
                <li key={step.id} className="rounded-lg border border-slate-700/70 bg-slate-950/50 p-3 text-sm" data-testid={`step-${step.id}`} data-done={isDone}>
                  <p className="flex flex-wrap items-center gap-2 font-medium text-slate-100">{step.label}<Pill tone={isDone ? 'emerald' : 'neutral'}>{isDone ? 'Recorded' : 'Optional'}</Pill></p>
                  <p className="mt-1 leading-relaxed text-slate-300">{step.instruction}</p>
                  <Button className="mt-2" disabled={working || isDone} onClick={() => record(step)}>{working ? 'Recording…' : `Record ${step.short}`}</Button>
                </li>
              );
            })()}
          </ol>
          {message && <p role={message.type === 'error' ? 'alert' : 'status'} className={`mt-3 text-sm ${message.type === 'error' ? 'text-red-300' : 'text-emerald-300'}`}>{message.text}</p>}
        </Card>
      )}

      {!selected && tests.length > 0 && <EmptyState title="Select a test" icon="⚗">Choose a test above to record its steps and see its results.</EmptyState>}

      {analysis && (
        <Card id="protection-results" title="3. Results" actions={<EvidenceBadges kinds={['measured']} />} subtitle={`Baseline: ${formatTimestamp(picked.baseline.savedAt)}. Changed: "${picked.changed.label}".`}>
          <div className="space-y-4" data-testid="protection-results">
            <PlainBox testId="protection-plain">
              <p>
                {analysis.counts[OUTCOME.CHANGED] + analysis.counts[OUTCOME.RANDOMISED] + analysis.counts[OUTCOME.UNAVAILABLE] > 0
                  ? `Your change affected ${analysis.counts[OUTCOME.CHANGED] + analysis.counts[OUTCOME.RANDOMISED] + analysis.counts[OUTCOME.UNAVAILABLE]} detail(s). ${analysis.residual.length} detail(s) stayed exactly the same and could still be used to recognise your browser.`
                  : 'Your change did not affect anything this tool can read. That does not show the setting does nothing elsewhere.'}
              </p>
              <p className="text-slate-400">A different result is not the same as better privacy. This test only shows what changed.</p>
            </PlainBox>
            <ul className="space-y-1 text-sm text-slate-200" data-testid="protection-summary">
              {analysis.summary.map((line) => <li key={line} className="flex gap-2"><span aria-hidden="true" className="text-cyan-400">▸</span><span>{line}</span></li>)}
              <li className="flex gap-2"><span aria-hidden="true" className="text-cyan-400">▸</span><span>
                {analysis.hasNoiseFloor
                  ? `Noise floor: the ${analysis.baselineCount === 3 ? 'three' : 'two'} baselines ${analysis.hashNoise ? 'had different hashes, so this browser varies on its own' : 'had the same hash, so normal variation is low for what is measured'}.`
                  : 'Noise floor: not recorded. Record A2 to separate normal variation from the effect of the setting.'}
              </span></li>
            </ul>

            <ul className="space-y-2" data-testid="protection-attributes">
              {analysis.attributes.map((a) => (
                <li key={a.id} className="rounded-lg border border-slate-700/70 bg-slate-950/60 p-3 text-sm" data-testid={`protect-attr-${a.id}`} data-outcome={a.outcome}>
                  <p className="flex flex-wrap items-center gap-2 font-medium text-slate-100">
                    {a.label}
                    <Pill tone={OUTCOME_LABEL[a.outcome][1]}>{OUTCOME_LABEL[a.outcome][0]}</Pill>
                    {a.derived && <Pill>Derived, not counted</Pill>}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-300">{OUTCOME_TEXT[a.outcome]}</p>
                </li>
              ))}
            </ul>

            <div className="rounded-lg border border-slate-700/70 bg-slate-950/60 p-3 text-sm leading-relaxed text-slate-300" data-testid="protection-stability">
              <p className="font-medium text-slate-100">Repeatability across your baseline runs</p>
              <p className="mt-1 text-xs text-slate-400">Counts of your own runs ("identical in k of m"), not percentages or probabilities. Same machine, same build, a short time span.</p>
              <ul className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2">
                {baselineStability([picked.baseline, picked.repeat, picked.repeat2].filter(Boolean)).map((s) => (
                  <li key={s.id} data-testid={`stability-${s.id}`} data-status={s.status}>
                    {analysis.attributes.find((a) => a.id === s.id).label}: {s.status === 'not-tested' ? 'not tested (needs at least 2 baseline runs)' : s.status === 'unreadable' ? 'not readable' : `identical in ${s.identical} of ${s.runs} baseline runs`}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-lg border border-slate-700/70 bg-slate-950/60 p-3 text-sm leading-relaxed text-slate-300" data-testid="protection-residual">
              <p className="font-medium text-slate-100">Still available for linking after the change</p>
              <p className="mt-1">{analysis.residual.length ? analysis.residual.map((id) => analysis.attributes.find((a) => a.id === id).label).join(', ') : 'None of the measured attributes stayed identical.'}</p>
            </div>

            {analysis.notes.length > 0 && <ul className="list-disc space-y-1 pl-5 text-sm text-slate-300">{analysis.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
            <p className="text-xs leading-relaxed text-slate-400" data-testid="protection-relation">{analysis.relation}</p>
            <BundleExport experiment={selected} />
            <DistinguishabilityPanel observations={observationsFromProtection(selected)} />

            <div className="rounded-lg border border-amber-800 bg-amber-950/60 p-3 text-xs leading-relaxed text-amber-100" data-testid="protection-caveats">
              <p className="font-medium">Limitations of this result</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">{analysis.caveats.map((c) => <li key={c}>{c}</li>)}</ul>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
