import { chromium } from '/var/www/china/node_modules/.pnpm/playwright-core@1.61.1/node_modules/playwright-core/index.mjs';
import { readFileSync } from 'node:fs';
const b = await chromium.launch({
  executablePath: '/root/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome',
  args: ['--no-sandbox'],
});
const ctx = await b.newContext({ viewport: { width: 1500, height: 1000 } });
await ctx.addCookies([
  {
    name: 'gelateria_session',
    value: readFileSync(process.argv[2], 'utf8').trim(),
    domain: 'localhost',
    path: '/',
  },
]);
const p = await ctx.newPage();
const errori = [];
p.on('pageerror', (e) => errori.push(String(e)));
await p.goto('http://localhost:3031/gelateria/ordini', { waitUntil: 'networkidle' });
await p.evaluate(() =>
  fetch('/gelateria/api/orders/current', {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
  }),
);
await p.reload({ waitUntil: 'networkidle' });
await p.locator('input[type="text"]').first().fill('red hot');
await p.waitForTimeout(1200);
// il pulsante di un'alternativa: «Aggiungi <prodotto> da <fornitore>»
const alternativa = p.locator('button[aria-label*=" da "]').first();
console.log('alternativa:', await alternativa.getAttribute('aria-label'));
await alternativa.click();
await p.waitForTimeout(2500);
console.log('--- PANNELLO ORDINE ---\n' + (await p.locator('aside').nth(1).innerText()));
await p.screenshot({ path: process.argv[3] });
console.log('errori:', errori.length ? errori.join(' / ') : 'nessuno');
await b.close();
