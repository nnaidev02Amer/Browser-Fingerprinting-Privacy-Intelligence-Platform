#!/usr/bin/env node
/**
 * Check a research bundle file LOCALLY: `npm run verify:bundle -- <file>`.
 *
 * Verifies the schema, that no forbidden keys are present, that the checksum matches, and that the analysis
 * re-derived from the included runs equals the stored analysis. Reads one local file; makes no network
 * request. A passing result means the file is internally consistent. It does NOT prove who made it or that
 * the runs came from a real browser.
 *
 * Exit code: 0 verified, 1 problems found, 2 usage or unreadable file.
 */
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const MAX_BYTES = 5 * 1024 * 1024;
const file = process.argv[2];
if (!file) {
  console.error('Usage: npm run verify:bundle -- <path-to-bundle.json>');
  process.exit(2);
}

let bundle;
try {
  const path = resolve(file);
  if (statSync(path).size > MAX_BYTES) throw new Error('file is larger than 5 MB');
  bundle = JSON.parse(readFileSync(path, 'utf8'));
} catch (error) {
  console.error(`Cannot read the bundle: ${error.message}`);
  process.exit(2);
}

const { verifyBundle } = await import('../src/utils/researchBundle.js');
const result = await verifyBundle(bundle);
for (const [name, ok] of Object.entries(result.checks)) console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`);
for (const problem of result.problems) console.log(`  - ${problem}`);
console.log(result.ok
  ? 'Bundle is internally consistent (checksum and re-derived analysis match). This does not prove authorship.'
  : 'Bundle did NOT verify.');
process.exit(result.ok ? 0 : 1);
