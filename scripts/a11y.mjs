// WCAG 2.1 A/AA audit with axe-core on every page, light and dark, plus phone-width overflow.
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
const BASE = process.env.BASE ?? 'http://localhost:3100';
const browser = await chromium.launch();
const pages = ['overview', 'pipeline', 'calls', 'proposals', 'winrate', 'services', 'consultants', 'system'];
const seen = new Map();
for (const scheme of ['light', 'dark']) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: scheme });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  if (scheme === 'light') { const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze(); for (const v of r.violations) { seen.set(`login/${scheme}: ${v.id}`, v); } }
  await page.getByLabel('Owner password').fill('northstar-demo'); await page.getByRole('button', { name: 'Sign in as owner' }).click(); await page.waitForURL('**/overview');
  for (const p of pages) {
    await page.goto(`${BASE}/${p}`); await page.waitForTimeout(1800);
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    for (const v of r.violations) { seen.set(`${p}/${scheme}: ${v.id}`, v); }
  }
  await ctx.close();
}
const m = await browser.newContext({ viewport: { width: 390, height: 844 } }); const mp = await m.newPage();
await mp.goto(`${BASE}/login`); await mp.getByLabel('Owner password').fill('northstar-demo'); await mp.getByRole('button', { name: 'Sign in as owner' }).click(); await mp.waitForURL('**/overview');
const over = [];
for (const p of ['overview', 'pipeline', 'calls', 'proposals', 'winrate', 'services', 'consultants', 'system']) { await mp.goto(`${BASE}/${p}`); await mp.waitForTimeout(1200); if (await mp.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) over.push(p); }
await browser.close();
if (!seen.size) console.log('axe: 0 WCAG A/AA violations on login + 8 pages in light and dark'); else for (const [k, v] of seen) console.log(`${k} [${v.impact}] ${v.help}\n   ${v.nodes.slice(0, 3).map((n) => n.target.join(' ') + ' :: ' + (n.any[0]?.message ?? n.all[0]?.message ?? '')).join('\n   ')}`);
console.log(over.length ? `phone-width horizontal overflow on: ${over.join(', ')}` : 'phone width (390px): no horizontal page scroll on any page');
process.exit(seen.size || over.length ? 1 : 0);
