import { useState } from 'react';
import { copyText } from '../utils/clipboard';
import { countStatuses, formatTimestamp, selectCollector } from '../utils/reportView';
import { StatusDonut } from './charts';
import { Button, Card, KeyValue, Skeleton, Unavailable } from './ui';

export function OverviewCard({ status, report, error, onCollect }) {
  if (status === 'collecting' && !report) {
    return (
      <Card id="overview" title="Fingerprint overview">
        <p className="text-sm text-slate-300" role="status">Collecting signals… this usually takes a second or two.</p>
        <div className="mt-4 space-y-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-16 w-full" />
        </div>
      </Card>
    );
  }
  if (status === 'error') {
    return (
      <Card id="overview" title="Fingerprint overview">
        <p className="text-sm text-red-300" role="alert">Collection failed: {error}</p>
        <Button className="mt-3" variant="primary" onClick={onCollect}>Try again</Button>
      </Card>
    );
  }
  if (!report) {
    return (
      <Card id="overview" title="Fingerprint overview">
        <div className="space-y-3 text-sm text-slate-300">
          <p>No fingerprint collected yet.</p>
          <p className="text-slate-400">
            Press <strong>Collect fingerprint</strong> to read your browser and device signals. Everything stays in this
            browser.
          </p>
          <Button variant="primary" onClick={onCollect}>Collect fingerprint</Button>
        </div>
      </Card>
    );
  }

  const fp = report.stableFingerprint;
  const counts = countStatuses(report);
  const contacted = report.meta.thirdPartyRequests;

  return (
    <Card id="overview" title="Fingerprint overview" subtitle={`Collected ${formatTimestamp(report.meta.generatedAt)}`}>
      <div className="space-y-4">
        <KeyValue
          items={[
            { label: 'Stable signals used in hash', value: `${fp.signalsCollected} of ${fp.signalsTotal}` },
            { label: 'Hash status', value: fp.hash ? 'Generated' : 'Unavailable' },
            { label: 'Fingerprint data uploaded', value: report.meta.fingerprintDataTransmitted ? 'Yes' : 'No' },
            {
              label: 'Third-party requests this run',
              value: contacted.length ? contacted.map((t) => `${t.host} (${t.purpose})`).join('; ') : 'None',
            },
          ]}
        />
        <div>
          <p className="mb-2 text-xs text-slate-400">Collector results</p>
          <StatusDonut counts={counts} />
        </div>
        {fp.incomplete && (
          <p className="rounded border border-amber-800 bg-amber-950 p-2 text-xs text-amber-200" role="status">
            Some stable signals were unavailable ({fp.failedSignals.map((s) => `${s.id}: ${s.status}`).join(', ')}). A
            hash built from fewer signals will not match a complete one.
          </p>
        )}
      </div>
    </Card>
  );
}

export function HashCard({ report }) {
  const [copied, setCopied] = useState(false);
  const fp = report?.stableFingerprint;

  const handleCopy = async () => {
    if (await copyText(fp.hash)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Card
      id="hash"
      title="Configuration hash"
      subtitle="A hash of your browser/device configuration, not a unique device identifier."
      actions={fp?.hash && <Button variant="ghost" onClick={handleCopy}>{copied ? 'Copied' : 'Copy hash'}</Button>}
    >
      {!report && <p className="text-sm text-slate-400">The hash appears here after you collect a fingerprint.</p>}
      {report && fp.hash && (
        <div className="space-y-3">
          <p data-testid="config-hash" className="break-all rounded-xl border border-slate-700 border-l-2 border-l-clay-400 bg-slate-950 p-5 font-mono text-sm leading-loose tracking-wide text-cyan-200 sm:text-base">{fp.hash}</p>
          <KeyValue
            items={[
              { label: 'Algorithm', value: `${fp.algorithm} (Web Crypto, computed locally)` },
              { label: 'Hash input version', value: fp.hashInputVersion },
            ]}
          />
          <p className="text-xs text-slate-400">{fp.disclaimer}</p>
        </div>
      )}
      {report && !fp.hash && (
        <p className="text-sm text-amber-200" role="alert">{fp.hashError}</p>
      )}
    </Card>
  );
}

export function BrowserOsCard({ report }) {
  const browser = selectCollector(report, 'browser');
  const locale = selectCollector(report, 'locale');

  return (
    <Card id="browser-os" title="Browser & operating system">
      {!report ? (
        <p className="text-sm text-slate-400">No data yet.</p>
      ) : (
        <div className="space-y-4">
          {browser.data ? (
            <KeyValue
              items={[
                { label: 'Browser', value: [browser.data.browser.name, browser.data.browser.version].filter(Boolean).join(' ') },
                { label: 'Operating system', value: [browser.data.os.name, browser.data.os.version].filter(Boolean).join(' ') },
                { label: 'Device type', value: browser.data.deviceType },
                { label: 'Detection method', value: browser.data.source === 'userAgent' ? 'User-Agent string (fallback)' : 'User-Agent Client Hints' },
                { label: 'Architecture', value: browser.data.architecture },
                { label: 'Bitness', value: browser.data.bitness },
              ]}
            />
          ) : (
            <Unavailable status={browser.status} reason={browser.reason} />
          )}
          {locale.data ? (
            <KeyValue
              items={[
                { label: 'Time zone', value: locale.data.timeZone },
                { label: 'Languages', value: locale.data.languages },
              ]}
            />
          ) : (
            <Unavailable status={locale.status} reason={locale.reason} />
          )}
        </div>
      )}
    </Card>
  );
}

export function HardwareDisplayCard({ report }) {
  const screen = selectCollector(report, 'screen');
  const hardware = selectCollector(report, 'hardware');
  const touch = selectCollector(report, 'touch');
  const webgl = selectCollector(report, 'webgl');

  const section = (title, collector, items) => (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase text-slate-400">{title}</h3>
      {collector.data ? <KeyValue items={items(collector.data)} /> : <Unavailable status={collector.status} reason={collector.reason} />}
    </div>
  );

  return (
    <Card id="hardware" title="Hardware & display">
      {!report ? (
        <p className="text-sm text-slate-400">No data yet.</p>
      ) : (
        <div className="space-y-4">
          {section('Display', screen, (d) => [
            { label: 'Resolution', value: `${d.width} × ${d.height}` },
            { label: 'Colour depth', value: `${d.colorDepth}-bit` },
            { label: 'Pixel ratio', value: d.devicePixelRatio },
            { label: 'Available area', value: `${d.availWidth} × ${d.availHeight}` },
          ])}
          {section('Processor & memory', hardware, (d) => [
            { label: 'Logical CPU cores', value: d.cpuLogicalCores },
            { label: 'Device memory', value: d.deviceMemorySupported ? `${d.deviceMemoryGB} GB (approx.)` : 'Not exposed by this browser' },
          ])}
          {section('Touch', touch, (d) => [
            { label: 'Max touch points', value: d.maxTouchPoints },
            { label: 'Touch events', value: d.touchEventSupported },
          ])}
          {section('Graphics (WebGL)', webgl, (d) => [
            { label: 'Renderer', value: d.renderer },
            { label: 'Vendor', value: d.vendor },
            { label: 'GPU details', value: d.unmaskedInfoAvailable ? 'Exposed' : 'Hidden by browser' },
          ])}
        </div>
      )}
    </Card>
  );
}
