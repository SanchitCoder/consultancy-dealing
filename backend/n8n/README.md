# What was added to the n8n workflow

Everything is inside **"Consultancy Deal Pipeline Engine"** (`bmxJh5bbbjYbKYqL`). No new workflows, no sub-workflows, no Execute Workflow nodes.
n8n-mcp kept a local snapshot before every save (`n8n_workflow_versions`, mode `list`), so each step can be rolled back.

## Shape

```
Webhook – <Name> ──▶ CONFIG ──┬──▶ Route Branch      (existing switch, NOT edited)
                              └──▶ Route Dashboard   (new switch, same isExecuted pattern)
                                         │
              ┌──────────────────────────┴───────────────────────────┐
         reads: <Name> – Query (Postgres, one JSON parameter)   actions: see below
              │ success                │ error output
              ▼                        ▼
        Dash – Respond        Incident – Normalise Error   (the workflow's shared error branch)
```

`Route Dashboard` is fed in parallel from `CONFIG`, so `Route Branch` and every existing chain are untouched.
Each read returns `{ status, data, meta:{page,page_size,total} }` straight from SQL (`Dash – Respond` sends 200, or 404 when `status ≠ ok`).
All parameters are passed as **one sanitised JSON value** (`$1::jsonb`): dates parsed, enums allow-listed, ids digits-only, page sizes clamped. No string is ever concatenated into SQL.

## Webhooks

| Method | Path | Chain |
|---|---|---|
| GET | `/deal/overview` | `Overview – Query` |
| GET | `/deal/deals` | `Deals – Query` |
| GET | `/deal/calls` | `Calls – Query` |
| GET | `/deal/brief` | `Brief – Read Query` |
| GET | `/deal/proposals` | `Proposals – Query` |
| GET | `/deal/proposal` | `Proposal Detail – Query` (includes the approval token, server-to-server only) |
| GET | `/deal/winrate` | `Win Rate – Query` (reads `pipeline_metrics`; with `consultant_id` aggregates `v_deal_facts`) |
| GET | `/deal/sla` | `SLA Board – Query` (thresholds read from `CONFIG`) |
| GET | `/deal/services` | `Services – Query` |
| GET | `/deal/consultants` | `Consultants – Query` |
| GET | `/deal/logs` | `Logs – Query` |
| GET | `/deal/config` | `Webhook – Config → CONFIG → Config – Gate → Config – Respond` (non-secret values only) |
| POST | `/deal/proposal/approve-admin` | below |
| POST | `/deal/brief/regenerate` | below |
| POST | `/deal/consultant` | `Consultant – Valid Payload? → Consultant – Upsert → Consultant – Respond` (400 branch) |

### approve-admin (reuses the existing approve-and-send chain)
```
Webhook – Approve Admin → CONFIG → Route Dashboard → AdminApprove – Find Proposal → AdminApprove – Approvable?
   true  → AdminApprove – Token Request ──▶ Approve – Read Request ─▶ … existing chain (claim, PDF, Gmail, Mark Proposal Sent)
                                                                         └▶ AdminApprove – Run? → AdminApprove – Respond Sent (JSON)
   false → AdminApprove – Respond Not Approvable (409 already sent / 404 unknown)
```
Existing node changed: `Approve – Respond Sent (Webhook Run?)` now reads
`$execution.mode !== 'trigger' && !$('Webhook – Approve Admin').isExecuted` so an admin approval is answered once, in JSON.
The emailed token link behaves exactly as before.

### brief/regenerate (reuses the existing brief chain)
```
Webhook – Brief Regenerate → CONFIG → Route Dashboard → BriefRegen – Find Call → BriefRegen – Call Found?
   true  → BriefRegen – Respond (JSON, immediately)  +  BriefRegen – Request {deal_id, call_id, force:true} → Brief – Prepare Request → … existing chain
   false → BriefRegen – Respond Not Found (404)
```

## Before you activate

1. Attach a **Postgres** credential to every Postgres node (the existing ones have none either) and a **Header Auth** credential to every Webhook node that says `headerAuth`.
2. Run `POST /deal/setup` once (System page → Initialise).
3. Each new webhook has `allowedOrigins` = `http://localhost:3000`. Change it to the dashboard's real origin. The dashboard never calls n8n from the browser, so CORS only matters if you add other clients.
4. Put the same header name and value in the dashboard's `.env` (`N8N_WEBHOOK_AUTH_HEADER_NAME`, `N8N_WEBHOOK_AUTH_VALUE`).

## SQL

`queries/*.sql` are the exact statements saved in the nodes. `tests/sql-parity.test.ts` runs them on a real Postgres engine (PGlite) loaded with the
workflow's own schema (`test-schema.sql`, extracted from the `Setup` nodes) and the full sample dataset, validates each answer against the Zod contract,
and compares it with the mock handlers' answer. `now()` is pinned so both sides see the same instant. Run it with `npm run verify:sql`.
