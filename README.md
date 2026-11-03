# Deal Pipeline dashboard

A calm, fast front end for the **Consultancy Deal Pipeline Engine** n8n workflow: upcoming calls and their research briefs,
proposals waiting for one-tap approval, how fast proposals go out, and which services and lead sources win.

Next.js 15 (App Router) · TypeScript · Tailwind 4 · TanStack Query/Table · Recharts · Framer Motion · React Hook Form + Zod · date-fns-tz · react-markdown · dnd-kit.

```bash
npm install
npm run dev            # http://localhost:3000, sample data, no backend needed
```

Sign in as **Owner** with `northstar-demo`, or as a consultant (the login screen lists the sample consultants and their codes).
Those demo credentials exist **only in mock mode**; live mode requires real values from `.env` (see `.env.example`).

## Mock vs live: one environment change

| | `NEXT_PUBLIC_DATA_MODE=mock` (default) | `NEXT_PUBLIC_DATA_MODE=live` |
|---|---|---|
| Data | Seeded "Northstar Growth Partners", ~270 deals over 120 days, deterministic | Your n8n workflow |
| Actions | Really change in-memory state (approve → sent, revise → v+1, log outcome → draft appears, mark lost → reason recorded) | POST to the workflow |
| Badge | **Sample data** always visible | "Live data" |
| Validation | Mock output is checked against the same Zod contract in tests | Every response is checked; a mismatch names the endpoint and field |

Live mode needs `N8N_BASE_URL`, `N8N_WEBHOOK_AUTH_HEADER_NAME`, `N8N_WEBHOOK_AUTH_VALUE`, `OWNER_PASSWORD`, `CONSULTANT_LOGIN_SEED`, `SESSION_SECRET`
and refuses to start without them. Then follow `backend/n8n/README.md` ("Before you activate").

## How it talks to the backend

```
Browser ──▶ /api/n8n/deal/…  (Next route handler)  ──▶ n8n webhook
            1 session cookie (signed, httpOnly)        Header Auth is added HERE, never in the browser
            2 allow-list from contracts/deal-api.ts    /deal/t/* and /deal/payment are refused (403)
            3 role + per-consultant scope              consultants only ever see their own deals, calls, proposals
            4 request validated with Zod
            5 response validated with Zod; approve/tracking tokens and ip hashes stripped
```

* `contracts/deal-api.ts` is the single source of truth: request + response schema per endpoint and a typed endpoint map. `docs/BACKEND-DIFFERENCES.md` lists where the real workflow differs from the brief.
* The dashboard **never** calls `/deal/t/open|click|accept|decline` or `/deal/payment` (they would record fake opens, clicks, acceptances or payments). Tests, the browser walk-through and the live-mode run all assert it.
* Roles: **Owner** sees everything. **Consultant** sees their own calls, deals, proposals and win rate, and can approve/revise their own proposals and log call outcomes. Consultants sign in with their email and a code derived (HMAC) from `CONSULTANT_LOGIN_SEED`; the owner sees each code on the Consultants page.

## Pages and the endpoint each one uses

| Page | Reads | Actions |
|---|---|---|
| Overview | `/deal/overview`, `/deal/sla`, `/deal/calls?when=upcoming`, `/deal/proposals`, `/deal/winrate` | `approve-admin` |
| Pipeline | `/deal/deals`, `/deal/services`, `/deal/consultants`, `/deal/config` | `POST /deal/stage` (Negotiation, Lost with a required reason) |
| Calls & Briefs | `/deal/calls`, `/deal/brief` | `brief/regenerate`, `POST /deal/call-done` |
| Proposals | `/deal/proposals`, `/deal/proposal`, `/deal/sla` | `approve-admin`, `POST /deal/proposal/revise` |
| Win rate & deal size | `/deal/winrate` | – |
| Deal drawer (`?deal=ID`, ⌘K) | `/deal/deal`, `/deal/calls`, `/deal/brief`, `/deal/proposal` | stage, value, regenerate, revise, log outcome |
| Services | `/deal/services` | `POST /deal/service` |
| Consultants | `/deal/consultants` | `POST /deal/consultant` |
| System | `/deal/logs`, `/deal/config`, every GET (health check) | `POST /deal/setup`, `POST /deal/test` |

