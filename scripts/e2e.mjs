// End-to-end walk of every dashboard action in a real browser (mock mode). Prints PASS/FAIL per step.
import { chromium } from 'playwright';
const BASE = process.env.BASE ?? 'http://localhost:3100';
const results = [];
const ok = (name, cond, detail = '') => { results.push({ name, cond: !!cond, detail }); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`); };
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const blocked = [];
page.on('request', (r) => { if (/\/deal\/(t\/|payment)/.test(r.url())) blocked.push(r.url()); });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
const toast = async (re, timeout = 6000) => { try { await page.getByText(re).first().waitFor({ timeout }); return true; } catch { return false; } };

// ── login
await page.goto(`${BASE}/login`);
await page.getByLabel('Owner password').fill('northstar-demo');
await page.getByRole('button', { name: 'Sign in as owner' }).click();
await page.waitForURL('**/overview');
ok('owner can sign in', true);
ok('"Sample data" badge visible', await page.getByText('Sample data').first().isVisible());

// ── overview KPIs equal the API answer that fed them
let ovJson = null;
page.on('response', async (r) => { if (r.url().includes('/api/n8n/deal/overview') && r.status() === 200) { try { ovJson = await r.json(); } catch { /* navigated */ } } });
await page.reload();
await page.waitForTimeout(2500);
const ov = ovJson.data.totals;
const card = async (label) => (await page.locator('section[aria-label="Key numbers"] > div', { hasText: label }).first().innerText()).replace(/\n+/g, ' | ');
ok('KPI: calls booked matches API', (await card('Calls booked')).includes(String(ov.calls_booked)), `${ov.calls_booked}`);
ok('KPI: proposals sent matches API', (await card('Proposals sent')).includes(String(ov.proposals_sent)), `${ov.proposals_sent}`);
ok('KPI: win rate matches API', (await card('Win rate')).includes(`${Math.round(ov.win_rate_pct)}%`), `${ov.win_rate_pct}%`);
ok('KPI: brief-ready % matches API', (await card('Briefs ready')).includes(`${Math.round(ov.brief_ready_pct)}%`), `${ov.brief_ready_pct}%`);
ok('KPI: open rate matches API', (await card('open rate')).includes(`${Math.round(ov.open_rate_pct)}%`), `${ov.open_rate_pct}%`);
ok('Coming-up strip shows ✓ Brief ready badges', (await page.getByText('Brief ready').count()) > 0);

// ── ⌘K search and deal drawer
await page.keyboard.press('Control+K');
await page.getByPlaceholder('Search deals, companies, proposals…').last().fill('Kaveri');
await page.locator('[cmdk-item]', { hasText: 'Kaveri' }).first().waitFor({ timeout: 8000 });
ok('⌘K finds deals and proposals by company', (await page.locator('[cmdk-item]', { hasText: 'Kaveri' }).count()) > 3);
await page.keyboard.press('Enter');
await page.waitForTimeout(1200);
ok('selecting a result opens the deal drawer (URL has ?deal=)', /deal=\d+/.test(page.url()));
const drawerCompany = await page.locator('[role=dialog] h2.display').first().innerText();
ok('drawer shows the company', /Kaveri/.test(drawerCompany), drawerCompany);
await page.getByRole('tab', { name: 'Brief' }).click();
await page.waitForTimeout(1200);
const hasBrief = (await page.getByText('Company snapshot').count()) > 0 || (await page.getByText('No research brief yet').count()) > 0 || (await page.getByText('Generating').count()) > 0;
ok('drawer Brief tab renders (markdown, empty or generating state)', hasBrief);
await page.getByRole('tab', { name: 'Calls' }).click(); await page.waitForTimeout(800);
ok('drawer Calls tab lists calls', (await page.getByText(/Completed|Scheduled|No-show|Canceled|completed|scheduled/).count()) > 0);
await page.getByRole('tab', { name: 'Timeline' }).click(); await page.waitForTimeout(500);
ok('drawer Timeline shows stage history', (await page.getByText(/Moved/).count()) > 0);
await page.keyboard.press('Escape'); await page.waitForTimeout(400);
ok('Escape closes the drawer', !/deal=\d+/.test(page.url()));

// ── approve & send
await page.goto(`${BASE}/proposals`);
await page.waitForTimeout(1500);
const awaiting0 = Number((await page.getByRole('tab', { name: /Awaiting approval/ }).innerText()).match(/\d+/)?.[0] ?? 0);
const sent0 = Number((await page.getByRole('tab', { name: /^Sent/ }).innerText()).match(/\d+/)?.[0] ?? 0);
ok('approval queue has drafts', awaiting0 > 0, `${awaiting0}`);
await page.getByRole('button', { name: 'Approve & send' }).first().click();
ok('approve asks for confirmation first', await page.getByRole('dialog').getByText(/cannot be unsent/).isVisible());
await page.getByRole('dialog').getByRole('button', { name: 'Approve & send' }).click();
ok('approve shows the backend message as a toast', await toast(/sent to/i));
await page.waitForTimeout(1800);
const awaiting1 = Number((await page.getByRole('tab', { name: /Awaiting approval/ }).innerText()).match(/\d+/)?.[0] ?? 0);
const sent1 = Number((await page.getByRole('tab', { name: /^Sent/ }).innerText()).match(/\d+/)?.[0] ?? 0);
ok('approve moves the proposal from Awaiting to Sent', awaiting1 === awaiting0 - 1 && sent1 === sent0 + 1, `awaiting ${awaiting0}->${awaiting1}, sent ${sent0}->${sent1}`);

// ── request changes -> version + 1
const firstCard = page.locator('div.p-4', { hasText: 'Request changes' }).first();
const company = (await firstCard.locator('button').first().innerText()).trim();
const verText = await firstCard.getByText(/^Version \d/).innerText();
await firstCard.getByRole('button', { name: 'Request changes' }).click();
await page.getByRole('dialog').getByRole('button', { name: 'Redraft as next version' }).click();
ok('request changes validates the notes', await page.getByText(/Tell us what to change/).isVisible());
await page.getByRole('dialog').getByLabel('What should change?').fill('Split the fee into two milestones please');
await page.getByRole('dialog').getByRole('button', { name: 'Redraft as next version' }).click();
ok('request changes confirms redrafting', await toast(/redrafted/i));
await page.waitForTimeout(6500);
const nextVer = `Version ${Number(verText.match(/\d+/)[0]) + 1}`;
const card2 = page.locator('div.p-4', { hasText: company }).filter({ hasText: nextVer });
ok(`a new draft "${nextVer}" appears for ${company}`, (await card2.count()) > 0);
ok('the new draft shows what was asked for', (await card2.first().getByText(/Split the fee/).count()) > 0);

// ── log call outcome -> deal moves, draft appears later
await page.goto(`${BASE}/calls`);
await page.waitForTimeout(1500);
await page.getByRole('button', { name: 'Log outcome' }).first().click();
await page.getByRole('dialog').getByRole('button', { name: 'Log call and draft proposal' }).click();
ok('log outcome requires a transcript or notes', await page.getByText(/Paste at least a few lines/).isVisible());
await page.getByRole('dialog').getByRole('radio', { name: /didn't show up/ }).check({ force: true });
ok('no-show explains rebooking', await page.getByText(/rebooking|booking link/i).first().isVisible());
await page.getByRole('dialog').getByRole('radio', { name: /call happened/ }).check({ force: true });
await page.getByRole('dialog').getByLabel('Transcript or your notes').fill('We spoke for 40 minutes about their webinar funnel. Budget is about 1 lakh, they want to start next month and need a reporting dashboard.');
ok('completed outcome explains what happens next', await page.getByText(/nothing is sent until you tap/i).isVisible());
await page.getByRole('dialog').getByRole('button', { name: 'Log call and draft proposal' }).click();
ok('log outcome toast explains the draft', await toast(/Call logged/));

// ── pipeline: drag to Lost needs a reason
await page.goto(`${BASE}/pipeline`);
await page.waitForTimeout(1800);
const openCol = page.locator('section[aria-label^="Proposal opened"]');
const lostCol = page.locator('section[aria-label^="Lost"]');
const lost0 = Number((await lostCol.getAttribute('aria-label')).match(/(\d+) deals/)[1]);
const dragCard = openCol.locator('[data-draggable="deal-card"]').first();
const cardName = (await dragCard.locator('button').first().innerText()).split('\n')[0];
await openCol.evaluate((el) => el.scrollIntoView({ inline: 'start', block: 'nearest' }));
await page.waitForTimeout(400);
const drag = async (from, to) => {
  const a = await from.boundingBox(); const t = await to.boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + 30); await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 20, a.y + 50, { steps: 4 });
  await page.mouse.move(t.x + t.width / 2, t.y + 110, { steps: 18 }); await page.waitForTimeout(150); await page.mouse.up();
};
await drag(dragCard, lostCol);
await page.waitForTimeout(500);
ok('dropping on Lost opens a confirmation', await page.getByRole('dialog').getByText(/Mark .* as lost/).isVisible());
await page.getByRole('dialog').getByLabel('Why was it lost?').selectOption('other');
await page.getByRole('dialog').getByRole('button', { name: 'Mark as lost' }).click();
ok('Lost requires a reason', await page.getByText(/reason is required/i).isVisible());
await page.getByRole('dialog').getByLabel('Why was it lost?').selectOption('budget');
await page.getByRole('dialog').getByRole('button', { name: 'Mark as lost' }).click();
ok('lost confirmation toast', await toast(/moved to lost/i));
await page.waitForTimeout(1500);
const lost1 = Number((await page.locator('section[aria-label^="Lost"]').getAttribute('aria-label')).match(/(\d+) deals/)[1]);
ok(`card "${cardName}" is now in the Lost column`, lost1 === lost0 + 1, `${lost0} -> ${lost1}`);
// won is not draggable-into
const negCard = page.locator('section[aria-label^="Negotiation"] [data-draggable="deal-card"]').first();
await page.locator('section[aria-label^="Negotiation"]').evaluate((el) => el.scrollIntoView({ inline: 'start', block: 'nearest' }));
await page.waitForTimeout(400);
if (await negCard.count()) { await drag(negCard, page.locator('section[aria-label^="Won"]')); ok('dropping on Won explains it happens by payment', await toast(/payment/i)); }
await page.getByRole('button', { name: 'Table' }).click(); await page.waitForTimeout(600);
ok('table view lists deals with sortable headers', (await page.locator('th[aria-sort]').count()) >= 8);
const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export CSV' }).click()]);
ok('CSV export downloads', /pipeline-.*\.csv/.test(dl.suggestedFilename()), dl.suggestedFilename());

// ── theme + win rate + services + consultants + system
await page.getByRole('button', { name: /Switch to dark theme/ }).click(); await page.waitForTimeout(300);
ok('theme toggle switches to dark', await page.evaluate(() => document.documentElement.classList.contains('dark')));
await page.goto(`${BASE}/winrate`); await page.waitForTimeout(1500);
await page.getByRole('button', { name: 'Service × source' }).click(); await page.waitForTimeout(1200);
ok('service × source heatmap renders', (await page.locator('td.heat-3, td.heat-4, td.heat-5, td.heat-2, td.heat-1').count()) > 5);
ok('heatmap marks low-data cells', (await page.locator('td.heat-low').count()) > 0);
await page.getByRole('button', { name: 'Lead source' }).click(); await page.waitForTimeout(800);
await page.getByRole('button', { name: /view as table/i }).first().click();
ok('"view as table" toggle works', (await page.locator('table caption').first().count()) > 0);
await page.goto(`${BASE}/services`); await page.waitForTimeout(1200);
await page.getByRole('button', { name: 'Add service' }).click();
await page.getByLabel('Name').fill('Pricing Review'); await page.getByLabel(/Service type/).fill('pricing review');
await page.getByRole('dialog').getByRole('button', { name: 'Create service' }).click();
ok('service form validates the code', await page.getByText(/no spaces/i).isVisible());
await page.getByLabel(/Service type/).fill('pricing_review'); await page.getByLabel(/Base price/).fill('35000');
await page.getByRole('dialog').getByRole('button', { name: 'Create service' }).click();
ok('service created toast', await toast(/Service created/));
await page.goto(`${BASE}/consultants`); await page.waitForTimeout(1200);
ok('consultants show speed and win rate', (await page.getByText(/Proposal speed/).count()) >= 4);
await page.goto(`${BASE}/system`); await page.waitForTimeout(1000);
await page.getByRole('button', { name: 'Run check' }).click(); await page.waitForTimeout(2500);
ok('contract health check passes every endpoint', await page.getByText(/All \d+ checks pass/).isVisible());
await page.getByRole('button', { name: 'Run all, then clean up' }).click();
await page.getByRole('dialog').getByRole('button', { name: 'Run all scenarios' }).click();
ok('test runner completes all scenarios', await toast(/All scenarios passed/, 15000));
ok('test runner reported 6 results', (await page.locator('[aria-live=polite] > div').count()) === 6);

ok('the dashboard never requested /deal/t/* or /deal/payment', blocked.length === 0, blocked.join(','));
ok('no console or page errors', errs.length === 0, errs.slice(0, 3).join(' || '));
await ctx.close();

// ── consultant: scoped
const c2 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const p2 = await c2.newPage();
await p2.goto(`${BASE}/login`);
await p2.getByRole('tab', { name: 'Consultant' }).click();
await p2.getByRole('button', { name: /Kavya Nair/ }).click();
await p2.getByRole('button', { name: 'Sign in', exact: true }).click();
await p2.waitForURL('**/overview'); await p2.waitForTimeout(1200);
ok('consultant signs in with email + code', true);
ok('consultant nav hides Services, Consultants, System', (await p2.getByRole('link', { name: /^(Services|Consultants|System)$/ }).count()) === 0);
await p2.goto(`${BASE}/consultants`); await p2.waitForTimeout(800);
ok('consultant is bounced from owner-only pages', p2.url().endsWith('/overview'));
const deals = await (await p2.request.get(`${BASE}/api/n8n/deal/deals?page_size=500`)).json();
ok('consultant only receives their own deals', new Set(deals.data.map((d) => d.consultant_name)).size === 1, [...new Set(deals.data.map((d) => d.consultant_name))].join(','));
const other = await (await p2.request.get(`${BASE}/api/n8n/deal/deals?page_size=500&consultant_id=1`)).json();
ok('forcing consultant_id=1 changes nothing', new Set(other.data.map((d) => d.consultant_name)).size === 1 && other.data[0].consultant_name === deals.data[0].consultant_name);
const meta = await p2.request.get(`${BASE}/api/n8n/deal/consultants`);
ok('consultants endpoint is closed to consultants (403)', meta.status() === 403);
await c2.close();
await browser.close();
const failed = results.filter((r) => !r.cond);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
