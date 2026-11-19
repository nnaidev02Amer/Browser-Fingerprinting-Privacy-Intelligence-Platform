import { useState } from 'react';
import DistinguishabilityPanel from '../components/DistinguishabilityPanel';
import ExperimentResults from '../components/ExperimentResults';
import { observationsFromRuns } from '../utils/distinguishability';
import { Button, Card, EmptyState, PageHeader, Pill } from '../components/ui';
import { EXPERIMENT_PRESETS, SIGNALS } from '../config/signalCatalog';
import { EXPERIMENT_ERROR, MAX_EXPERIMENTS, MAX_LABEL, MAX_NAME, MAX_RUNS, cleanText } from '../services/experimentStore';
import { formatTimestamp } from '../utils/reportView';

const ERROR_TEXT = {
  [EXPERIMENT_ERROR.LIMIT]: `You can keep up to ${MAX_EXPERIMENTS} experiments. Delete one to create another.`,
  [EXPERIMENT_ERROR.RUN_LIMIT]: `An experiment holds up to ${MAX_RUNS} runs. Start a new experiment or delete a run.`,
  [EXPERIMENT_ERROR.QUOTA]: 'Browser storage is full. Delete an experiment or snapshots and try again.',
  [EXPERIMENT_ERROR.UNAVAILABLE]: 'Browser storage is unavailable, so experiments cannot be saved.',
  [EXPERIMENT_ERROR.NOT_FOUND]: 'That experiment no longer exists. Select or create another.',
  collect: 'The collection did not finish, so no run was recorded.',
  other: 'The run could not be saved.',
};

const REPEATS = 3;

/**
 * Research laboratory: repeatable experiments. The user changes a browser/OS setting themselves; the app
 * only measures. Nothing is modified automatically and nothing is collected without the user pressing a
 * button, and collection follows the current consent choices.
 */
