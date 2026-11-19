import { chromium } from '@playwright/test';
const page = await (await (await chromium.launch()).newContext({ viewport: { width: 1440, height: 900 } })).newPage();
page.on('pageerror', e => console.log('PAGEERROR:', e.message));
page.on('console', m => { if (m.type()==='error') console.log('ERR:', m.text()); if (m.text().includes('V7')) console.log('V7:', m.text()); });

await page.goto('http://localhost:3100/login', { waitUntil: 'domcontentloaded' });
await page.locator('#lp-logo').click(); await page.locator('#lp-u').fill('OUMAIMA'); await page.locator('#lp-p').fill('MMT2027');
const r = page.waitForResponse(x => x.url().includes('/api/auth/login'), { timeout: 20000 });
await page.locator('#lp-p').press('Enter'); await r;
await page.waitForTimeout(400);
await page.goto('http://localhost:3100/flotas', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(6000);

const r2 = await page.evaluate(() => ({
    orion_defined: typeof window.__orion,
    v7_error: window.__v7_error ? String(window.__v7_error.message || window.__v7_error) : null,
    F_length: window.__orion?.F?.length ?? null,
    kpi_cnt: document.querySelectorAll('#kpis .kpi').length,
    hoy_text: document.querySelector('#hoy')?.textContent || '',
    kpis_parent_html: document.querySelector('#kpis')?.parentElement?.outerHTML?.substring(0, 300) || '',
}));
console.log('RESULT:', JSON.stringify(r2, null, 2));
process.exit(0);
