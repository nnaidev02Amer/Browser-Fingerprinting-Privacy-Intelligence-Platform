#!/usr/bin/env node
/**
 * Real-browser regression check: `npm run test:browser`.
 *
 * Builds the app, serves the production build locally, and drives each installed browser (Chrome, Edge)
 * headlessly over the DevTools protocol, using only Node built-ins (no new dependencies). Results are kept
 * PER BROWSER and never merged.
 *
 * Browsers: set CHROME_PATH / EDGE_PATH, or the standard install locations are tried. A browser that is not
 * found is reported as SKIPPED, never as passed. Firefox and Brave are not driven by this script.
 *
 * Exit code: 0 all run browsers passed, 1 a check failed, 2 no supported browser was found.
 * Output: test-results/browser-results.json (browser versions, OS, every check).
 *
 * The "injected noise" scenario uses a STAND-IN script that randomises canvas and audio reads. It checks that
 * the app DETECTS randomised reads; it is not a real browser protection and says nothing about any browser's.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

// ------------------------------------------------------------------ browsers
const CANDIDATES = {
  chrome: [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  ],
  edge: [
    process.env.EDGE_PATH,
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/microsoft-edge', '/usr/bin/microsoft-edge-stable',
  ],
};
const findBrowser = (name) => CANDIDATES[name].find((p) => p && existsSync(p)) ?? null;

function freePort() {
  return new Promise((res, rej) => {
    const server = net.createServer();
    server.once('error', rej);
    server.listen(0, '127.0.0.1', () => { const { port } = server.address(); server.close(() => res(port)); });
  });
}

// ------------------------------------------------------------------ build + serve
function build() {
  const vite = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
  const r = spawnSync(process.execPath, [vite, 'build'], { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) { console.error(r.stdout, r.stderr); throw new Error('Build failed'); }
}

async function serve() {
  const port = await freePort();
  const vite = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
  const child = spawn(process.execPath, [vite, 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  const url = `http://127.0.0.1:${port}/`;
  for (let i = 0; i < 60; i += 1) {
    try { if ((await fetch(url)).ok) return { child, url }; } catch { /* not ready */ }
    await sleep(250);
  }
  child.kill();
  throw new Error('Preview server did not start');
}

// ------------------------------------------------------------------ one browser session
async function openSession(exe, appUrl) {
  const port = await freePort();
  const profile = mkdtempSync(join(tmpdir(), 'fp-browser-test-'));
  const proc = spawn(exe, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });
  let wsUrl;
  for (let i = 0; i < 80 && !wsUrl; i += 1) {
    try { wsUrl = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page')?.webSocketDebuggerUrl; } catch { /* wait */ }
    if (!wsUrl) await sleep(250);
  }
  if (!wsUrl) { proc.kill(); throw new Error('Browser did not start'); }

  const ws = new WebSocket(wsUrl);
  await new Promise((r) => { ws.addEventListener('open', r); });
  let nextId = 0;
  const pending = new Map();
  const requests = [];
  const pageErrors = [];
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Network.requestWillBeSent') requests.push(m.params.request.url);
    if (m.method === 'Runtime.exceptionThrown') pageErrors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  });
  const send = (method, params = {}) => new Promise((res) => { nextId += 1; pending.set(nextId, res); ws.send(JSON.stringify({ id: nextId, method, params })); });
  const ev = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.error) throw new Error(r.error.message);
    if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 250));
    return r.result.result.value;
  };
  const waitFor = async (expr, ms = 30000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { try { if (await ev(expr)) return true; } catch { /* retry */ } await sleep(120); }
    return false;
  };

  await send('Network.enable'); await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

  const api = {
    ev, send, waitFor, requests, pageErrors,
    external: () => requests.filter((u) => !u.startsWith(appUrl.slice(0, -1)) && !u.startsWith('data:') && !u.startsWith('blob:')),
    clickBtn: (re) => ev(`(() => { const b=[...document.querySelectorAll('button')].find(b=>new RegExp(${JSON.stringify(re)}).test(b.textContent.trim()) && !b.disabled); if(!b) return false; b.click(); return true; })()`),
    nav: (label) => ev(`(() => { const b=[...document.querySelectorAll('nav[aria-label=Sections] button')].find(b=>b.textContent.trim()===${JSON.stringify(label)}); if(!b) return false; b.click(); return true; })()`),
    typeInto: async (selector, text) => { await ev(`(() => { const e=document.querySelector(${JSON.stringify(selector)}); e.focus(); e.select(); })()`); await send('Input.insertText', { text }); },
    setSelect: (selector, value) => ev(`(() => { const s=document.querySelector(${JSON.stringify(selector)}); const set=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set; set.call(s, ${JSON.stringify(value)}); s.dispatchEvent(new Event('change',{bubbles:true})); return s.value; })()`),
    toggleSwitch: (title) => ev(`(() => { const l=[...document.querySelectorAll('label')].find(l=>l.textContent.includes(${JSON.stringify(title)})); const i=document.getElementById(l.htmlFor); i.click(); return i.checked; })()`),
    settle: async () => { await sleep(300); await waitFor('!/Collecting…|Simulating…|Recording…/.test(document.body.textContent)', 45000); await sleep(200); },
    cookies: async () => (await send('Network.getCookies', { urls: [appUrl] })).result.cookies.filter((c) => c.name === 'fpp_sim_tracker'),
    ls: (k) => ev(`localStorage.getItem(${JSON.stringify(k)})`),
    text: () => ev('document.body.textContent'),
    goto: async () => { await send('Page.navigate', { url: appUrl }); await waitFor("!!document.querySelector('h1')"); await sleep(600); },
    reload: async () => { await send('Page.reload'); await waitFor("!!document.querySelector('h1')"); await sleep(600); },
    close: () => { try { ws.close(); } catch { /* ignore */ } proc.kill(); setTimeout(() => { try { rmSync(profile, { recursive: true, force: true }); } catch { /* ignore */ } }, 800); },
  };
  return api;
}

