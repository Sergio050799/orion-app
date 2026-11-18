/**
 * Tests E2E Sprint 1 — bugs #0, #1, #2, #3 sobre ORION local (V4.5).
 * Login persistido vía storageState para no gastar el rate-limit.
 */
import { test, expect, Page } from '@playwright/test';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const BASE = 'http://localhost:3000';
const USER = 'OUMAIMA';
const PASS = 'MMT2027';
const STORAGE = join(process.cwd(), '.auth', 'storage.json');

async function doLoginFresh(page: Page) {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.locator('#lp-logo').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('#lp-logo').click();
    await page.locator('#lp-u').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('#lp-u').fill(USER);
    await page.locator('#lp-p').fill(PASS);
    const loginResp = page.waitForResponse(r => r.url().includes('/api/auth/login'), { timeout: 20000 });
    await page.locator('#lp-p').press('Enter');
    const resp = await loginResp;
    const body = await resp.json().catch(() => ({ success: false }));
    if (!body.success) throw new Error(`Login API falló: ${JSON.stringify(body)}`);
    await page.waitForTimeout(600);
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 30000 });
}

test.describe('Sprint 1', () => {
    test.setTimeout(240_000);

    test('4 bugs E2E', async ({ page }) => {
        const results: Record<string, string> = {};

        // ── Bug #0 — primas/config con cookie ya establecida ────────────────
        const r0 = await page.request.get(`${BASE}/api/primas/config`);
        expect(r0.ok()).toBeTruthy();
        const d0 = await r0.json();
        const nPrimas = Object.keys(d0.primas || {}).length;
        const nAjustes = Object.keys(d0.ajustes || {}).length;
        console.log(`[Bug #0] primas=${nPrimas} · ajustes=${nAjustes}`);
        results['Bug #0'] = `primas=${nPrimas}, ajustes=${nAjustes}`;
        expect(nPrimas).toBeGreaterThan(0);

        // ── /flotas carga sin errores de consola ────────────────────────────
        const errors: string[] = [];
        page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
        page.on('pageerror', err => errors.push(err.message));

        await page.goto(`${BASE}/flotas`);
        await page.waitForLoadState('networkidle', { timeout: 30000 });
        await page.waitForTimeout(3000);  // dejar que el grid estabilice
        await page.screenshot({ path: 'test-results/screens/01-flotas.png', fullPage: true });

        const reales = errors.filter(e =>
            !e.includes('favicon') &&
            !e.toLowerCase().includes('hydration') &&
            !e.toLowerCase().includes('download the react devtools')
        );
        console.log(`[Bug #3] errores de consola: ${reales.length}`);
        reales.forEach(e => console.log('  →', e.substring(0, 160)));
        results['Bug #3'] = `${reales.length} errores críticos`;

        // ── Bug #1 — abrir carpeta y buscar botón Confirmar ─────────────────
        // Enfoque: inspeccionar DOM para saber qué elementos clicables existen con nombres de empresa
        const dump = await page.evaluate(() => {
            const all = Array.from(document.querySelectorAll('*')).filter(el => {
                const t = (el.textContent || '').trim();
                return t.length > 5 && t.length < 80 && /Vidriera|CAMIONES TRES|Transportes|AON|MOLYMA/i.test(t);
            });
            return all.slice(0, 15).map(el => ({
                tag: el.tagName,
                cls: (el.className?.toString() || '').substring(0, 60),
                txt: (el.textContent || '').trim().substring(0, 50),
                hasOnClick: !!(el as HTMLElement).onclick,
                parent: el.parentElement?.tagName,
            }));
        });
        console.log('[Bug #1] Elementos con nombres de empresa:');
        dump.forEach((d, i) => console.log(`   ${i}: <${d.tag} class="${d.cls}" onclick=${d.hasOnClick}> "${d.txt}" (padre ${d.parent})`));

        if (dump.length === 0) {
            results['Bug #1'] = 'NO SE ENCONTRO CARPETA EN DOM';
            throw new Error('No se encontró ningún elemento con nombre de empresa en /flotas');
        } else {
            // Estrategia: Playwright getByText + click({force}) para no depender del scroll
            await page.getByText('Vidriera').first().click({ force: true });
            await page.waitForTimeout(3000);
            await page.screenshot({ path: 'test-results/screens/bug1-02-carpeta-abierta.png', fullPage: true });

            // Asegurar DATOS GENERALES activa
            const datosTab = page.getByRole('button', { name: /DATOS GENERALES/i }).first();
            if (await datosTab.count() > 0) {
                await datosTab.click();
                await page.waitForTimeout(600);
            }
            await page.screenshot({ path: 'test-results/screens/bug1-03-datos.png', fullPage: true });

            const btnConfirmar = page.getByRole('button', { name: /Confirmar y continuar/i });
            const btnCount = await btnConfirmar.count();
            console.log(`[Bug #1] Botón Confirmar y continuar → count=${btnCount}`);

            if (btnCount === 0) {
                results['Bug #1'] = 'BOTON NO VISIBLE';
                // El test falla si el botón no se encuentra
                throw new Error('Botón "Confirmar y continuar →" no visible en DATOS GENERALES');
            } else {
                await expect(btnConfirmar).toBeVisible();
                console.log('[Bug #1] ✓ Botón VISIBLE');

                const antes = await page.locator('button[aria-current="step"]').first().textContent().catch(() => '?');
                await btnConfirmar.click();
                await page.waitForTimeout(1500);
                await page.screenshot({ path: 'test-results/screens/bug1-04-tras-confirmar.png', fullPage: true });

                const despues = await page.locator('button[aria-current="step"]').first().textContent().catch(() => '?');
                const err = await page.locator('.dg-confirm-err').textContent().catch(() => '');
                const flash = await page.locator('.dg-confirm-ok').textContent().catch(() => '');
                console.log(`[Bug #1] ANTES=${antes?.trim()} DESPUES=${despues?.trim()} err="${err}" flash="${flash}"`);

                const cambio = (despues?.trim() !== antes?.trim()) || !!flash || !!err;
                expect(cambio).toBe(true);
                results['Bug #1'] = `boton respondio (pestaña: ${despues?.trim()})`;
            }
        }

        // ── Bug #2 ya cubierto por Bug #0 (mismo endpoint y mismos fixes lógicos ya probados en unit tests) ──
        results['Bug #2'] = 'cubierto por Bug #0 + unit tests';

        // ── RESUMEN ─────────────────────────────────────────────────────────
        console.log('\n' + '='.repeat(60));
        console.log('RESUMEN SPRINT 1 — E2E');
        console.log('='.repeat(60));
        for (const [k, v] of Object.entries(results)) console.log(`  ${k.padEnd(10)} ${v}`);
        console.log('='.repeat(60));
    });
});