Every state-changing action asks for confirmation and says what will happen, shows a pending state, toasts the backend's own message, and refreshes the right queries.

## Where numbers come from

All derived figures come from **one tested module**, `lib/metrics`, using the workflow's own formulas:

* **win rate** = won ÷ (won + lost) over decided deals; a secondary figure also counts open deals
* **average deal size** = mean `value_inr` of won deals
* **hours call → proposal** = first *sent* version's `sent_at` − the call's `completed_at`
* **open rate** = proposals with ≥ 1 open ÷ proposals sent
* groups with fewer than **5 decided deals** are flagged "low data" and hatched; insights refuse to make claims from them

The mock's `pipeline_metrics` are computed from the raw records with that module, so every KPI adds up. `backend/n8n/queries/*.sql` implement the same formulas in SQL, and a parity test proves the two agree.

## Verification

| Check | Command | Result |
|---|---|---|
| Typecheck, lint, build | `npm run typecheck && npm run lint && npm run build` | pass, 0 errors, 0 warnings |
| Unit and integration tests | `npm test` | 152 tests: metrics formulas on hand-built books, seed invariants and an independent recount of every KPI, every mock endpoint against the contract, mock actions, proxy security (allow-list, token stripping, consultant scoping, request validation, contract mismatch), a simulated live n8n, sessions, insights |
| SQL on a real Postgres engine | `npm run verify:sql` | the workflow's exact SQL, on the workflow's own schema and the full sample data, matches the mock through the Zod contract |
| Browser walk-through | `npm run e2e` (after `npm run build && npm start` on :3100) | 52 checks: sign-in, KPIs equal the API, ⌘K, drawer, approve, request changes, log outcome, drag to Lost, CSV, theme, heatmap, services, health check, test runner, consultant scoping |
| Accessibility | `npm run a11y` | axe-core: 0 WCAG 2.1 A/AA violations on every page in light and dark; no horizontal scroll at 390 px |
| Live mode over real HTTP | `scripts/fake-n8n.ts` + `scripts/live-check.mjs` | a live build against a stand-in n8n: Header Auth on all 70 upstream requests, none to `/deal/t/*` or `/deal/payment`, health check passes |

The sample data tells the intended story (asserted by tests): referrals win most, LinkedIn outbound has the most volume and a very low win rate, Instagram deals are the smallest,
Sales Process Consulting has the biggest average deal, proposals sent within 24 h win about twice as often as those after 48 h, one consultant is fast with a high win rate and one regularly misses the 24 h SLA.
`npm run find-seed` re-selects a seed if you change the generator.

## Not verified (please read)

* **Nothing was run against your real n8n.** The workflow is inactive, no Postgres or Header Auth credentials exist in the instance, and you asked that live mode only be exercised when you switch it on. The new SQL was verified on Postgres (PGlite), the workflow was validated by n8n (0 invalid connections, 0 errors), and live mode was run against a stand-in server, but **the new webhooks have never executed inside n8n**. When you switch to live: attach credentials, activate, run **System → Contract health check**, then the test scenarios, then **Clean up**.
* In live mode the system tests use your database; scenarios are marked as tests and hidden from real numbers, and messages for test deals are simulated by the workflow itself.
* `approve-admin` really sends the email (unless the workflow's dry-run flag is on), exactly like the emailed approve link.
* Opens are approximate (mail apps pre-load images); the UI says so wherever opens appear. Accepts and link clicks are the reliable signals.

## Layout

```
contracts/deal-api.ts      Zod contract + endpoint map (single source of truth)
lib/metrics/               the one place derived numbers are computed
lib/mock/                  seeded data, story checks, stateful store, handlers
lib/server/                proxy pipeline, backend adapter, auth
components/ , app/         UI and routes
backend/n8n/               SQL saved in the workflow + how it is wired
tests/ , scripts/          unit, parity, proxy, e2e, a11y, live-mode tooling
```
