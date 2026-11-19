import { chromium } from '@playwright/test';
const page = await (await (await chromium.launch()).newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const logs = [];
page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', e => logs.push(`[PAGEERROR] ${e.message}`));

await page.goto('http://localhost:3100/login', { waitUntil: 'domcontentloaded' });
await page.locator('#lp-logo').click();
await page.locator('#lp-u').fill('OUMAIMA');
await page.locator('#lp-p').fill('MMT2027');
const r = page.waitForResponse(x => x.url().includes('/api/auth/login'), { timeout: 20000 });
await page.locator('#lp-p').press('Enter'); await r;
await page.waitForTimeout(400);

await page.goto('http://localhost:3100/flotas', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(5000);

logs.forEach(l => console.log(l));
console.log('---');
const dom = await page.evaluate(() => ({
    kpis: document.querySelectorAll('#kpis .kpi').length,
    hasScript: document.querySelectorAll('script[data-orion-v7]').length,
}));
console.log('DOM:', dom);
process.exit(0);
