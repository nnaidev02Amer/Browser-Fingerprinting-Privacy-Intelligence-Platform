import { CollectorResultsCard, JsonOutputCard, OptionalDetailsCard } from '../components/DetailsSections';
import { BrowserOsCard, HardwareDisplayCard, HashCard, OverviewCard } from '../components/ReportSections';
import { NextSteps, PlainBox } from '../components/Guidance';
import LearnCard from '../components/LearnCard';
import { PageHeader, StatTile } from '../components/ui';
import { countStatuses } from '../utils/reportView';

/** Overview: headline numbers, the configuration hash, environment cards, collector results and raw JSON. */
export default function OverviewView({ collection, onCollect, onNavigate = () => {} }) {
  const { report, status, error } = collection;
  const fp = report?.stableFingerprint;
  const counts = countStatuses(report);
  const totalCollectors = report?.diagnostics.length ?? 0;

  return (
    <div className="motion-view space-y-4">
      <PageHeader
        title="Overview"
        subtitle="See what your browser tells websites about you. Everything is worked out on this device and nothing is uploaded."
      />

      <LearnCard open={!report} />

      {report && (
        <PlainBox title="Your result in plain English" testId="overview-plain">
          <p>
            {fp?.hash
              ? `Your browser answered ${fp.signalsCollected} of ${fp.signalsTotal} stable questions. Those answers were combined into one short code (the fingerprint hash). If your setup stays the same, the code stays the same, so a website could use it to recognise your browser.`
              : 'Some answers could not be collected, so no fingerprint hash could be made. See the details below.'}
          </p>
          <p className="text-slate-400">The code describes a browser setup, not you as a person, and it does not tell you how rare your setup is.</p>
        </PlainBox>
      )}

      <NextSteps
        steps={report ? [
          { label: 'See what you expose', hint: 'Find out which details could be used to recognise you.', onClick: () => onNavigate('exposure'), primary: true },
          { label: 'Try an experiment', hint: 'Change one setting and check whether the answers change.', onClick: () => onNavigate('protection') },
          { label: 'Save this result', hint: 'Keep a snapshot in History so you can compare it later.', onClick: () => onNavigate('history') },
        ] : []}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Stable answers used" value={fp ? `${fp.signalsCollected} / ${fp.signalsTotal}` : '—'} tone={fp?.incomplete ? 'warn' : fp ? 'good' : 'neutral'} hint={fp ? (fp.incomplete ? 'Incomplete: see the note below' : 'All stable signals collected') : 'Collect a fingerprint to begin'} />
        <StatTile label="Checks that worked" value={report ? `${counts.ok} / ${totalCollectors}` : '—'} hint={report ? `${counts.disabled} disabled by consent` : undefined} />
        <StatTile label="Fingerprint hash" value={fp ? (fp.hash ? 'Generated' : 'Unavailable') : '—'} tone={fp?.hash ? 'accent' : fp ? 'warn' : 'neutral'} hint={fp ? `${fp.algorithm}, computed locally` : undefined} />
        <StatTile label="Data sent to others" value={report ? report.meta.thirdPartyRequests.length : '—'} tone={report?.meta.thirdPartyRequests.length ? 'warn' : 'neutral'} hint={report ? 'In the latest run' : undefined} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <OverviewCard status={status} report={report} error={error} onCollect={onCollect} />
        <HashCard report={report} />
        <BrowserOsCard report={report} />
        <HardwareDisplayCard report={report} />
        <div className="lg:col-span-2"><OptionalDetailsCard report={report} /></div>
        <div className="lg:col-span-2"><CollectorResultsCard report={report} /></div>
        <div className="lg:col-span-2"><JsonOutputCard report={report} /></div>
      </div>
    </div>
  );
}
