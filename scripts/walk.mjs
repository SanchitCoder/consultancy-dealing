// Walks every page in a real browser: collects console errors / failed requests and saves screenshots.
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:3100';
const OUT = process.env.OUT ?? './shots';
fs.mkdirSync(OUT, { recursive: true });
const problems = [];
const browser = await chromium.launch();

async function session(name, viewport, colorScheme, fn) {
  const ctx = await browser.newContext({ viewport, colorScheme });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`[${name}] console: ${m.text().slice(0, 220)}`); });
  page.on('pageerror', (e) => problems.push(`[${name}] pageerror: ${String(e).slice(0, 220)}`));
  page.on('response', (r) => { if (r.status() >= 400 && !r.url().includes('/_next/')) problems.push(`[${name}] HTTP ${r.status()} ${r.request().method()} ${r.url().replace(BASE, '')}`); });
  await fn(page);
  await ctx.close();
}
const loginOwner = async (page) => {
  await page.goto(`${BASE}/login`);
  await page.getByLabel('Owner password').fill('northstar-demo');
  await page.getByRole('button', { name: 'Sign in as owner' }).click();
  await page.waitForURL('**/overview');
};
const shot = async (page, name) => { await page.waitForTimeout(1300); await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false }); };

const pages = ['overview', 'pipeline', 'calls', 'proposals', 'winrate', 'services', 'consultants', 'system'];
await session('desktop-light', { width: 1440, height: 900 }, 'light', async (page) => {
  await page.goto(`${BASE}/login`); await shot(page, 'login');
  await loginOwner(page);
  for (const p of pages) { await page.goto(`${BASE}/${p}`); await shot(page, `desktop-${p}`); }
});
await session('desktop-dark', { width: 1440, height: 900 }, 'dark', async (page) => {
  await loginOwner(page);
  for (const p of ['overview', 'pipeline', 'winrate']) { await page.goto(`${BASE}/${p}`); await shot(page, `dark-${p}`); }
});
await session('mobile', { width: 390, height: 844 }, 'light', async (page) => {
  await loginOwner(page);
  for (const p of ['overview', 'pipeline', 'calls', 'proposals', 'winrate']) { await page.goto(`${BASE}/${p}`); await shot(page, `mobile-${p}`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    if (overflow) problems.push(`[mobile] horizontal page scroll on /${p}`);
  }
});
await browser.close();
console.log(problems.length ? `PROBLEMS (${problems.length}):\n` + [...new Set(problems)].join('\n') : 'no console errors, failed requests or horizontal overflow');
