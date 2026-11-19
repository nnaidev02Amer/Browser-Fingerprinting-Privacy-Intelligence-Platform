# Browser Fingerprinting & Privacy Intelligence Platform

An educational web application that shows **what a website can learn about your browser and device without asking you anything**, and helps you understand the privacy risk that comes with it.

It is a final-year academic research prototype built with React. It runs **entirely in your browser**: there is no server, no database and no user account. Your fingerprint data is never uploaded.

> **Important.** The "configuration hash" this tool produces describes a browser *setup*. It is **not** a unique ID for you or your physical device, and the tool does **not** calculate a privacy score. See [Limitations](#12-limitations-and-future-scope).

## Contents

1. [Overview](#1-overview)
2. [Problem statement and objectives](#2-problem-statement-and-objectives)
3. [What is browser fingerprinting?](#3-what-is-browser-fingerprinting)
4. [How the project works](#4-how-the-project-works)
5. [Features and tabs](#5-features-and-tabs)
6. [Technologies used](#6-technologies-used)
7. [Project structure](#7-project-structure)
8. [Installation and setup](#8-installation-and-setup)
9. [Running and testing](#9-running-and-testing)
10. [Privacy, consent and local data](#10-privacy-consent-and-local-data)
11. [Screenshots](#11-screenshots)
12. [Limitations and future scope](#12-limitations-and-future-scope)
13. [Attribution and licensing](#13-attribution-and-licensing)

---

## 1. Overview

Every web browser shares small details about itself with the websites you visit, such as its version, your screen size, your time zone and the fonts installed on your computer. Each detail looks harmless, but **together they can form a pattern that stays the same between visits**. A website can use that pattern to recognise your browser again, even after you clear your cookies.

This project lets you:

- **See** which details your browser shares.
- **Combine** the stable ones into one short code (a SHA-256 hash).
- **Understand** what each detail reveals and why it matters.
- **Experiment** by changing a browser setting yourself and checking whether the fingerprint changes.
- **Save, compare and export** your results as a report.

The application's full name in the interface is *Browser Fingerprinting & Privacy Intelligence Platform*. It is a learning and research tool, not a tracking product.

## 2. Problem statement and objectives

**Problem.** Most people know about cookies, but few know that a browser can be recognised without them. Browser fingerprinting is hard to see, hard to explain, and hard to test, so users and students have little way to learn what their own browser gives away.

**Objectives**

1. Show, in plain language, which signals a browser exposes.
2. Separate **stable** signals (they rarely change) from **variable** signals (they change often) and build a hash from the stable ones only.
3. Explain what each signal exposes and how it can help tell browser setups apart.
4. Let users run small, repeatable experiments to see how settings change the fingerprint.
5. Keep everything private: collect only what the user agrees to, process it locally, and never upload fingerprint data.
6. Produce a local research report that a student or faculty member can read, print or archive.

## 3. What is browser fingerprinting?

**Browser fingerprinting** is a way of recognising a browser by combining many small details it reveals, instead of storing a cookie on it.

**Simple example.** Imagine two visitors:

| Detail | Visitor A | Visitor B |
|---|---|---|
| Browser | Chrome | Firefox |
| Screen size | 1920 × 1080 | 1366 × 768 |
| Time zone | Asia/Kolkata | Europe/London |
| Installed fonts | A long list | A shorter list |

Any one of these details is shared by millions of people. But the *combination* of all of them can be rare. A website could combine them into one code and recognise Visitor A again on the next visit, with no cookie involved. (This table is only an illustration; it is not data produced by the app.)

**Key terms**

- **Signal**: one piece of information the browser shares (for example, the screen size).
- **Stable signal**: a signal that normally stays the same between visits. Only these go into the hash.
- **Variable signal**: a signal that changes (for example, battery level). It is shown but never hashed.
- **Hash (SHA-256)**: a one-way function that turns any input into a fixed-length code. The same input always gives the same code, and a small change gives a completely different code.
- **Consent**: your permission. Optional collectors are off until you turn them on.

## 4. How the project works

1. **Consent.** On the first visit you see a welcome screen with your privacy choices. Nothing is collected yet. You confirm your choices and continue.
2. **Collect.** You press **Collect fingerprint**. The app runs its *collectors* (small modules that each read one kind of signal). The collectors run at the same time. Each has its own time limit (between 1 and 8 seconds, depending on the collector) and its own error handling, so one slow or failing collector cannot break the others. Optional collectors whose consent is off are **not run at all** and are reported as *Disabled*.
3. **Separate.** Each stable collector contributes only its stable fields to the hash input. Everything else is kept under `details` (full output) or `volatile` (optional, consent-gated, never hashed).
4. **Hash.** The stable signals are written as canonical JSON (keys sorted, so order never matters) and hashed with SHA-256 using the browser's built-in Web Crypto API.
5. **Review.** The dashboard shows the hash, the status of every collector, and plain-English explanations.
6. **Save, experiment, compare, export.** You can save a snapshot, run experiments, compare snapshots, and download a report.

The result is one JSON object with: `stableFingerprint` (the hash, the hash-input version `fp-v1`, and exactly what was hashed), `details` (full output of the stable collectors), `volatile` (optional data, never hashed), `diagnostics` (status and timing of every collector) and `meta` (timestamp, a random session ID, your consent choices, `fingerprintDataTransmitted: false`, and which third parties, if any, were contacted).

**Collector statuses** are always one of: *Collected*, *Unsupported* (the browser lacks the feature), *Disabled* (consent not granted or revoked), *Failed* or *Timed out*. A failed collector adds only its status to the hash input, never its error message, so the hash stays predictable; the dashboard then marks the hash as **incomplete**, because it will not match a complete one.

**What is collected**

| Collector | Reads | Consent | In the hash? |
|---|---|---|---|
| FingerprintJS | a visitor ID from the FingerprintJS library (v4.6.2). Its built-in usage reporting is switched off, so it makes no network request. | Essential | Yes |
| Browser & OS | browser name, OS name, device class | Essential | Yes |
| Screen | screen size and colour depth | Essential | Yes |
| Hardware | logical CPU cores and device memory (device memory is Chromium only) | Essential | Yes |
| Touch | maximum touch points and whether touch events exist | Essential | Yes |
| Locale | time-zone name and language list | Essential | Yes |
| Canvas | hash of a test image drawn by the browser (drawn twice, and once more in a Web Worker as a cross-check) | Essential | Yes, but replaced by a "randomized" marker if two draws differ (a sign the browser adds noise) |
| WebGL | graphics vendor, renderer, version and capabilities | Essential | Yes (an extra pixel read-back check is recorded for information only and is not hashed) |
| Audio | hash of a silent audio render (nothing is played) | Essential | Yes, but replaced by a "randomized" marker if two renders differ |
| Fonts | which of 41 candidate fonts appear to be installed (found by measuring text width) | Essential | Yes |
| Extended details (six collectors) | connection quality, battery level (Chromium only), the state of six permissions (read only, never asks you), media-device **counts**, automation flags, a short CPU timing test | Optional (`extended`) | Never |
| Public IP | your public IP address, via ipify | Optional (`publicIp`) | Never |
| Approximate location | an estimate from your IP address via ipapi.co: city, region, country, time zone, network provider and approximate coordinates | Optional (`geolocation`) | Never |
| Behavioural timing | mouse positions and speed, click count, touch movement, and key timing (how long a key is held and the gap between presses) | Optional (`behavioral`) | Never |

**Deliberately not collected:** which keys you press (the key code is used in memory only to pair a key-down with its key-up, and is then discarded), typed text, passwords, WebRTC local IPs, motion sensors, and media-device names or IDs. The code contains no WebRTC or motion-sensor calls. Browsers do not expose hardware identifiers such as IMEI, MAC address or serial number.

## 5. Features and tabs

The sidebar has eight tabs. The two under **Experiments** are grouped together.

| Tab | What it does |
|---|---|
| **Overview** | Opens with a "New here? Start with the basics" card (an explainer and a glossary). After you collect, it shows an "In plain English" summary, suggested next steps, headline numbers, the configuration hash, browser/OS and hardware/display cards, optional details, a per-collector result list with a status chart, and the raw JSON report. |
| **Fingerprint** | The hash again, a bar showing how many hashed signals each category contributes, category cards, stable vs variable signals, and an expandable explanation for every signal (what it exposes, how it helps identify a setup, what is and is not hashed, when it changes). |
| **Privacy risks** | Explains what each *collected* signal discloses and groups it as **Widely shared**, **Narrows configuration** or **Reveals context**. It also shows observations from your own data, which optional collectors were on, third-party requests, findings from your experiments, practical recommendations, and documented browser mechanisms with sources. There is **no privacy score**. |
| **Laboratory** | Repeatable experiments. You create an experiment, pick a guided scenario (Baseline, Time zone changed, Language changed, Display / zoom changed, Browser setting / mode changed, or Custom), change the setting **yourself**, then press **Record run** or run a **Repeatability test** (three runs). Each run is compared with the first run, and the app explains which signals moved. |
| **Protection test** | A simple method for testing whether one browser setting changes what websites can read: record a baseline (A1), change **one** setting and record (B), undo it and record again (A2). An optional third baseline (A3) is available. Comparing A1 with A2 shows normal variation, so a value that changes on its own is never blamed on your setting. |
| **History** | Snapshots you saved in this browser (up to 25). View a snapshot's JSON, delete one, clear all (with confirmation), or select two to compare. A comparison lists changed, unchanged, added and removed signals, with per-category bars, and can be downloaded as an HTML report or JSON. |
| **Reports** | Build a research report locally. Add an optional title, researcher, institution and notes, optionally include one experiment and a snapshot comparison, and download a self-contained **HTML** report (use the browser's Print → Save as PDF for a PDF). It can also export a **research bundle**: a JSON record of one experiment (export only; the app cannot import it). |
| **Privacy & consent** | Turn each optional category on or off, revoke all optional consent, and see where your data goes. Changes apply immediately. |

**Always-visible action bar** (at the top of every tab): *Collect fingerprint* (becomes *Refresh*), *Copy JSON*, *Download JSON*, *Save snapshot*.

**Other built-in behaviour**

- Every signal is described once in `src/config/signalCatalog.js`, and the Fingerprint, Privacy risks and Laboratory views and the report are all generated from it.
- The interface works without an internet connection and uses no external fonts, scripts or icons.
- Motion is switched off for users who prefer reduced motion, and the layout adapts from a sidebar on large screens to a compact top bar on smaller ones.

## 6. Technologies used

| Technology | Used for |
|---|---|
| [React 19](https://react.dev/) | User interface |
| [Vite 7](https://vite.dev/) | Development server and production build |
| [Tailwind CSS 4](https://tailwindcss.com/) | Styling (design tokens are in `src/index.css`) |
| [FingerprintJS 4.6.2](https://github.com/fingerprintjs/fingerprintjs) | One of the ten stable signals (a visitor ID). See [licensing](#13-attribution-and-licensing). |
| Web Crypto API (`crypto.subtle`) | SHA-256 hashing, with no hashing library |
| Browser APIs | Canvas, WebGL, Web Audio, Web Workers, `localStorage` |
| [Vitest](https://vitest.dev/), jsdom, Testing Library | Automated tests |
| ESLint | Code linting |

The app has no backend. The only network requests it can ever make are the two optional IP lookups described in [section 10](#10-privacy-consent-and-local-data).

## 7. Project structure

```
Browser-Fingerprint-Project-React/
├── index.html              App entry page
├── package.json            Scripts and dependencies
├── vite.config.js          Vite and test configuration
├── eslint.config.js        Lint rules
├── docs/                   REPRODUCING.md (how to reproduce results), KNOWN_ISSUES.md
├── scripts/                browser-test.mjs, verify-bundle.mjs, audit-report.mjs (helpers)
├── .github/workflows/      ci.yml (install, lint, test, build)
├── public/                 Static files
├── src/
│   ├── main.jsx, App.jsx, index.css
│   ├── views/              Overview, Fingerprint, Exposure (Privacy risks), Lab, Protection, Reports pages
│   ├── components/         AppShell (sidebar), ui (shared building blocks), charts,
│   │                       consent form, history, comparison, experiment results
│   ├── collectors/         One module per signal, plus runner.js (time limits, statuses, consent gate)
│   ├── config/             navigation, consent categories, signal catalog, sources, palette
│   ├── hooks/              useConsent, useFingerprintCollection, useHistory,
│   │                       useExperiments, useBehavioralTracking
│   ├── services/           ipGeo.js (the only code that makes network requests), consent,
│   │                       history and experiment storage
│   └── utils/              hashing, comparison, privacy analysis, experiments,
│                           protection test, findings, report builder
└── tests/                  Vitest suites (app, collectors, hooks, security, services, utils)
```

The History and Privacy & consent tabs are built from components in `src/components/` (`HistoryPanel`, `PrivacyPanel`) and rendered directly in `App.jsx`.

## 8. Installation and setup

**Requirements**

- **Node.js 22.12 or newer** (the version required in `package.json`; `.nvmrc` pins Node 24). npm comes with Node.js.
- A modern browser. Chromium-based browsers (Chrome, Edge) expose the most signals.
- An internet connection is needed only to install packages, and later only if you turn on the optional IP or location lookups.

**Steps**

```bash
# 1. Get the code
git clone https://github.com/sufiun27/Browser-Fingerprint-Project-React.git
cd Browser-Fingerprint-Project-React

# 2. Install dependencies (use "npm ci" instead for the exact versions in package-lock.json)
npm install
```

There is no `.env` file and no configuration to set up.

## 9. Running and testing

**Run the app**

```bash
npm run dev
```

Open `http://localhost:5173` (Vite's default; the terminal prints the exact address). Use `localhost` or HTTPS: SHA-256 hashing needs a *secure context*, so on a plain `http://192.168.x.x` address the hash cannot be created (the app then says so instead of showing a fake hash).

**All commands**

| Command | What it does |
|---|---|
| `npm run dev` | Start the development server. |
| `npm run build` | Create a production build in `dist/`. |
| `npm run preview` | Serve the production build locally (default `http://localhost:4173`). |
| `npm run lint` | Check the code with ESLint. |
| `npm test` | Run the automated tests once (Vitest). |
| `npm run test:watch` | Run tests in watch mode. |
| `npm run test:browser` | Run a regression check in real, installed Chrome and/or Edge (headless). It builds the app first. A browser that is not found is reported as skipped, never as passed. |
| `npm run verify:bundle -- <file>` | Check a downloaded research-bundle JSON file locally (schema, forbidden keys, checksum, and that the analysis matches the runs). A pass means the file is consistent, not that a real browser produced it. |
| `npm run audit:report` | Print `npm audit` advisories with the dependency paths that reach them and whether each package appears in the built bundle (`dist/`). It only reports, never changes dependencies, and writes `test-results/audit-report.json`. |

**Recommended check before submission**

```bash
npm run lint
npm test
npm run build
```

When last run for this README (Windows, Node 24.19), lint reported no problems, **28 test files / 482 tests passed**, and the build succeeded. The tests use a simulated browser (jsdom), which cannot draw canvas, WebGL or audio; `npm run test:browser` covers those in a real browser.

The tests cover consent gating and revocation, hashing, collector errors and timeouts, storage handling, the report builder, a scan that fails if any unexpected network call is added, and the user-interface workflows. To reproduce documented results step by step, see [`docs/REPRODUCING.md`](docs/REPRODUCING.md). Known dependency advisories are tracked in [`docs/KNOWN_ISSUES.md`](docs/KNOWN_ISSUES.md).

## 10. Privacy, consent and local data

**Everything is processed locally.** Collection, hashing, analysis, comparison and report generation all happen in your browser. The app never sends the fingerprint, the hash or the report to any server.

**Consent**

| Category | Default | What it enables |
|---|---|---|
| Essential signals | Not a switch | The ten stable collectors, only when you press **Collect** |
| `extended` | Off | Battery, connection quality, permission states, media-device counts, automation flags, CPU timing |
| `publicIp` | Off | One request to `api.ipify.org` |
| `geolocation` | Off | One request to `ipapi.co` (independent of `publicIp`) |
| `behavioral` | Off | Listeners for mouse, click, touch and key-timing events |

- Optional categories are **separate**: turning one on never turns on another.
- You can **revoke** any category at any time. Revoking stops future collection for it, removes the behavioural listeners, cancels a request that is still running (the reply is discarded), and removes its data from the result on screen. The hash is not affected, because only essential signals feed it.
- Consent is saved in your browser and shared between tabs of the same site, so a revocation in one tab takes effect in the others. If saved consent is damaged, the app falls back to "everything optional is off". Only a value that is exactly `true` counts as consent.

**Third-party requests (only if you turn them on)**

| Feature | Service | Request |
|---|---|---|
| Public IP | ipify | `GET https://api.ipify.org?format=json` |
| Approximate location | ipapi.co | `GET https://ipapi.co/json/` |

Both are plain `GET` requests with no cookies, no referrer and no body, and each is cancelled after 5 seconds. The service sees your IP address, as any website would. **No fingerprint data is sent** in these requests. The location reply also contains an IP field, which the app discards unless you separately enabled the public IP lookup. Each service has its own privacy policy, which this project does not control. Location from an IP address is only an estimate. With a category off, no request is made at all. The report lists exactly which third parties were contacted in a run.

**What is stored in your browser (`localStorage`)**

| Key | Contents |
|---|---|
| `fpp.consent.v1` | Your consent choices |
| `fpp.history.v1` | Snapshots you chose to save (maximum 25) |
| `fpp.experiments.v1` | Laboratory and Protection test experiments (maximum 10 experiments, 12 runs each) |
| `fpp.marker.v1` and `fpp.session.v1` (the latter in `sessionStorage`) | Small markers, written when you save a snapshot or record an experiment run, that note whether runs came from the same tab session. They are weak evidence only, not proof. |

Snapshots and experiment runs are built from a fixed list of allowed fields. They **never** contain your IP address, location, behavioural data, battery level, permission states, media devices, raw User-Agent text or session ID. Reports exclude the same items even if you enabled those collectors. Storage is per site address, so `localhost:5173` and `localhost:4173` do not share history. Clearing site data in your browser removes everything.

## 11. Screenshots

Screenshots have not been added yet. Replace each placeholder below with an image of the running app (for example, saved in a `screenshots/` folder).

| Screen | Placeholder |
|---|---|
| Welcome and consent screen | `![Welcome screen](screenshots/welcome.png)` *(add screenshot)* |
| Overview after collecting | `![Overview](screenshots/overview.png)` *(add screenshot)* |
| Fingerprint tab | `![Fingerprint](screenshots/fingerprint.png)` *(add screenshot)* |
| Privacy risks tab | `![Privacy risks](screenshots/privacy-risks.png)` *(add screenshot)* |
| Laboratory | `![Laboratory](screenshots/laboratory.png)` *(add screenshot)* |
| Protection test | `![Protection test](screenshots/protection-test.png)` *(add screenshot)* |
| History and comparison | `![History](screenshots/history.png)` *(add screenshot)* |
| Reports | `![Reports](screenshots/reports.png)` *(add screenshot)* |
| Privacy & consent | `![Privacy and consent](screenshots/privacy-consent.png)` *(add screenshot)* |

## 12. Limitations and future scope

**Limitations**

- **Not a unique identifier.** The hash describes a browser setup. Different devices with the same software and hardware can share a hash, and updates, settings, zoom or extensions change it.
- **No uniqueness, entropy or risk figures.** The project has no reference population, so it cannot say how rare your setup is. The exposure groups and recommendations are editorial explanations, not measurements.
- **FingerprintJS can react to things the app's own signals ignore.** It bundles many attributes (including the time zone) into one visitor ID. The project's signal catalog notes that display scaling changed this ID when the app was tested in Chrome, even though the app's own screen signal ignores it. Because the ID is part of the hash, the hash can change too.
- **Results describe one browser, one machine, one moment.** They are for learning and demonstration, not evidence about a population.
- **You must make the change yourself.** The app cannot check that you really changed a setting in an experiment, so results are observations.
- **Browser support varies.** Some signals exist only in Chromium browsers (for example device memory, battery and connection quality) and are shown as *Unsupported* elsewhere. Privacy features may randomise or block canvas, audio and GPU details.
- **Limited browser testing.** Automated real-browser checks cover Chrome and Edge only (both Chromium-based). Firefox, Safari, Brave, Tor Browser and mobile browsers have not been tested, and the project makes no claim about their privacy protection.
- **Secure context needed for the hash.** Use `localhost` or HTTPS.
- **Font detection is approximate.** It compares text widths, so some operating-system font aliases can look like installed fonts.
- **Local only.** History is per browser and per site address, with no sync between devices and no backend. Reports are HTML files; a PDF is made through the browser's Print dialog.
- **Accessibility is "good basics", not a full audit.** It has not been tested with a real screen reader.
- **A request cannot be recalled.** If you revoke an IP or location lookup while it is running, the app cancels it and discards the reply, but the provider may already have received it.
- **Dependency advisories change over time.** See [`docs/KNOWN_ISSUES.md`](docs/KNOWN_ISSUES.md) and run `npm run audit:report`.

**Future scope** (ideas, not existing features)

- Test and document more browsers, including Firefox, Safari and Brave, and mobile devices.
- Evaluate moving from FingerprintJS 4.6.2 to the MIT-licensed 5.x line (the hash values would change and need re-checking).
- Add a screen-reader and zoom/reflow accessibility audit.
- Collect consented, anonymous reference data to support honest uniqueness estimates (this would need a backend and ethics review, which the project deliberately does not have today).
- Add a translated interface and more guided experiment scenarios.

## 13. Attribution and licensing

This project is derived from **Browser-Fingerprint-Project-React** by **Abu Sufiun**: <https://github.com/sufiun27/Browser-Fingerprint-Project-React>.

**Licensing is unresolved.**

- No `LICENSE` file is present and `package.json` declares no `license`, so this project does not grant or claim any licence. Confirm reuse terms with the original author before redistributing or publishing it beyond an academic submission.
- **FingerprintJS 4.6.2 uses the Business Source License 1.1 (`BUSL-1.1`)**, which is not a permissive licence and grants no production use. Read `node_modules/@fingerprintjs/fingerprintjs/LICENSE` and the [BSL 1.1 text](https://mariadb.com/bsl11/). Versions 5.0.0 and later are reported to be MIT-licensed, but this project has not been migrated. Ask your supervisor whether the current use is acceptable. This README is not legal advice.
- The other main dependencies (React, Tailwind CSS, Vite, Vitest, jsdom, Testing Library) are MIT-licensed according to their installed `package.json` files.

---

**Original author:** Abu Sufiun, Backend Software Engineer
GitHub: <https://github.com/sufiun27> · LinkedIn: <https://linkedin.com/in/abu-sufiun>
