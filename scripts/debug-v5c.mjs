import { chromium } from '@playwright/test';
const page = await (await (await chromium.launch()).newContext({ viewport: { width: 1440, height: 900 } })).newPage();
page.on('pageerror', e => console.log('[PAGEERROR]', e.message));
page.on('console', m => { if (m.type()==='error') console.log('[ERR]', m.text()); });

await page.goto('http://localhost:3100/login', { waitUntil: 'domcontentloaded' });
await page.locator('#lp-logo').click();
await page.locator('#lp-u').fill('OUMAIMA'); await page.locator('#lp-p').fill('MMT2027');
const r = page.waitForResponse(x => x.url().includes('/api/auth/login'), { timeout: 20000 });
await page.locator('#lp-p').press('Enter'); await r;
await page.waitForTimeout(400);
await page.goto('http://localhost:3100/flotas', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(6000);

const dump = await page.evaluate(() => {
    const kpis = document.getElementById('kpis');
    const cwrap = document.getElementById('cwrap');
    const pg = document.getElementById('pg');
    return {
        exists_pg: !!pg,
        exists_kpis: !!kpis,
        pg_classes: pg?.className || '',
        pg_display: pg ? getComputedStyle(pg).display : '',
        kpis_html: kpis ? kpis.innerHTML.substring(0, 200) : '(no existe #kpis)',
        kpis_children: kpis ? kpis.children.length : 0,
        kpis_display: kpis ? getComputedStyle(kpis).display : '',
        cwrap_children: cwrap ? cwrap.children.length : 0,
        bodyChildren: Array.from(document.body.children).map(c => `<${c.tagName.toLowerCase()} class="${c.className?.toString().substring(0,40)}">`).slice(0, 10),
        hayHeader: document.querySelectorAll('header').length,
        error_window: window.__orion_error || null,
    };
});
console.log('DUMP:', JSON.stringify(dump, null, 2));
process.exit(0);
