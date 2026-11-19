import ConsentForm from './ConsentForm';
import { Button, Card } from './ui';

/** First-run screen: shown until the user has reviewed and confirmed privacy choices. */
export default function WelcomeScreen({ choices, onChange, onContinue, storageStatus }) {
  return (
    <div className="mx-auto max-w-3xl space-y-5 pt-4">
      <Card title="Before you start" subtitle="An educational demonstration of browser fingerprinting">
        <div className="space-y-2 text-sm text-slate-300">
          <p>
            This tool shows what a website can learn about your browser and device without asking you anything, and
            how those signals combine into a <strong>configuration hash</strong>.
          </p>
          <ul className="list-disc space-y-1 pl-5 text-slate-400">
            <li>Everything runs in your browser. There is no server and nothing is uploaded.</li>
            <li>Nothing is collected until you press <strong>Collect</strong>.</li>
            <li>Optional extras are off by default. You can change or revoke any choice at any time.</li>
            <li>Your choices and any snapshots you save are stored only in this browser (localStorage).</li>
          </ul>
          {storageStatus === 'unavailable' && (
            <p className="rounded border border-amber-800 bg-amber-950 p-2 text-amber-200" role="alert">
              Browser storage is unavailable, so your choices cannot be remembered after you close this page.
            </p>
          )}
          {storageStatus === 'corrupted' && (
            <p className="rounded border border-amber-800 bg-amber-950 p-2 text-amber-200" role="alert">
              Saved preferences could not be read and were reset to the safe defaults (everything optional is off).
            </p>
          )}
        </div>
      </Card>

      <Card title="Your privacy choices" subtitle="Optional categories are off. Turn on only what you want to try.">
        <ConsentForm choices={choices} onChange={onChange} />
        <div className="mt-4">
          <Button variant="primary" onClick={onContinue}>Save choices and continue</Button>
        </div>
      </Card>
    </div>
  );
}
