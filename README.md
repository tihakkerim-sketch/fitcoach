# FitCoach

A local-first desktop training coach for amateur endurance athletes. Your data lives on your machine. Coaching adapts through a structured conversation with an LLM of your choice.

> Built by an amateur runner training for a marathon, for amateur runners training for marathons.

## What FitCoach does

- **Tracks your training** — manual log or Garmin `.fit` import. Running, cycling, strength, sleep.
- **Plans your phases** — multi-phase periodized plans with weekly grids and per-session targets.
- **Logs your recovery** — Body Battery, Sleep Score, HRV, resting HR. Computes a readiness score automatically.
- **Coaches through Claude (or any LLM)** — exports a Markdown summary of your training, recovery, habits, and check-ins. You paste it to an LLM, get an updated plan back as JSON, and the app applies the changes while preserving the history of every completed session.
- **Habits, daily check-ins, daily challenges** — the operating-system layer around the training itself.

## Why local-first

- Your training data, recovery data, and journal entries never leave your machine.
- No accounts. No cloud. No subscription.
- The app is the database file on your disk. Back it up like any other file.

## Tech stack

- **Shell** — Electron 31
- **Frontend** — React 18 + TypeScript (strict) + Vite
- **UI** — Tailwind CSS + shadcn/ui + Lucide icons
- **Database** — SQLite via [sql.js](https://github.com/sql-js/sql.js) (WASM) with [Drizzle ORM](https://orm.drizzle.team)
- **Charts** — Recharts
- **Validation** — Zod
- **Garmin parsing** — fit-file-parser + fast-xml-parser

## Status

Active development. Pre-1.0. Currently being used by the author for a sub-4:15 marathon attempt.

A first public release is planned for **September 2026**.

## Getting started (development)

Requirements: Node.js 20+ on Windows, macOS, or Linux.

```sh
git clone https://github.com/YOUR_USERNAME/fitcoach.git
cd fitcoach
npm install
npm run dev
```

This starts Vite on `localhost:5173` and launches Electron pointing at it.

To build a distributable:

```sh
npm run build
```

## Project layout

```
electron/      Electron main process + IPC handlers (one file per domain)
db/            Drizzle schema and migrations
src/           React renderer — pages, components, hooks
src/types/     IPC channel constants and TypeScript types
```

## Roadmap

- [x] Activity logging, Garmin import, training plans, recovery logs, habits, check-ins, challenges
- [x] Plan-adapt loop with completion-history preservation
- [x] Auto-calculated readiness score with proportional weight redistribution
- [ ] Race-time predictor (regression on Z2 pace/HR pairs)
- [ ] Confidence intervals on predictions
- [ ] Skip-this-week simulator
- [ ] Signed Windows installer (1.0)
- [ ] Auto-update via GitHub Releases (1.0)

## Contributing

This is currently a single-author project, but issues and PRs are welcome. If you're building anything in the local-first AI-augmented coaching space, please open an issue — I'd like to hear about it.

## License

MIT — see [LICENSE](LICENSE).
