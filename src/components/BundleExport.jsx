import { useState } from 'react';
import { downloadText } from '../utils/download';
import { buildBundle, serialiseBundle } from '../utils/researchBundle';
import { isHashSupported } from '../utils/hash';
import { Button } from './ui';

/**
 * Export one experiment as a research bundle (JSON, generated locally). EXPORT ONLY: the application never
 * reads a bundle back in. A local script checks a file: `npm run verify:bundle -- <file>`.
 */
export default function BundleExport({ experiment }) {
  const [message, setMessage] = useState(null);

  const handle = async () => {
    if (!isHashSupported()) {
      setMessage({ type: 'error', text: 'The bundle checksum needs Web Crypto, which requires a secure context (https:// or http://localhost).' });
      return;
    }
    try {
      const bundle = await buildBundle([experiment]);
      downloadText(`research-bundle-${experiment.id.slice(0, 8)}.json`, serialiseBundle(bundle));
      setMessage({ type: 'ok', text: `Bundle downloaded (checksum ${bundle.checksum.value.slice(0, 12)}…). Verify a file with: npm run verify:bundle -- <file>` });
    } catch {
      setMessage({ type: 'error', text: 'The bundle could not be created.' });
    }
  };

  return (
    <div data-testid="bundle-export">
      <Button onClick={handle} disabled={experiment.runs.length === 0}>Download research bundle (JSON)</Button>
      <p className="mt-1 text-xs leading-relaxed text-slate-400">
        Contains the whitelisted runs, the protocol, the app and FingerprintJS versions and the analysis derived from the runs, with a SHA-256 checksum. It never contains IP, location, behavioural data or the raw User-Agent. The checksum detects accidental edits; it does not prove who made the file. This application does not import bundles.
      </p>
      {message && <p role={message.type === 'error' ? 'alert' : 'status'} className={`mt-1 text-xs ${message.type === 'error' ? 'text-red-300' : 'text-emerald-300'}`}>{message.text}</p>}
    </div>
  );
}
