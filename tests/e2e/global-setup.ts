import { chromium, FullConfig } from '@playwright/test';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const BASE = 'http://localhost:3000';
const USER = 'OUMAIMA';
const PASS = 'MMT2027';

async function globalSetup(_config: FullConfig) {
    const storage = join(process.cwd(), '.auth', 'storage.json');
    if (existsSync(storage)) {
        console.log('[global-setup] storageState ya existe — skip login');
        return;
    }
    mkdirSync(join(process.cwd(), '.auth'), { recursive: true });

    const browser = await chromium.launch();
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
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
    if (!body.success) throw new Error(`[global-setup] Login falló: ${JSON.stringify(body)}`);
    await page.waitForTimeout(500);
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await ctx.storageState({ path: storage });
    await browser.close();
    console.log('[global-setup] storageState guardado OK');
}

export default globalSetup;
