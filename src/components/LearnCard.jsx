import { Card } from './ui';

const STEPS = [
  ['Collect', 'Press Collect fingerprint. Your browser is asked a set of questions, all on this device.'],
  ['Read', 'See which details your browser gave away and what each one could reveal.'],
  ['Experiment', 'Change one setting yourself and test whether the answers change.'],
  ['Save and compare', 'Save results and compare them later, or export a report.'],
];

const WORDS = [
  ['Signal', 'One piece of information your browser shares, such as your screen size or time zone.'],
  ['Fingerprint hash', 'A short code (SHA-256) made from your stable signals. The same setup gives the same code. It describes a browser setup, not a person.'],
  ['Stable signal', 'A signal that normally stays the same between visits. Only these are used for the hash.'],
  ['Variable signal', 'A signal that changes (for example the battery level). It is shown but never used for the hash.'],
  ['Consent', 'Your permission. Optional extras are off until you turn them on, and you can turn them off again at any time.'],
];

/** Plain explanation of browser fingerprinting, how to use the tool, and the key words. */
export default function LearnCard({ open }) {
  return (
    <Card id="learn" title="New here? Start with the basics">
      <details open={open} className="group">
        <summary className="cursor-pointer text-sm font-medium text-cyan-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">
          What is browser fingerprinting?
        </summary>
        <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate-300" data-testid="learn-body">
          <p>
            Every browser shares small details about itself with the websites you visit: its version, your screen size, your time zone, the fonts you have and more.
            Each one is ordinary, but <strong className="text-slate-100">together they can look the same every time you visit</strong>. A website can use that pattern to
            recognise your browser again, even if you clear your cookies. That is called browser fingerprinting.
          </p>
          <p>
            This tool shows you which details your browser shares, explains what each one could reveal, and lets you test what happens when you change a setting.
            Everything is worked out on your own device. Nothing is sent to any server.
          </p>
          <p className="text-slate-400">
            One important limit: the fingerprint hash describes a browser setup. It is <strong>not</strong> a unique ID for you or your device, and this tool does not say how rare or common your setup is.
          </p>

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">How to use this tool</h3>
            <ol className="grid gap-2 sm:grid-cols-2">
              {STEPS.map(([title, text], i) => (
                <li key={title} className="flex gap-3 rounded-xl border border-slate-700 bg-slate-950/60 p-3.5">
                  <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cyan-500 text-xs font-semibold text-slate-900">{i + 1}</span>
                  <span><strong className="text-slate-100">{title}.</strong> {text}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </details>

      <details className="mt-3">
        <summary className="cursor-pointer text-sm font-medium text-cyan-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">
          Words used in this tool
        </summary>
        <dl className="mt-3 space-y-2 text-sm" data-testid="glossary">
          {WORDS.map(([term, meaning]) => (
            <div key={term}>
              <dt className="font-medium text-slate-100">{term}</dt>
              <dd className="text-slate-300">{meaning}</dd>
            </div>
          ))}
        </dl>
      </details>
    </Card>
  );
}
