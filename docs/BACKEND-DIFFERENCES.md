# Where the real backend differs from the brief

I read the live workflow ("Consultancy Deal Pipeline Engine", id `bmxJh5bbbjYbKYqL`) node by node: every webhook, the `CONFIG` node,
the `Setup` SQL, and the Respond nodes. **The real backend wins.** `contracts/deal-api.ts` follows what the workflow does, and this is
every place it departs from what was described.

## Data model

| Brief | Real backend | What the dashboard does |
|---|---|---|
| Ids not specified | All ids are `bigint` (JSON numbers) | Contract uses integers |
| `proposals.status` has 7 values | 8: also **`superseded`** (older unsent versions replaced by a redraft) | Hidden from tabs by default; shown in the version history |
| `proposals` columns | Also `approve_token`, `payment_link`, `change_notes`, `followup_draft`, `content`, `pdf_drive_id` | Tokens never leave the server; the rest are used where useful |
| – | `is_test` on `deals`, `prospects`, `event_log` | Test rows are hidden everywhere unless `include_test=1` |
| `deals.stage_changed_at` not listed | Exists, and drives "days in stage" | Used |
| `pipeline_metrics.period` free text | One of `this_month`, `last_30d`, `last_90d`, `all_time` (cohort = deals **created** in the period) | Period selector offers exactly these |
| `dimension_value` for consultant | The consultant **id as text**; matrix is `service_type\|lead_source`; overall is `all` | Labels are resolved by the query |
| Lost reasons: budget, timing, competitor, no response | Free text. The workflow itself writes `expired`, `declined by prospect`, `marked lost manually` | Shown as recorded. The sample data uses the four reasons you listed |

## Existing endpoints

| Endpoint | Brief | Real behaviour | Handling |
|---|---|---|---|
| all existing | – | Reply with `{ status:'ok', records_affected, ids:{…}, … }`, **not** `{status,data,meta}` | Contract keeps each real shape; only the new reads use the envelope |
| `POST /deal/proposal/revise` | `{proposal_id, change_notes}` | Takes **`{token, notes}`** (the approval token). Replies 409 once a proposal is sent | The server-side proxy looks the token up (`GET /deal/proposal`) and sends `{token, notes}`; the browser never sees it |
| `GET /deal/proposal/approve?token=` | Used by "Approve & send" | Public, token-authenticated, **returns an HTML page** | Not used by the dashboard. `approve-admin` (new) reuses the same chain with a JSON answer |
| `POST /deal/stage` | `{deal_id, to_stage, reason, value}` | Requires **`consultant_email`** (ownership check) and uses `lost_reason`, `note`, `value_inr`. Any stage is accepted (`override_deal` forces) | Proxy supplies the owning consultant's email. **The UI** restricts manual moves to Negotiation and Lost (won only via payment) |
| `POST /deal/call-done` | `{transcript or notes, no_show}` | Finds the call by `booking_id` or latest call of `deal_id`; `outcome:'no_show'` or `no_show:true` | Proxy maps; response says `proposal:'drafting'` or `rebooking:'sent'`, or `already_handled` |
| `GET /deal/metrics` | Read-only | **Recomputes every metric row on each call** (`DELETE` + `INSERT`) | Used only by the System health check. Pages read `/deal/winrate` instead |
| `GET /deal/deal` | – | Returns the raw rows plus **`approve_token` / `tracking_token`** inside each proposal, and omits `transcript_text` | Tokens stripped by schema and by a recursive filter; transcripts come from `/deal/calls?include_transcript=1` |
| `POST /deal/test` | `{scenario}` | Also takes `scope:'test'`; replies `status:'ok'` or `'checks_failed'` with a `checks[]` list | Result view shows each check with expected / actual |
| `POST /deal/payment` and `/deal/t/*` | Never call | Public / signature-verified | Refused by the proxy with 403 (tests prove it) |

## Behaviours worth knowing

* **Every trigger shares one `CONFIG` → `Route Branch` switch**, keyed on `$('Webhook – X').isExecuted`. New branches follow the same shape.
* **All errors land in `Incident – Normalise Error`**, which answers the caller with `{status:'error', error, node}` and 500. The new reads use it too.
* **No credentials are attached** to any node in this instance (there are no Postgres or Header Auth credentials at all). The new nodes match.
* **The workflow is inactive**, so nothing could be executed against it. See "Not verified" in the README.
* The phone check is `^\+91[6-9]\d{9}$`; consultant WhatsApp numbers are normalised with the workflow's own `normalize_phone()`.
* `consultants` has a unique index on `lower(email)`; creating a consultant with an existing email updates that person.

## Added by this work (see `backend/n8n/README.md`)

Fifteen webhooks and the `Route Dashboard` switch, inside the same workflow. One existing node gained one extra condition
(`Approve – Respond Sent (Webhook Run?)`), so an admin approval answers with JSON instead of the HTML thank-you page.
