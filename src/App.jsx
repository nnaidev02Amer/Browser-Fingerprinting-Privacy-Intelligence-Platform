import { useEffect, useRef, useState } from 'react';
import ActionBar from './components/ActionBar';
import AppShell from './components/AppShell';
import HistoryPanel from './components/HistoryPanel';
import PrivacyPanel from './components/PrivacyPanel';
import WelcomeScreen from './components/WelcomeScreen';
import { Card, PageHeader } from './components/ui';
import { OPTIONAL_IDS } from './config/consentCategories';
import { useBehavioralTracking } from './hooks/useBehavioralTracking';
import { useConsent } from './hooks/useConsent';
import { useExperiments } from './hooks/useExperiments';
import { useFingerprintCollection } from './hooks/useFingerprintCollection';
import { useHistory } from './hooks/useHistory';
import ExposureView from './views/ExposureView';
import FingerprintView from './views/FingerprintView';
import LabView from './views/LabView';
import OverviewView from './views/OverviewView';
import ProtectionView from './views/ProtectionView';
import ReportsView from './views/ReportsView';
import { copyText } from './utils/clipboard';
import { downloadText } from './utils/download';

const SAVE_ERROR_TEXT = {
  limit: 'History limit reached. Delete a snapshot first.',
  quota: 'Browser storage is full. Delete some snapshots and try again.',
  unavailable: 'Browser storage is unavailable, so the snapshot could not be saved.',
  other: 'The snapshot could not be saved.',
};

/**
 * @param {{storage?: Storage|null}} props  `storage` is for tests; by default localStorage is used.
 */