export default function LabView({ experiments, collecting, onCollect, optionalOn, onNavigate, selectedId, onSelect }) {
  const [newName, setNewName] = useState('');
  const [presetId, setPresetId] = useState('baseline');
  const [runLabel, setRunLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const list = experiments.experiments.filter((e) => e.protocol !== 'protection'); // protection tests live in their own view
  const selected = list.find((e) => e.id === selectedId) ?? null;
  const preset = EXPERIMENT_PRESETS.find((p) => p.id === presetId);
  const working = busy || collecting;
  const runsLeft = selected ? MAX_RUNS - selected.runs.length : 0;

  const fail = (reason) => setMessage({ type: 'error', text: ERROR_TEXT[reason] ?? ERROR_TEXT.other });

  const handleCreate = (event) => {
    event.preventDefault();
    const result = experiments.create(newName);
    if (!result.ok) return fail(result.reason);
    onSelect(result.id);
    setNewName('');
    setMessage({ type: 'ok', text: 'Experiment created. Record a baseline run first.' });
    return undefined;
  };

  /** Collect once (using the current consent choices) and record that run into the experiment. */
  const recordOnce = async (label) => {
    const report = await onCollect();
    if (!report) return { ok: false, reason: 'collect' };
    return experiments.record(selected.id, report, { label, presetId });
  };

  const baseLabel = () => cleanText(runLabel, MAX_LABEL) || preset.label;

  const handleRecord = async () => {
    setBusy(true);
    setMessage(null);
    const result = await recordOnce(baseLabel());
    setBusy(false);
    if (result.ok) setMessage({ type: 'ok', text: `Recorded run ${selected.runs.length + 1}. Change a setting, reload, and record again to compare.` });
    else fail(result.reason);
  };

  const handleRepeat = async () => {
    setBusy(true);
    setMessage(null);
    let recorded = 0;
    for (let i = 1; i <= REPEATS; i += 1) {
      const label = cleanText(`${baseLabel()} (repeat ${i}/${REPEATS})`, MAX_LABEL);
      const result = await recordOnce(label); // sequential on purpose: each run must finish before the next starts
      if (!result.ok) { fail(result.reason); break; }
      recorded += 1;
    }
    setBusy(false);
    if (recorded === REPEATS) setMessage({ type: 'ok', text: `Recorded ${REPEATS} repeat runs. Identical hashes mean the stable signals are repeatable under this configuration.` });
  };

  return (
    <div className="motion-view space-y-4">
      <PageHeader title="Laboratory" subtitle="Run small experiments. Change one thing at a time, record a run, and see which details of your fingerprint moved." />

      <Card id="lab-rules" title="How the laboratory works">
        <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-slate-300">
          <li><strong className="text-slate-100">Nothing is changed for you.</strong> You change a setting yourself (time zone, language, zoom, a browser option), then record a run. The app never modifies browser or system settings.</li>
          <li>A run is a normal collection that follows your current consent choices ({optionalOn} optional categor{optionalOn === 1 ? 'y' : 'ies'} on). It only starts when you press a button.</li>
          <li>Saved runs keep the stable signals, a short environment summary and a few variable display values (zoom, window size). IP address, location and behavioural data are never saved.</li>
          <li>Experiment names and run labels are the only text you type. Keep them neutral; do not enter personal information. They stay in this browser.</li>
        </ul>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card id="lab-experiments" title="1. Experiment" subtitle={`${list.length} of ${MAX_EXPERIMENTS} saved in this browser.`}>
          <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-2">
            <div className="min-w-[12rem] flex-1">
              <label htmlFor="experiment-name" className="mb-1 block text-xs text-slate-400">New experiment name</label>
              <input
                id="experiment-name"
                type="text"
                value={newName}
                maxLength={MAX_NAME}
                autoComplete="off"
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Effect of time zone"
                className="w-full rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
              />
            </div>
            <Button type="submit" variant="primary" disabled={working}>Create</Button>
          </form>

          {experiments.status === 'corrupted' && (
            <div role="alert" className="mt-3 rounded border border-amber-800 bg-amber-950 p-3 text-sm text-amber-100">
              Saved experiments could not be read (corrupted data).{' '}
              <Button className="mt-2" onClick={experiments.clearAll}>Reset experiments</Button>
            </div>
          )}
          {experiments.status === 'unavailable' && <p role="alert" className="mt-3 text-sm text-amber-200">Browser storage is unavailable. Experiments cannot be saved.</p>}
          {experiments.dropped > 0 && <p role="status" className="mt-3 text-xs text-amber-300">{experiments.dropped} unreadable experiment(s) were skipped.</p>}

          {list.length === 0 ? (
            <p className="mt-4 text-sm text-slate-400" data-testid="experiments-empty">No experiments yet. Name one above to begin.</p>
          ) : (
            <fieldset className="mt-4">
              <legend className="mb-2 text-xs text-slate-400">Select an experiment</legend>
              <ul className="space-y-2">
                {list.map((e) => (
                  <li key={e.id} className={`flex flex-wrap items-center gap-2 rounded-lg border p-2.5 ${selectedId === e.id ? 'border-cyan-700 bg-slate-800' : 'border-slate-700/70 bg-slate-950/50'}`} data-testid="experiment-item">
                    <input id={`exp-${e.id}`} type="radio" name="experiment" className="h-4 w-4 accent-cyan-400" checked={selectedId === e.id} onChange={() => { onSelect(e.id); setMessage(null); }} />
                    <label htmlFor={`exp-${e.id}`} className="min-w-0 flex-1 cursor-pointer text-sm text-slate-100">
                      <span className="font-medium">{e.name}</span>
                      <span className="block text-xs text-slate-400">{e.runs.length} run{e.runs.length === 1 ? '' : 's'} · created {formatTimestamp(e.createdAt)}</span>
                    </label>
                    {confirmDeleteId === e.id ? (
                      <span className="flex items-center gap-1" role="group" aria-label={`Confirm deleting ${e.name}`}>
                        <Button variant="danger" onClick={() => { experiments.deleteExperiment(e.id); setConfirmDeleteId(null); if (selectedId === e.id) onSelect(null); }}>Delete</Button>
                        <Button onClick={() => setConfirmDeleteId(null)}>Keep</Button>
                      </span>
                    ) : (
                      <Button variant="ghost" onClick={() => setConfirmDeleteId(e.id)} aria-label={`Delete experiment ${e.name}`}>Delete…</Button>
                    )}
                  </li>
                ))}
              </ul>
            </fieldset>
          )}
        </Card>

        <Card id="lab-preset" title="2. What will you change?" subtitle="Pick a guided scenario. You make the change; the laboratory measures the effect.">
          <fieldset>
            <legend className="sr-only">Experiment scenario</legend>
            <ul className="grid gap-2 sm:grid-cols-2">
              {EXPERIMENT_PRESETS.map((p) => (
                <li key={p.id}>
                  <label className={`flex h-full cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-sm ${presetId === p.id ? 'border-cyan-700 bg-slate-800' : 'border-slate-700/70 bg-slate-950/50 hover:bg-slate-800/60'}`}>
                    <input type="radio" name="preset" className="mt-1 h-4 w-4 accent-cyan-400" checked={presetId === p.id} onChange={() => { setPresetId(p.id); setRunLabel(''); }} />
                    <span className="text-slate-100">{p.label}</span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
          <div className="mt-3 space-y-2 rounded-lg border border-slate-700/70 bg-slate-950/50 p-3 text-sm leading-relaxed text-slate-300" data-testid="preset-guide">
            <p><span className="font-semibold text-slate-100">What to do: </span>{preset.howTo}</p>
            <p><span className="font-semibold text-slate-100">Hypothesis: </span>{preset.hypothesis}</p>
            {preset.watch.length > 0 && (
              <p className="flex flex-wrap items-center gap-2"><span className="font-semibold text-slate-100">Signals to watch:</span>{preset.watch.map((id) => <Pill key={id} tone="cyan">{SIGNALS[id].label}</Pill>)}</p>
            )}
          </div>
        </Card>
      </div>

      <Card id="lab-record" title="3. Record" subtitle="Collect a fingerprint now and add it to the selected experiment as a new run.">
        {!selected ? (
          <p className="text-sm text-slate-400">Select or create an experiment first.</p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-300">Recording into <strong className="text-slate-100">{selected.name}</strong> ({selected.runs.length} of {MAX_RUNS} runs).</p>
            <div className="max-w-md">
              <label htmlFor="run-label" className="mb-1 block text-xs text-slate-400">Run label (optional; defaults to the scenario name)</label>
              <input
                id="run-label"
                type="text"
                value={runLabel}
                maxLength={MAX_LABEL}
                autoComplete="off"
                onChange={(e) => setRunLabel(e.target.value)}
                placeholder={preset.label}
                className="w-full rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary" onClick={handleRecord} disabled={working || runsLeft < 1}>{working ? 'Recording…' : 'Record run'}</Button>
              <Button onClick={handleRepeat} disabled={working || runsLeft < REPEATS}>Repeatability test ({REPEATS} runs)</Button>
              <Button variant="ghost" onClick={() => onNavigate('privacy')}>Consent settings</Button>
            </div>
            {runsLeft < REPEATS && <p className="text-xs text-amber-300">Only {runsLeft} run slot{runsLeft === 1 ? '' : 's'} left in this experiment.</p>}
          </div>
        )}
        {message && <p role={message.type === 'error' ? 'alert' : 'status'} className={`mt-3 text-sm ${message.type === 'error' ? 'text-red-300' : 'text-emerald-300'}`}>{message.text}</p>}
      </Card>

      {!selected ? (
        <EmptyState title="No experiment selected" icon="⚗">Results appear here once you select an experiment that has runs.</EmptyState>
      ) : (
        <>
          <ExperimentResults key={selected.id} experiment={selected} onDeleteRun={(runId) => experiments.deleteRun(selected.id, runId)} />
          <DistinguishabilityPanel observations={observationsFromRuns(selected.runs)} />
        </>
      )}
    </div>
  );
}
