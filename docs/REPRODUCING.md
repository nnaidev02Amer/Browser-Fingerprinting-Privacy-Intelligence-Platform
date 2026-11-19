# Reproducing the results

Everything runs locally. Nothing is uploaded.

## Environment

- Node.js **22.12 or newer** (`.nvmrc` pins 24; `package.json` `engines` states the minimum). Vitest 5 needs 22.12+.
- Use the lockfile: `npm ci` (not `npm install`) for the exact dependency versions.
- For the browser check: Google Chrome and/or Microsoft Edge installed (see README, "Pre-submission check").

## Commands and what to expect

| Step | Command | Expected |
|---|---|---|
| Install | `npm ci` | completes without error |
| Lint | `npm run lint` | exit 0, no output |
| Unit and UI tests | `npm test` | all test files pass (the exact counts are in the README) |
| Production build | `npm run build` | exit 0 |
| Real browsers | `npm run test:browser` | `PASSED` per installed browser; `SKIPPED (not found)` otherwise |
| Advisory facts | `npm run audit:report` | prints advisories, dependency paths and the `dist/` check |

The stable hash is pinned by a golden test (`tests/utils/fingerprint.test.js`, "produces the exact Stage 2 golden
hash"). If the hash algorithm or its inputs change, that test fails.

## Reproducing an experiment result from a research bundle

1. In the app, open **Reports > Research bundle** (or the Protection test results) and download the bundle JSON.
2. Verify it locally: `npm run verify:bundle -- path/to/bundle.json`.
   - It checks the schema, that no forbidden keys (IP, location, behavioural data, raw User-Agent, session ids)
     are present, that the SHA-256 checksum matches, and that the analysis **re-derived from the included runs**
     equals the stored analysis.
3. A pass means the file is internally consistent. It does **not** prove who made it or that the runs came from a
   real browser. The application itself never imports bundles.

## Reproducing the browser check

`npm run test:browser` builds the app, serves it on a free local port, and drives each installed browser over the
DevTools protocol. Results are per browser and are written to `test-results/browser-results.json` with the
browser versions. It covers Chrome and Edge only; Firefox and Brave are not tested.

## Continuous integration

`.github/workflows/ci.yml` runs install, lint, unit tests and the production build on Node 22 and 24. It does not
run the browser check: Chrome and Edge availability on hosted runners has not been verified for this project, so
the browser check is a local pre-submission step.

## What cannot be reproduced

Results describe one browser build on one machine at one time. Browser updates, settings, and hardware change
fingerprints, so the same steps on another machine are expected to give different values. Reproducibility here
means the same procedure and analysis, not the same fingerprint.