export default function App({ storage }) {
  const [tab, setTab] = useState('overview');
  const [notice, setNotice] = useState(null);
  // Kept here (not inside the Laboratory view) so the chosen experiment survives switching tabs.
  const [labExperimentId, setLabExperimentId] = useState(null);
  const [protectionTestId, setProtectionTestId] = useState(null);

  const consent = useConsent(storage);
  const history = useHistory(storage);
  const experiments = useExperiments(storage);
  const collection = useFingerprintCollection();
  const { report } = collection;

  // Behavioural listeners exist ONLY while the user has consented. Switching the
  // category off removes them immediately and discards what was captured.
  const behavioralOn = consent.acknowledged && consent.choices.behavioral === true;
  const { snapshot: behavioralSnapshot } = useBehavioralTracking(behavioralOn);

  // Lets an in-flight collection see choices made while it is running.
  const choicesRef = useRef(consent.choices);
  useEffect(() => {
    choicesRef.current = consent.choices;
  }, [consent.choices]);

  // Single mechanism for revocation, whatever caused it (a switch, "Revoke all", or a change made in
  // another tab): when a category goes from granted to not granted, cancel its in-flight work and
  // remove its data from the result on screen.
  const { redact } = collection;
  const previousChoices = useRef(consent.choices);
  useEffect(() => {
    for (const id of OPTIONAL_IDS) {
      if (previousChoices.current[id] === true && consent.choices[id] !== true) redact(id);
    }
    previousChoices.current = consent.choices;
  }, [consent.choices, redact]);

  // Keep keyboard focus somewhere sensible when the first-run screen is replaced by the dashboard.
  const mainRef = useRef(null);
  const wasFirstRun = useRef(!consent.acknowledged);
  useEffect(() => {
    if (wasFirstRun.current && consent.acknowledged) mainRef.current?.focus();
    wasFirstRun.current = !consent.acknowledged;
  }, [consent.acknowledged]);

  /** Runs a collection with the CURRENT consent choices; resolves to the finished report (or null). */
  const runCollect = () => collection.collect(() => choicesRef.current, behavioralSnapshot);

  const handleCollect = () => {
    setNotice(null);
    runCollect();
  };

  const handleCopy = async () => {
    const ok = await copyText(JSON.stringify(report, null, 2));
    setNotice(ok ? { type: 'ok', text: 'Report JSON copied to the clipboard.' } : { type: 'error', text: 'Copy failed. Your browser blocked clipboard access.' });
  };

  const handleDownload = () => {
    try {
      downloadText(`fingerprint-report-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, JSON.stringify(report, null, 2));
      setNotice({ type: 'ok', text: 'Report downloaded.' });
    } catch {
      setNotice({ type: 'error', text: 'Download failed. Use Copy JSON instead.' });
    }
  };

  const handleSave = () => {
    const { ok, reason } = history.save(report);
    setNotice(ok ? { type: 'ok', text: 'Snapshot saved to this browser. Open the History tab to view or compare it.' } : { type: 'error', text: SAVE_ERROR_TEXT[reason] ?? SAVE_ERROR_TEXT.other });
  };

  const firstRun = !consent.acknowledged;
  const optionalOn = Object.values(consent.choices).filter(Boolean).length;
  const shellStatus = { thirdPartyRequests: report?.meta.thirdPartyRequests.length ?? 0, optionalOn, optionalTotal: OPTIONAL_IDS.length };

  return (
    <AppShell tab={tab} onTab={setTab} showTabs={!firstRun} status={firstRun ? null : shellStatus}>
      <main ref={mainRef} tabIndex={-1} className="mx-auto max-w-6xl space-y-5 px-4 py-8 focus:outline-none lg:px-10 lg:py-10">
        {firstRun ? (
          <WelcomeScreen
            choices={consent.choices}
            onChange={consent.setChoice}
            onContinue={consent.acknowledge}
            storageStatus={consent.storageStatus}
          />
        ) : (
          <>
            <Card>
              <ActionBar
                hasReport={Boolean(report)}
                collecting={collection.status === 'collecting'}
                progress={collection.progress}
                behavioralOn={behavioralOn}
                onCollect={handleCollect}
                onCopy={handleCopy}
                onDownload={handleDownload}
                onSave={handleSave}
                notice={notice}
              />
            </Card>

            {tab === 'overview' && <OverviewView collection={collection} onCollect={handleCollect} onNavigate={setTab} />}
            {tab === 'fingerprint' && <FingerprintView report={report} onCollect={handleCollect} />}
            {tab === 'exposure' && <ExposureView report={report} onCollect={handleCollect} onNavigate={setTab} experiments={experiments.experiments} />}
            {tab === 'lab' && (
              <LabView
                experiments={experiments}
                collecting={collection.status === 'collecting'}
                onCollect={runCollect}
                optionalOn={optionalOn}
                onNavigate={setTab}
                selectedId={labExperimentId}
                onSelect={setLabExperimentId}
              />
            )}
            {tab === 'protection' && (
              <ProtectionView
                experiments={experiments}
                collecting={collection.status === 'collecting'}
                onCollect={runCollect}
                selectedId={protectionTestId}
                onSelect={setProtectionTestId}
              />
            )}
            {tab === 'history' && (
              <div className="motion-view space-y-4">
                <PageHeader title="History" subtitle="Snapshots you saved in this browser. View them, compare any two, or delete them." />
                <HistoryPanel history={history} />
              </div>
            )}
            {tab === 'reports' && <ReportsView report={report} experiments={experiments} history={history} onCollect={handleCollect} />}
            {tab === 'privacy' && (
              <div className="motion-view space-y-4">
                <PageHeader title="Privacy & consent" subtitle="Control exactly what this tool may collect. Changes apply immediately, and revoking a category cancels its requests and removes its data." />
                <PrivacyPanel
                  choices={consent.choices}
                  onChange={consent.setChoice}
                  onRevokeAll={consent.revokeAll}
                  saveError={consent.saveError}
                  storageStatus={consent.storageStatus}
                  updatedAt={consent.updatedAt}
                />
              </div>
            )}
          </>
        )}
      </main>

      <footer className="mx-auto max-w-6xl px-4 pb-8 text-xs text-slate-400 lg:px-8">
        <p>
          Educational research prototype. The configuration hash describes a browser setup; it is not a unique identifier of a
          physical device or a person. Browsers do not expose hardware identifiers such as IMEI, MAC address or serial number.
        </p>
        <p className="mt-1">
          Derived from Browser-Fingerprint-Project-React by Abu Sufiun (github.com/sufiun27). See README for attribution
          and licensing notes.
        </p>
      </footer>
    </AppShell>
  );
}
