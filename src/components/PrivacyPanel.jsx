import { CONSENT_KEY } from '../services/consentStore';
import { HISTORY_KEY } from '../services/historyStore';
import ConsentForm from './ConsentForm';
import { Button, Card } from './ui';

/** Privacy & consent settings. Changes apply immediately and can be revoked at any time. */
export default function PrivacyPanel({ choices, onChange, onRevokeAll, saveError, storageStatus, updatedAt }) {
  const anyOn = Object.values(choices).some(Boolean);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card
        id="privacy-settings"
        className="lg:col-span-2"
        title="Privacy & consent settings"
        subtitle="Changes apply immediately. Turning a category off stops future collection and requests for it, and removes its data from the current result."
        actions={<Button variant="secondary" onClick={onRevokeAll} disabled={!anyOn}>Revoke all optional consent</Button>}
      >
        <ConsentForm choices={choices} onChange={onChange} />
        {saveError && (
          <p className="mt-3 rounded border border-amber-800 bg-amber-950 p-2 text-xs text-amber-200" role="alert">
            Your choices could not be saved ({saveError}). They apply to this page view only.
          </p>
        )}
        {storageStatus === 'corrupted' && (
          <p className="mt-3 text-xs text-slate-400">Previously saved preferences were unreadable and were reset to safe defaults.</p>
        )}
        {updatedAt && <p className="mt-3 text-xs text-slate-400">Last changed: {new Date(updatedAt).toLocaleString()}</p>}
      </Card>

      <Card id="data-handling" title="Where your data goes">
        <ul className="space-y-3 text-sm text-slate-300">
          <li>
            <strong className="text-slate-100">Processing:</strong> all signals are computed in your browser. The
            configuration hash is computed locally with Web Crypto SHA-256.
          </li>
          <li>
            <strong className="text-slate-100">Uploads:</strong> fingerprint data is never sent to any server.
          </li>
          <li>
            <strong className="text-slate-100">Third parties:</strong> only if you turn them on. Public IP lookup
            contacts <code>api.ipify.org</code>; approximate location contacts <code>ipapi.co</code>. Each is a plain
            request that includes none of your fingerprint data, but the service sees your IP address.
          </li>
          <li>
            <strong className="text-slate-100">Stored in this browser (localStorage):</strong> your choices
            (<code>{CONSENT_KEY}</code>) and snapshots you save (<code>{HISTORY_KEY}</code>). Clear them from the
            History tab or your browser settings.
          </li>
          <li>
            <strong className="text-slate-100">Never collected:</strong> which keys you press, typed text,
            credentials, or device IDs.
          </li>
        </ul>
      </Card>
    </div>
  );
}