// ------------------------------------------------------------------ bundle verification (local script)
function verifyBundleText(text, label) {
  const dir = join(ROOT, 'test-results');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `bundle-${label}.json`);
  writeFileSync(path, text);
  const r = spawnSync(process.execPath, ['--import', './scripts/register-resolve.mjs', 'scripts/verify-bundle.mjs', path], { cwd: ROOT, encoding: 'utf8' });
  return { status: r.status, output: r.stdout };
}

// ------------------------------------------------------------------ the checks
async function runChecks(b) {
  const results = [];
  const check = (group, name, ok, detail = '') => { results.push({ group, name, ok: Boolean(ok), detail: ok ? '' : String(detail).slice(0, 300) }); console.log(`  ${ok ? 'ok  ' : 'FAIL'} [${group}] ${name}${ok ? '' : `  -> ${String(detail).slice(0, 200)}`}`); };
  // Time-zone override that is VERIFIED: the override can lag behind the reload, which would silently
  // make a "baseline" run under the wrong zone. Retry until the page really reports the expected zone.
  let originalTz = null;
  const pageTz = () => b.ev('Intl.DateTimeFormat().resolvedOptions().timeZone');
  const setTz = async (id) => {
    const expected = id || originalTz;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await b.send('Emulation.setTimezoneOverride', { timezoneId: id });
      await b.reload();
      if (!expected || (await pageTz()) === expected) return true;
      await sleep(600);
    }
    throw new Error(`time zone did not become ${expected}`);
  };
  // A baseline must run under the ORIGINAL zone: re-check right before recording, and re-apply if it drifted.
  const ensureBaselineTz = async (tab) => {
    if ((await pageTz()) === originalTz) return;
    await setTz('');
    await b.nav(tab); await sleep(300);
    await b.ev("document.querySelector('input[name=protection]').click()"); await sleep(300);
  };
  const outcome = (a) => b.ev(`document.querySelector('[data-testid="protect-attr-${a}"]')?.dataset.outcome`);

  // ---- first run and consent
  await b.goto();
  originalTz = await pageTz();
  check('consent', 'first run shows the privacy choices, nothing collected, no external request', /Before you start/.test(await b.text()) && b.external().length === 0);
  check('consent', 'all four optional switches start OFF', JSON.stringify(await b.ev("[...document.querySelectorAll('input[role=switch]')].map(i=>i.checked)")) === '[false,false,false,false]');
  await b.clickBtn('Save choices and continue'); await sleep(400);
  check('navigation', 'sidebar has an "Experiments" group with the two experiment pages', JSON.stringify(await b.ev("(() => { const g=document.querySelector('nav[aria-label=Sections] [role=group][aria-label=Experiments]'); return g ? [...g.querySelectorAll('button')].map(x=>x.textContent.trim()) : null; })()")) === JSON.stringify(['Laboratory', 'Protection test']));

  // ---- collection and hash
  await b.clickBtn('^Collect fingerprint$'); await b.settle();
  const hash0 = await b.ev("document.querySelector('[data-testid=config-hash]')?.textContent");
  check('hash', 'SHA-256 configuration hash generated', /^[0-9a-f]{64}$/.test(hash0 ?? ''));
  const report = await b.ev("JSON.parse(document.querySelector('[data-testid=report-json]').textContent)");
  const d = report.details;
  check('hash', 'all 10 stable signals collected', report.stableFingerprint.signalsCollected === 10 && !report.stableFingerprint.incomplete);
  check('repeat-read', 'canvas, audio and WebGL readback are consistent on a normal run', d.canvas.consistent === true && d.audio.consistent === true && d.webgl.readbackCheck?.consistent === true);
  check('hash', 'repeat-read flags are not part of the hashed signals', !('consistent' in report.stableFingerprint.signals.audio) && !('readbackCheck' in report.stableFingerprint.signals.webgl));
  await b.reload(); await b.clickBtn('^Collect fingerprint$'); await b.settle();
  check('hash', 'the hash is identical after a page reload in the same profile', (await b.ev("document.querySelector('[data-testid=config-hash]')?.textContent")) === hash0);

  // ---- protection test, A-B-A + optional A3, real change (time zone)
  await b.nav('Protection test'); await sleep(300);
  await b.typeInto('#protection-name', 'Time zone'); await b.clickBtn('^Create$'); await sleep(400);
  await b.clickBtn('^Record A1$'); await b.settle();
  await setTz('America/New_York'); await b.nav('Protection test'); await sleep(300);
  await b.ev("document.querySelector('input[name=protection]').click()"); await sleep(300);
  await b.typeInto('#change-label', 'Time zone New York'); await b.clickBtn('^Record B$'); await b.settle();
  await setTz(''); await b.nav('Protection test'); await sleep(300);
  await b.ev("document.querySelector('input[name=protection]').click()"); await sleep(300);
  check('protection-test', 'A3 is not offered before A2', (await b.ev("!!document.querySelector('[data-testid=step-protect-a3]')")) === false);
  await ensureBaselineTz('Protection test');
  await b.clickBtn('^Record A2$'); await b.settle();
  check('protection-test', 'results are complete with A-B-A alone; A3 is offered as optional', (await b.ev("!!document.querySelector('[data-testid=protection-results]')")) && /Optional/.test(await b.ev("document.querySelector('[data-testid=step-protect-a3]')?.textContent ?? ''")));
  check('protection-test', 'locale changed beyond the noise floor', (await outcome('locale')) === 'changed', await outcome('locale'));
  check('protection-test', 'screen, hardware, canvas, webgl, audio, fonts unaffected', (await Promise.all(['screen', 'hardware', 'canvas', 'webgl', 'audio', 'fonts'].map(outcome))).every((o) => o === 'unaffected'));
  await b.reload(); await b.nav('Protection test'); await sleep(300);
  await b.ev("document.querySelector('input[name=protection]').click()"); await sleep(300);
  await ensureBaselineTz('Protection test');
  await b.clickBtn('^Record A3$'); await b.settle();
  const t1 = await b.ev("document.querySelector('[data-testid=protection-results]').textContent");
  check('protection-test', 'A3 recorded; noise floor now uses three baselines', /three baselines had the same hash/.test(t1) && /Three baselines/.test(await b.ev("document.querySelector('[data-testid=protection-caveats]').textContent")), t1.slice(0, 200));
  check('protection-test', 'locale is still attributed to the setting with A3 (stable across all baselines)', (await outcome('locale')) === 'changed');
  check('protection-test', 'no privacy-verdict wording', !/\bprotected\b|\bprotects\b|\bsafe\b|\bscore\b|\d+\s*%/i.test(t1));

  // ---- findings and research bundle export (real browser)
  await b.ev("window.__bundleText = null; const orig = URL.createObjectURL; URL.createObjectURL = (blob) => { blob.text().then((t) => { window.__bundleText = t; }); return orig(blob); };");
  await b.clickBtn('^Download research bundle');
  const gotBundle = await b.waitFor('window.__bundleText !== null', 10000);
  check('export', 'the Protection results offer a research bundle download', gotBundle);
  const bundleText = gotBundle ? await b.ev('window.__bundleText') : '{}';
  const bundle = JSON.parse(bundleText);
  check('export', 'bundle has schema, versions, protocol with the optional A3 step, and a SHA-256 checksum', bundle.schema === 'fpp-research-bundle' && bundle.generator?.hashInputVersion === 'fp-v1' && /^\d+\./.test(bundle.generator?.applicationVersion ?? '') && /^\d+\./.test(bundle.generator?.fingerprintjsVersion ?? '') && Object.values(bundle.protocols ?? {})[0]?.steps?.some((x) => x.id === 'protect-a3' && x.optional) && /^[0-9a-f]{64}$/.test(bundle.checksum?.value ?? ''), bundleText.slice(0, 200));
  check('export', 'bundle contains no IP, location, behavioural data or raw User-Agent', !/"ip"|"publicIp"|latitude|keyboard|"userAgent"|"sessionId"/.test(bundleText));
  const good = verifyBundleText(bundleText, 'good');
  check('export', 'npm run verify:bundle accepts the downloaded bundle (checksum and re-derived analysis match)', good.status === 0, good.output);
  const tampered = JSON.parse(bundleText);
  const firstRun = Object.values(tampered.experiments)[0].runs[0];
  firstRun.signals.hardware.cpuLogicalCores = 1; // edit a measured value
  const bad = verifyBundleText(JSON.stringify(tampered), 'tampered');
  check('export', 'a tampered copy is rejected by the verifier', bad.status === 1 && /Checksum mismatch/.test(bad.output), bad.output);
  await b.nav('Privacy risks'); await sleep(500);
  const finding = await b.ev("(() => { const f=[...document.querySelectorAll('[data-testid^=finding-]')].find(e=>e.dataset.rule==='F1'); return f ? f.textContent : null; })()");
  check('findings', 'the Exposure view lists a finding for the real time-zone change, tagged as measured in this environment', Boolean(finding) && /Language & time zone/.test(finding) && /Experiment|experiment/.test(finding), finding);
  check('findings', 'findings are grouped under the browser environment, and recommendations name an action', await b.ev("!!document.querySelector('[data-testid^=findings-]') && [...document.querySelectorAll('[data-testid^=recommendation-rec-effect]')].every(r=>/What to do:/.test(r.textContent))"));
  await b.nav('Protection test'); await sleep(300);
  await b.ev("document.querySelector('input[name=protection]').click()"); await sleep(300);

  // ---- distinguishability panel for the protection test just recorded
  await b.nav('Protection test'); await sleep(300);
  await b.ev("document.querySelector('input[name=protection]').click()"); await sleep(300);
  const plain = await b.ev("document.querySelector('[data-testid=distinct-plain]')?.textContent ?? ''");
  check('distinguishability', 'plain-language panel names the time-zone detail as what tells the setups apart, without percentages', /Language & time zone/.test(plain) && !/d+s*%|entropy/i.test(plain), plain);

  // ---- STAND-IN noise (not a real protection)
  await b.nav('Protection test'); await sleep(300);
  await b.typeInto('#protection-name', 'Stand-in noise'); await b.clickBtn('^Create$'); await sleep(400);
  await b.clickBtn('^Record A1$'); await b.settle();
  const noise = `(() => {
    const g = CanvasRenderingContext2D.prototype.getImageData;
    CanvasRenderingContext2D.prototype.getImageData = function (...a) { const r = g.apply(this, a); for (let i = 0; i < r.data.length; i += 97) r.data[i] = (r.data[i] + 1 + Math.floor(Math.random() * 3)) & 255; return r; };
    const c = AudioBuffer.prototype.getChannelData;
    AudioBuffer.prototype.getChannelData = function (n) { const x = c.call(this, n); for (let i = 0; i < x.length; i += 50) x[i] += (Math.random() - 0.5) * 1e-6; return x; };
  })();`;
  const injected = (await b.send('Page.addScriptToEvaluateOnNewDocument', { source: noise })).result.identifier;
  await b.reload(); await b.nav('Protection test'); await sleep(300);
  await b.ev("document.querySelector('input[name=protection]').click()"); await sleep(300);
  await b.typeInto('#change-label', 'Stand-in noise'); await b.clickBtn('^Record B$'); await b.settle();
  await b.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: injected });
  await b.reload(); await b.nav('Protection test'); await sleep(300);
  await b.ev("document.querySelector('input[name=protection]').click()"); await sleep(300);
  await b.clickBtn('^Record A2$'); await b.settle();
  check('stand-in-noise', 'canvas and audio reads detected as randomised (stand-in, NOT a real protection)', (await outcome('canvas')) === 'randomised' && (await outcome('audio')) === 'randomised', `${await outcome('canvas')} / ${await outcome('audio')}`);
  check('stand-in-noise', 'the result says a changed hash is not evidence of better privacy', await b.ev("/not evidence of better privacy/.test(document.querySelector('[data-testid=protection-caveats]').textContent)"));

  // ---- removed pages stay removed
  const navLabels = await b.ev("[...document.querySelectorAll('nav[aria-label=Sections] button')].map(x=>x.textContent.trim())");
  check('navigation', 'Analytics and the tracking experiment are not in the navigation', !navLabels.some((l) => /analytics|tracking/i.test(l)), JSON.stringify(navLabels));
  check('navigation', 'no cookie or tracking identifier is ever created by the app', (await b.cookies()).length === 0 && (await b.ls('fpp.sim.trackerId')) === null && (await b.ls('fpp.sim.v1')) === null);

  // ---- consent: granting and revoking an optional category (real browser)
  await b.nav('Privacy & consent'); await sleep(300);
  const consentOf = async () => JSON.parse(await b.ls('fpp.consent.v1')).choices.extended;
  check('consent', 'the optional extended details start OFF', (await consentOf()) === false);
  await b.toggleSwitch('Extended device & environment details'); await sleep(300);
  check('consent', 'turning it on is saved', (await consentOf()) === true);
  await b.toggleSwitch('Extended device & environment details'); await sleep(300);
  check('revocation', 'turning it off is saved immediately', (await consentOf()) === false);

  // ---- evidence discipline
  await b.nav('Privacy risks'); await sleep(400);
  const x = await b.text();
  check('evidence', 'documented mechanisms cite official sources; unverified Firefox/Tor/Brave claims are absent', /learn\.microsoft\.com/.test(x) && /w3c\.github\.io/.test(x) && /Firefox and Tor Browser were removed/.test(x) && !/randomises canvas|standardises many values/.test(x));

  // ---- guarantees
  check('privacy', 'NO external request was made during the whole run', b.external().length === 0, JSON.stringify(b.external()));
  check('privacy', 'no uncaught page errors', b.pageErrors.length === 0, JSON.stringify(b.pageErrors));
  return results;
}

