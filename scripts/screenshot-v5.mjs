import { chromium } from '@playwright/test';
import { readFileSync } from 'fs';

const BASE = 'http://localhost:3100';
const USER = 'OUMAIMA';
const PASS = 'MMT2027';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

// Login
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.locator('#lp-logo').waitFor({ state: 'visible', timeout: 15000 });
await page.locator('#lp-logo').click();
await page.locator('#lp-u').waitFor({ state: 'visible', timeout: 10000 });
await page.locator('#lp-u').fill(USER);
await page.locator('#lp-p').fill(PASS);
const resp = page.waitForResponse(r => r.url().includes('/api/auth/login'), { timeout: 20000 });
await page.locator('#lp-p').press('Enter');
const r = await resp;
console.log('Login:', await r.json());
await page.waitForTimeout(500);

// /flotas = Estudio (CarpetaScreen V4.5)
await page.goto(`${BASE}/flotas`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(3000);
await page.screenshot({ path: 'screenshots/estudio.png', fullPage: false });
console.log('[OK] /flotas → screenshots/estudio.png (debe ser CarpetaScreen V4.5)');

// Dashboard
await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(4000);
await page.screenshot({ path: 'screenshots/dashboard.png', fullPage: false });
console.log('[OK] /dashboard → screenshots/dashboard.png');

// Dashboard EN MODO CLARO (toggle via click)
await page.click('[aria-label*="Activar modo claro"], [aria-label*="modo claro"]').catch(() => {});
await page.waitForTimeout(700);
await page.screenshot({ path: 'screenshots/dashboard-light.png', fullPage: false });
console.log('[OK] /dashboard light → screenshots/dashboard-light.png');

// Auditoría: capturar TODAS las pantallas principales en dark
const errors = [];
page.on('pageerror', e => errors.push('ERR: ' + e.message));
page.on('console', msg => { if (msg.type() === 'error') errors.push('CONSOLE: ' + msg.text()); });

// Para /emission capturo scroll-al-final para ver el paginador
await page.goto(`${BASE}/emission`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(8000);
// Scroll iframe content al final
try {
    await page.evaluate(() => {
        const ifr = document.querySelector('iframe');
        if (ifr?.contentDocument) {
            const scroll = ifr.contentDocument.querySelector('#tscroll') || ifr.contentDocument.body;
            scroll.scrollTop = scroll.scrollHeight;
            window.scrollTo(0, document.body.scrollHeight);
        }
    });
} catch {}
await page.waitForTimeout(1500);
await page.screenshot({ path: 'screenshots/audit-emission-pager.png', fullPage: true });
console.log('[OK] /emission con pager → screenshots/audit-emission-pager.png');

console.log('\n=== ERRORES DETECTADOS ===');
if (errors.length === 0) console.log('  Ninguno');
else errors.slice(0, 20).forEach(e => console.log('  ' + e));

const frame = page.frameLocator('iframe[title="ORION Flotas v7"]');
const kpiCount = await frame.locator('.kpi').count().catch(() => 0);
console.log(`[v7] KPIs dentro del iframe: ${kpiCount}`);

await browser.close();
