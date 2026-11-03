/**
 * A stand-in for the n8n webhooks, used to exercise the dashboard's LIVE mode over real HTTP without a real n8n.
 * It answers /webhook/deal/* with the contract's wire shapes (from the mock handlers), requires the Header Auth, and logs every request.
 * BREAK=overview makes that endpoint return a malformed field so the contract-mismatch error can be seen.
 */
import fs from 'node:fs';
import http from 'node:http';
import { endpointList, type EndpointKey } from '@/contracts/deal-api';
import { runMock } from '@/lib/mock/handlers';
import { createMockState, HttpError } from '@/lib/mock/store';

const PORT = Number(process.env.FAKE_PORT ?? 5678);
const HEADER = (process.env.N8N_WEBHOOK_AUTH_HEADER_NAME ?? 'x-test-key').toLowerCase();
const SECRET = process.env.N8N_WEBHOOK_AUTH_VALUE ?? 'secret';
const LOG = process.env.FAKE_LOG ?? './fake-n8n.log';
const state = createMockState();
fs.writeFileSync(LOG, '');

http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    const path = url.pathname.replace(/^\/webhook/, '');
    const authed = req.headers[HEADER] === SECRET;
    fs.appendFileSync(LOG, `${JSON.stringify({ method: req.method, path, authed, query: Object.fromEntries(url.searchParams) })}\n`);
    const send = (status: number, body: unknown) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (!authed) return send(403, { message: 'Authorization data is wrong!' });
    const def = endpointList.find((e) => e.method === req.method && e.path === path);
    if (!def) return send(404, { code: 404, message: `The requested webhook "${req.method} ${path.slice(1)}" is not registered.` });
    const body = raw ? JSON.parse(raw) : {};
    let input = body as Record<string, unknown>;
    if (path === '/deal/proposal/revise') {
      const p = state.db.proposals.find((x) => x.approve_token === body.token);
      input = { proposal_id: p?.id, change_notes: body.notes };
    }
    try {
      const out = runMock(def.key as EndpointKey, state, Object.fromEntries(url.searchParams), input) as { data: { totals: Record<string, unknown> } };
      if (process.env.BREAK && def.key === process.env.BREAK) out.data.totals.win_rate_pct = 'not a number';
      send(200, out);
    } catch (e) {
      if (e instanceof HttpError) return send(e.status, { status: 'error', error: e.message });
      send(500, { status: 'error', error: String(e) });
    }
  });
}).listen(PORT, () => console.log(`fake n8n on :${PORT}`));