// ------------------------------------------------------------------ main
const found = Object.fromEntries(Object.keys(CANDIDATES).map((n) => [n, findBrowser(n)]));
console.log('Browsers: ' + Object.entries(found).map(([n, p]) => `${n}=${p ? 'found' : 'NOT FOUND'}`).join(', ') + '. Firefox and Brave are not tested by this script.');
if (!Object.values(found).some(Boolean)) {
  console.error('No supported browser (Chrome or Edge) was found. Set CHROME_PATH or EDGE_PATH. Nothing was verified.');
  process.exit(2);
}

console.log('Building...');
build();
const { child: server, url } = await serve();
console.log(`Serving the production build at ${url}\n`);

const summary = [];
let failed = 0;
try {
  for (const [name, exe] of Object.entries(found)) {
    if (!exe) { summary.push({ browser: name, status: 'SKIPPED (not found)' }); console.log(`== ${name}: SKIPPED (not found)\n`); continue; }
    let session;
    try {
      session = await openSession(exe, url);
      const userAgent = await session.ev('navigator.userAgent');
      console.log(`== ${name}\n   ${userAgent}`);
      const checks = await runChecks(session);
      const bad = checks.filter((c) => !c.ok).length;
      failed += bad;
      summary.push({ browser: name, status: bad ? 'FAILED' : 'PASSED', userAgent, passed: checks.length - bad, failed: bad, checks });
      console.log(`   ${name}: ${checks.length - bad} passed, ${bad} failed\n`);
    } catch (error) {
      failed += 1;
      summary.push({ browser: name, status: 'ERROR', error: String(error?.message ?? error) });
      console.log(`   ${name}: ERROR ${error?.message ?? error}\n`);
    } finally {
      session?.close();
    }
  }
} finally {
  server.kill();
}

mkdirSync(join(ROOT, 'test-results'), { recursive: true });
writeFileSync(join(ROOT, 'test-results', 'browser-results.json'), JSON.stringify({ generatedAt: new Date().toISOString(), node: process.version, platform: `${process.platform} ${process.arch}`, results: summary }, null, 2));
console.log('Summary (per browser, never merged):');
for (const s of summary) console.log(`  ${s.browser}: ${s.status}${s.passed !== undefined ? ` (${s.passed} passed, ${s.failed} failed)` : ''}`);
console.log('Details: test-results/browser-results.json');
process.exit(failed ? 1 : 0);
