# Known issues

## 1. `picomatch` advisory (open, no patched release)

**Status check on 2026-11-19:** `npm audit` now reports **0 vulnerabilities** for this project, although the installed `picomatch` is still 4.0.7 and 4.0.7 is still the latest published version. I did not find out why the report changed (the advisory may have been withdrawn or its affected range edited upstream) and have not verified it. Treat the table below as the record of what was reported earlier, and re-run `npm audit` and `npm run audit:report` before submission rather than relying on either statement.

Reproduce the facts below with `npm run audit:report` (after `npm run build`, so it can also check `dist/`).

| Item | Detail |
|---|---|
| Advisory | [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf): "picomatch vulnerable to ReDoS through single-branch repeated extglobs" |
| Class | CWE-1333 (inefficient regular expression complexity) |
| Severity | High, CVSS 7.5 (`CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H`): availability impact only (no confidentiality or integrity impact) |
| Affected | `picomatch` <= 4.0.7 |
| Installed | 4.0.7 |
| Latest published | 4.0.7 when last checked (2026-11-19): **no patched version exists** |
| How it is reached | `vite@7.3.8` > `picomatch`; `vite` > `fdir` > `picomatch`; `vite` > `tinyglobby` > `picomatch`; `vitest@5.1.0` > `picomatch` (also `vitest` > `tinyglobby`) |
| Reported by `npm audit` as | 5 high-severity entries: `picomatch`, `fdir`, `tinyglobby`, plus our two direct tools `vite` and `vitest` (flagged only because they depend on the above) |
| Direct dependency? | No. `vite` and `vitest` are our direct (development) tools; `picomatch`, `fdir` and `tinyglobby` are transitive. |
| In the shipped bundle? | No. `npm run audit:report` searched `dist/assets` after a build. |
| Fix offered by npm | `npm audit fix --force`, which would **downgrade** Vite to 6.2.7 and Vitest to 3.1.4. Both are breaking changes. **Not applied.** |

**What this does and does not mean.** The vulnerability is a regular-expression denial of service: it requires a
crafted glob pattern to be matched. This project passes only patterns from its own configuration to the build
tooling. I have **not** audited every place the tooling calls `picomatch`, so this is described as a
development-tooling denial-of-service risk with no available fix, not as "safe". Nothing here affects the
fingerprint data the application handles, and `picomatch` is not part of what a user's browser downloads.

**Action.** Re-run `npm audit` (and `npm view picomatch dist-tags`) before submission. When a patched `picomatch`
is published, `npm update picomatch` (a lockfile-only change within the declared ranges) should clear all five.

## 2. Other limits worth knowing

- FingerprintJS 4.6.2 is licensed under BUSL-1.1 (not MIT). See the README's "Attribution and licensing". This is
  unresolved until your supervisor decides.
- Only Chromium-based browsers (Chrome 157, Edge 157) have been tested in a real browser.
- The upstream repository has no `LICENSE` file.
