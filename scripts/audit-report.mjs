#!/usr/bin/env node
/**
 * Reproducible dependency-advisory report: `npm run audit:report`.
 *
 * Runs `npm audit --json` and `npm ls --all --json` locally and prints, for every advisory, its range, the
 * dependency paths that reach it, whether the project depends on it directly, what npm offers as a fix, and
 * whether the package name appears in the production build (`dist/`, if built). Writes
 * test-results/audit-report.json. It reports; it never changes dependencies, and it always exits 0 so it
 * can be used as documentation. `npm audit` itself is the gate.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const npm = (args) => spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1e8, shell: process.platform === 'win32' });
const json = (r) => { try { return JSON.parse(r.stdout); } catch { return null; } };

const audit = json(npm(['audit', '--json']));
const tree = json(npm(['ls', '--all', '--json']));
if (!audit || !tree) { console.error('Could not read npm audit / npm ls output (is npm installed and are dependencies installed?).'); process.exit(0); }

/** Every dependency path from the project root to `name`. */
function pathsTo(name) {
  const found = [];
  (function walk(node, trail) {
    for (const [child, info] of Object.entries(node.dependencies ?? {})) {
      const next = [...trail, `${child}@${info.version ?? '?'}`];
      if (child === name) found.push(next.join(' > '));
      walk(info, next);
    }
  })(tree, []);
  return [...new Set(found)];
}

function inBuild(name) {
  const dir = join(ROOT, 'dist', 'assets');
  if (!existsSync(dir)) return 'not checked (dist/ not built; run npm run build)';
  const hit = readdirSync(dir).some((f) => readFileSync(join(dir, f), 'utf8').toLowerCase().includes(name.toLowerCase()));
  return hit ? 'present in dist/ assets' : 'not present in dist/ assets';
}

const rows = Object.entries(audit.vulnerabilities ?? {}).map(([name, v]) => ({
  name,
  severity: v.severity,
  range: v.range,
  direct: v.isDirect,
  advisories: v.via.filter((x) => typeof x === 'object').map((x) => ({ title: x.title, url: x.url, range: x.range, cvss: x.cvss?.score ?? null })),
  affectedVia: v.via.filter((x) => typeof x === 'string'),
  fix: v.fixAvailable,
  paths: pathsTo(name),
  inProductionBuild: inBuild(name),
}));

console.log(`npm audit: ${JSON.stringify(audit.metadata?.vulnerabilities ?? {})}`);
for (const r of rows) {
  console.log(`\n${r.name} [${r.severity}] range ${r.range} (${r.direct ? 'direct dependency' : 'transitive'})`);
  for (const a of r.advisories) console.log(`  advisory: ${a.title} ${a.url} (CVSS ${a.cvss ?? 'n/a'}, affects ${a.range})`);
  if (r.affectedVia.length) console.log(`  vulnerable through: ${r.affectedVia.join(', ')}`);
  console.log(`  fix offered by npm: ${JSON.stringify(r.fix)}`);
  console.log(`  production build: ${r.inProductionBuild}`);
  for (const p of r.paths.slice(0, 6)) console.log(`  path: ${p}`);
}

mkdirSync(join(ROOT, 'test-results'), { recursive: true });
writeFileSync(join(ROOT, 'test-results', 'audit-report.json'), JSON.stringify({ generatedAt: new Date().toISOString(), summary: audit.metadata?.vulnerabilities, advisories: rows }, null, 2));
console.log('\nDetails: test-results/audit-report.json (report only; no dependency was changed).');
