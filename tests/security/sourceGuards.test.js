import { describe, expect, it } from 'vitest';
import indexHtml from '../../index.html?raw';

/**
 * Static guards over the shipped source. They fail if someone adds a hidden
 * network path, a CDN dependency, or raw key/text capture.
 */
const sources = import.meta.glob('/src/**/*.{js,jsx}', { query: '?raw', import: 'default', eager: true });
const entries = Object.entries(sources);
const allText = (predicate = () => true) => entries.filter(([path]) => predicate(path));

describe('no unexpected network paths', () => {
  it('finds the source files (guard against an empty glob)', () => {
    expect(entries.length).toBeGreaterThan(30);
  });

  it('uses fetch() only in the consent-gated IP service', () => {
    const files = allText().filter(([, text]) => /\bfetch\s*\(/.test(text)).map(([p]) => p);
    expect(files).toEqual(['/src/services/ipGeo.js']);
  });

  it.each(['XMLHttpRequest', 'sendBeacon', 'new WebSocket', 'EventSource', 'importScripts', 'new Image(', 'navigator.serviceWorker'])(
    'never uses %s',
    (api) => {
      const hits = allText().filter(([, text]) => text.includes(api)).map(([p]) => p);
      expect(hits).toEqual([]);
    },
  );

  // `http://localhost` appears only inside user-facing advice ("open the app via http://localhost").
  const externalHosts = (text) => [...text.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map((m) => m[1].toLowerCase().replace(/\.$/, '')).filter((h) => h !== 'localhost');

  it('references only the two IP providers (plus their documentation links) as URLs, outside the citation list', () => {
    const hosts = new Set(allText((p) => p !== '/src/config/sources.js').flatMap(([, text]) => externalHosts(text)));
    // api.ipify.org / ipapi.co are requested; www.ipify.org is an informational link only.
    expect([...hosts].sort()).toEqual(['api.ipify.org', 'ipapi.co', 'www.ipify.org']);
  });

  it('the citation list contains documentation URLs only, and they are shown as text, never fetched or linked', () => {
    const hosts = new Set(externalHosts(sources['/src/config/sources.js']));
    expect([...hosts].sort()).toEqual(['developer.mozilla.org', 'github.com', 'learn.microsoft.com', 'privacysandbox.google.com', 'w3c.github.io']);
    for (const [path, text] of allText()) {
      expect(/<a\s[^>]*href=/i.test(text), `${path} must not render external links`).toBe(false);
    }
  });

  it('claims about browser products live only in the cited sources file (or the User-Agent parser)', () => {
    const named = (re) => allText().filter(([, t]) => re.test(t)).map(([p]) => p).sort();
    expect(named(/Tor Browser|resistFingerprinting|\bBrave\b/)).toEqual(['/src/config/sources.js']);
    expect(named(/\bFirefox\b|\bSafari\b/)).toEqual(['/src/collectors/browser.js', '/src/config/sources.js']);
  });

  it('keeps every request URL inside ipGeo.js', () => {
    const outside = allText((p) => p !== '/src/services/ipGeo.js' && p !== '/src/config/consentCategories.js' && p !== '/src/config/sources.js').filter(([, t]) => externalHosts(t).length > 0);
    expect(outside.map(([p]) => p)).toEqual([]);
  });

  it('disables FingerprintJS usage monitoring (it pings openfpcdn.io by default)', () => {
    const text = sources['/src/collectors/fingerprintjs.js'];
    expect(text).toMatch(/FingerprintJS\.load\(\s*\{\s*monitoring:\s*false\s*\}\s*\)/);
  });

  it('index.html has no external script, stylesheet, font or image', () => {
    expect(indexHtml).not.toMatch(/(?:src|href)\s*=\s*["']\s*(?:https?:)?\/\//i);
    expect(indexHtml).not.toMatch(/@import|<link[^>]+stylesheet[^>]+http/i);
  });

  it('does not depend on any CDN-loaded editor or icon package', () => {
    // ("Monaco" alone is excluded: it is a font name in the font-detection list.)
    for (const name of ['monaco-editor', 'cdn.jsdelivr', 'unpkg.com', 'googleapis', 'react-icons']) {
      expect(allText().filter(([, t]) => t.toLowerCase().includes(name)).map(([p]) => p)).toEqual([]);
    }
  });
});

describe('no raw keyboard or text capture in source', () => {
  it('never reads the pressed key value or key codes', () => {
    // The single allowed exception is the Escape key closing the confirmation dialog: it compares against
    // one fixed value and records nothing. Any other use of the key value still fails this guard.
    const withoutEscapeHandler = (t) => t.replaceAll("e.key === 'Escape'", '');
    for (const pattern of [/\be\.key\b/, /\bevent\.key\b/, /\.keyCode\b/, /\.which\b/, /\.charCode\b/]) {
      expect(allText().filter(([, t]) => pattern.test(withoutEscapeHandler(t))).map(([p]) => p)).toEqual([]);
    }
  });

  it('the Escape-key exception exists only in the history dialog and only as a fixed comparison', () => {
    const files = allText().filter(([, t]) => t.includes("e.key === 'Escape'")).map(([p]) => p);
    expect(files).toEqual(['/src/components/HistoryPanel.jsx']);
  });

  it('reads KeyboardEvent.code only inside the behavioural hook, and only to pair keydown with keyup', () => {
    // (Matches keyboard events only; `err.code` on storage errors is unrelated.)
    const files = allText().filter(([, t]) => /\b(?:e|ev|evt|event)\.code\b/.test(t)).map(([p]) => p);
    expect(files).toEqual(['/src/hooks/useBehavioralTracking.js']);
  });

  it('reads text-field values into state only in the views where the user names things (experiments, protection tests, reports)', () => {
    // Everything else, notably the behavioural typing box, must never read what is typed. These names and
    // labels are length-limited, stripped of control characters and escaped wherever they are shown.
    const reading = allText((p) => p.endsWith('.jsx')).filter(([, t]) => /e\.target\.value/.test(t) || /type=["']text["'][^>]*\bvalue=/.test(t) || /<input[^>]*\bvalue=\{/.test(t)).map(([p]) => p);
    expect(reading.sort()).toEqual(['/src/views/LabView.jsx', '/src/views/ProtectionView.jsx', '/src/views/ReportsView.jsx']);
  });

  it('keeps the behavioural typing box uncontrolled: no value, no onChange, no reading of its content', () => {
    const text = sources['/src/components/ActionBar.jsx'];
    const input = text.slice(text.indexOf('<input'), text.indexOf('/>', text.indexOf('<input')));
    expect(input).toContain('data-testid="typing-box"');
    expect(input).not.toMatch(/\bvalue=|\bonChange=|\bonInput=|\bonKey/);
  });
});

describe('accessibility regression guard', () => {
  it('uses no mid-gray text (slate-500..700) on the dark theme: slate-500 measured 3.7-4.2:1, below WCAG AA 4.5:1', () => {
    // (Very dark text such as text-slate-950 is legitimate on the bright cyan buttons and is not flagged.)
    const hits = allText((p) => p.endsWith('.jsx'))
      .filter(([, t]) => /text-slate-(?:500|600|700)\b/.test(t))
      .map(([p]) => p);
    expect(hits).toEqual([]);
  });
});

describe('no secrets or credentials handled', () => {
  it('contains no API keys, tokens or password fields', () => {
    for (const pattern of [/api[_-]?key/i, /secret/i, /token/i, /type=["']password["']/i, /Authorization/i]) {
      const hits = allText().filter(([, t]) => pattern.test(t)).map(([p]) => p);
      expect(hits, String(pattern)).toEqual([]);
    }
  });
});
