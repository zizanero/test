# Populace

A workbench for designing, running, observing, and analyzing simulations of LLM-driven generative agents. Built end-to-end from the Populace product specification.

This is the **months 0–4 MVP**: the credibility-anchor demo where a researcher can reproduce a Park-style 25-agent town simulation without leaving the product — author personas, build a world, configure a run, watch the live observer, drill into agent memory and reasoning, compare runs, calibrate against a CSV, and export a replication bundle.

## Tech stack

- Next.js 15 (App Router) + TypeScript + Tailwind, single monolith
- Prisma + SQLite for data
- Server-Sent Events for live tick streaming
- Anthropic SDK with deterministic mock-LLM fallback
- Konva-style HTML5 canvas for the spatial view; native Canvas2D for charts
- `graphology-communities-louvain` for community detection
- `pdfkit` for PDF report export; nbformat-compatible JSON for notebook export

## Quick start

```bash
npm install
cp .env.example .env             # ANTHROPIC_API_KEY optional
npx prisma migrate dev --name init
npx tsx prisma/seed.ts            # seeds 5 templates + a default workspace/project
npm run dev
```

Open <http://localhost:3000>. From the **Templates** page, pick `Smallville` and click *Instantiate & configure* → *Start run*. The observer streams ticks live; click any agent dot to open the inspector.

## End-to-end smoke (no API key)

```bash
npm run smoke
```

Resets the database, seeds the five templates, instantiates **Deliberation**, runs 30 ticks, branches the run at tick 15 with an injected observation, and exports CSV + notebook + PDF. Exits non-zero on any failure. Uses the mock LLM exclusively; no tokens are spent.

Expected output:

```
ticks=30 memories=~1000 decisions=360 markers=~60 reflections=~50
csv=~50KB notebook=~2.5KB pdf=~9KB
== smoke OK ==
```

## What ships in this MVP

Per spec §11:

- Workspace → Project → Simulation → Run hierarchy
- Three-layer builder: **Population** (with prose-mode Persona Designer), **World** (location editor with 2D canvas), **Rules** (structured form, not visual graph)
- Live observer with 2D spatial canvas, transport bar (play/pause/step/speed), single-track timeline with markers, narration ribbon, agent inspector
- Agent inspector: identity, state diff, memory store with importance + retrieval-count badges, decision trace with retrieved-memory citations, reflection tree with `(because of m1, m5, m3)` provenance, relationships, cost ledger
- Calibration view: CSV upload + KS-distance + Wasserstein-1 against a simulated metric
- Analytics view: time series, histogram, narration log, sibling-run comparison
- Cost projection (pre-flight band) + live cost ticker + hard cap
- Branching: fork-at-tick with optional intervention
- Export: CSV (per-decision long format), Jupyter notebook (nbformat v4.5), PDF report, replication-bundle ZIP
- 5 templates: Smallville, Polarization, Vaccination, Market, Deliberation
- Mock LLM (deterministic, schema-correct) when no `ANTHROPIC_API_KEY`; Anthropic Haiku/Sonnet routing when keyed

## What's deliberately NOT in MVP

Per spec §11 deferred-to-v1: multiplayer presence, AI-described-scenario one-shot generator, ABC auto-calibration, Blueprints visual rules graph, counterfactual replay with N-replicate distribution, 4 of 5 emergence detectors (only **community detection** ships), survey/interview persona modes, GIS, 3D, prosumer story-view, enterprise integrations, permissions/sharing, drift detection.

## Project layout

```
src/
├── sim/                  # the simulation engine
│   ├── engine.ts         # tick loop
│   ├── memory.ts         # Park-style retrieval (importance × recency × relevance)
│   ├── reflection.ts     # parent-linked reflection trees
│   ├── gameMaster.ts     # Concordia-style arbitration + narration
│   ├── perception.ts, action.ts, scheduler.ts, relationships.ts, snapshot.ts
│   ├── emergence/communityDetection.ts
│   ├── llm/{index,mock,anthropic,cache,pricing}.ts
│   └── runners/{runManager,eventBus}.ts
├── app/                  # Next App Router routes
├── components/           # UI: shell, observer, inspector, builder, analytics, calibration
├── server/               # db, instantiate, export
├── lib/                  # env, ksDistance, cn
├── store/                # Zustand client stores
├── hooks/                # SSE subscription
└── templates/            # 5 seeded simulation templates
```

## Architecture highlights

- **Deterministic mock LLM**: every call's randomness is keyed by `(seed, agentId, tick, callKind)`. The mock returns schema-correct JSON for `decision`, `reflection`, `narration`, `importance_grade`, `interview`, `game_master`, so the engine and UI run end-to-end with zero LLM tokens.
- **Cost ledger**: `CostLedger` row per LLM call; `Run.costUsd` increments live; cap pauses the loop; pre-flight projection returns a `{low, mid, high}` band.
- **Branching**: `POST /api/runs/[runId]/branch` snapshots parent state at `atTick`, copies `Agent` rows into a child `Run`, optionally appends a one-shot `RuleEvent` with the intervention, resumes from `atTick + 1`.
- **SSE streaming**: `GET /api/runs/[runId]/stream?fromTick=N` replays history then attaches to the in-process bus. Events: `tick`, `narration`, `marker`, `cost`, `status`.
- **Community detection** (the one MVP emergence detector): Louvain on the relationship graph every 5 ticks; modularity ≥ threshold emits a `marker`.

## Extending

- **Add a template**: create `src/templates/<slug>/spec.json`, register it in `src/templates/index.ts`, re-run `npm run db:seed`.
- **Add an emergence detector**: drop into `src/sim/emergence/` and call from `engine.ts`.
- **Wire the real Anthropic API**: set `ANTHROPIC_API_KEY` in `.env`; the facade automatically routes to `anthropic.ts` when keyed.
- **Tweak Park retrieval weights**: pass `{ weights: { recency, importance, relevance } }` to `retrieve()` from the agent step or expose them as Cursor-style debug knobs.

## License

MIT.
