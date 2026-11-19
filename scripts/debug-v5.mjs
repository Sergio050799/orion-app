import { chromium } from '@playwright/test';

const BASE = 'http://localhost:3100';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

const errors = [];
page.on('console', msg => { if (msg.type() === 'error') errors.push({ type: 'console', text: msg.text() }); });
page.on('pageerror', err => errors.push({ type: 'pageerror', text: err.message, stack: err.stack?.substring(0, 500) }));

await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.locator('#lp-logo').waitFor({ state: 'visible', timeout: 15000 });
await page.locator('#lp-logo').click();
await page.locator('#lp-u').waitFor({ state: 'visible', timeout: 10000 });
await page.locator('#lp-u').fill('OUMAIMA');
await page.locator('#lp-p').fill('MMT2027');
const r = page.waitForResponse(x => x.url().includes('/api/auth/login'), { timeout: 20000 });
await page.locator('#lp-p').press('Enter');
await r;
await page.waitForTimeout(400);

await page.goto(`${BASE}/flotas`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(6000);

// Dump errores
console.log('=== ERRORES CONSOLA ===');
errors.forEach((e, i) => console.log(`${i}: [${e.type}] ${e.text.substring(0, 300)}`));

// Verificar que elementos clave existen
const checks = await page.evaluate(() => {
    return {
        kpis_html: document.querySelector('#kpis')?.innerHTML.length || 0,
        kpis_n: document.querySelectorAll('#kpis .kpi').length,
        cband_html: document.querySelector('#cwrap')?.innerHTML.length || 0,
        tscroll_html: document.querySelector('#tscroll')?.innerHTML.length || 0,
        RAW_global: typeof window.__ORION_V5_DATA__,
        hay_script_v7: !!document.querySelector('script[data-orion-v7]'),
        error_text: document.querySelector('.fl-toast')?.textContent || '',
    };
});
console.log('=== CHECKS DOM ===');
console.log(JSON.stringify(checks, null, 2));

await page.screenshot({ path: 'screenshots/flotas-v7-debug.png', fullPage: true });
await browser.close();
