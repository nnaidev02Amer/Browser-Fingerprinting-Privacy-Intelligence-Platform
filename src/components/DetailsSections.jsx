import { ALL_COLLECTORS } from '../collectors';
import { STATUS } from '../collectors/runner';
import { formatValue, selectCollector } from '../utils/reportView';
import { Card, KeyValue, StatusBadge, Unavailable } from './ui';

const coords = (d) => (d.latitude !== null && d.longitude !== null ? `${d.latitude}, ${d.longitude}` : null);

/** How each optional collector is presented. Behavioural data is handled separately. */
const OPTIONAL_VIEWS = [
  { id: 'publicIp', title: 'Public IP address', items: (d) => [{ label: 'IP address', value: d.ip }, { label: 'Provider', value: d.provider }] },
  {
    id: 'geolocation',
    title: 'Approximate location (from IP)',
    items: (d) => [
      { label: 'City', value: d.city },
      { label: 'Region', value: d.region },
      { label: 'Country', value: d.country },
      { label: 'Approx. coordinates', value: coords(d) },
      { label: 'Time zone', value: d.timezone },
      { label: 'Network provider', value: d.organization },
    ],
  },
  {
    id: 'connection',
    title: 'Connection quality',
    items: (d) => [
      { label: 'Type', value: d.effectiveType },
      { label: 'Downlink (Mbps)', value: d.downlinkMbps },
      { label: 'Round-trip (ms)', value: d.rttMs },
      { label: 'Data saver', value: d.saveData },
    ],
  },
  {
    id: 'battery',
    title: 'Battery',
    items: (d) => [
      { label: 'Level', value: `${d.levelPercent}%` },
      { label: 'Charging', value: d.charging },
    ],
  },
  { id: 'permissions', title: 'Permission states', items: (d) => Object.entries(d).map(([label, value]) => ({ label, value })) },
  { id: 'mediaDevices', title: 'Media device counts', items: (d) => Object.entries(d).map(([label, value]) => ({ label, value })) },
  {
    id: 'automation',
    title: 'Automation signals',
    items: (d) => [
      { label: 'webdriver flag', value: d.webdriverFlag },
      { label: 'Headless user agent', value: d.headlessUserAgent },
    ],
  },
  { id: 'cpuBenchmark', title: 'CPU timing', items: (d) => [{ label: 'Duration (ms)', value: d.durationMs }] },
];

function behavioralItems(b) {
  return [
    { label: 'Mouse samples', value: b.mouse.samples },
    { label: 'Clicks', value: b.mouse.clicks },
    { label: 'Mean mouse speed (px/s)', value: b.mouse.meanVelocityPxPerSec },
    { label: 'Key presses (timing only)', value: b.keyboard.keyPresses },
    { label: 'Mean key hold (ms)', value: b.keyboard.meanDwellMs },
    { label: 'Touch samples', value: b.touch.samples },
  ];
}

/** Volatile, consent-gated details. They are never part of the configuration hash. */
export function OptionalDetailsCard({ report }) {
  const entries = report
    ? OPTIONAL_VIEWS.map((view) => ({ ...view, ...selectCollector(report, view.id) }))
    : [];
  const disabled = entries.filter((e) => e.status === STATUS.DISABLED).map((e) => e.title);
  const shown = entries.filter((e) => e.status !== STATUS.DISABLED);
  const behavioral = report?.volatile?.behavioral;

  return (
    <Card
      id="optional-details"
      title="Optional details"
      subtitle="Shown only for categories you enabled. These values change between visits and are never part of the hash."
    >
      {!report ? (
        <p className="text-sm text-slate-400">No data yet.</p>
      ) : (
        <div className="space-y-4">
          {shown.map((e) => (
            <div key={e.id}>
              <h3 className="mb-2 text-xs font-semibold uppercase text-slate-400">{e.title}</h3>
              {e.data ? <KeyValue items={e.items(e.data)} /> : <Unavailable status={e.status} reason={e.reason} />}
            </div>
          ))}
          {behavioral && (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase text-slate-400">Behavioural timing</h3>
              <KeyValue items={behavioralItems(behavioral)} />
            </div>
          )}
          {(disabled.length > 0 || !behavioral) && (
            <p className="text-xs text-slate-400">
              <StatusBadge status="disabled" />{' '}
              Not collected: {[...disabled, ...(behavioral ? [] : ['Behavioural timing'])].join(', ')}. Enable categories
              under <strong>Privacy &amp; consent</strong>, then press Refresh.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

const CATEGORY_LABEL = {
  extended: 'Extended details',
  publicIp: 'Public IP (third party)',
  geolocation: 'Location (third party)',
};
const categoryOf = (id) => {
  const requires = ALL_COLLECTORS.find((c) => c.id === id)?.requires;
  return requires ? CATEGORY_LABEL[requires] ?? requires : 'Essential';
};

/** Status of every collector: collected, unsupported, disabled, failed or timed out. */
export function CollectorResultsCard({ report }) {
  return (
    <Card id="collectors" title="Collector results" subtitle="What each collector did in the latest run.">
      {!report ? (
        <p className="text-sm text-slate-400">No collectors have run yet.</p>
      ) : (
        <ul role="list" className="divide-y divide-slate-800">
          {report.diagnostics.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm" data-testid={`collector-${d.id}`}>
              <span className="min-w-[9rem] font-medium text-slate-100">{d.label}</span>
              <span className="min-w-[8rem] text-xs text-slate-400">{categoryOf(d.id)}</span>
              <StatusBadge status={d.status} />
              {d.status === STATUS.OK && <span className="text-xs text-slate-400">{d.durationMs} ms</span>}
              {d.reason && <span className="min-w-0 break-words text-xs text-slate-400">{d.reason}</span>}
            </li>
          ))}
          <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm" data-testid="collector-behavioral">
            <span className="min-w-[9rem] font-medium text-slate-100">Behavioural timing</span>
            <span className="min-w-[8rem] text-xs text-slate-400">Behavioural</span>
            <StatusBadge status={report.volatile.behavioral ? STATUS.OK : STATUS.DISABLED} />
          </li>
        </ul>
      )}
    </Card>
  );
}

/** Structured JSON, rendered locally (no editor widget, no CDN). */
export function JsonOutputCard({ report }) {
  const json = report ? JSON.stringify(report, null, 2) : '';
  return (
    <Card id="json" title="Structured JSON report">
      {!report ? (
        <p className="text-sm text-slate-400">The full report appears here after collection.</p>
      ) : (
        <details>
          <summary className="cursor-pointer text-sm text-cyan-300">
            Show JSON ({formatValue(new TextEncoder().encode(json).length)} bytes)
          </summary>
          <pre
            data-testid="report-json"
            tabIndex={0}
            className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md bg-slate-950 p-3 text-xs leading-relaxed text-slate-200"
          >
            {json}
          </pre>
        </details>
      )}
    </Card>
  );
}
