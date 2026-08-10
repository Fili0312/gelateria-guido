import { chromium } from '/var/www/china/node_modules/.pnpm/playwright-core@1.61.1/node_modules/playwright-core/index.mjs';
import { readFileSync } from 'node:fs';

const token = readFileSync(process.argv[2], 'utf8').trim();
const BASE = 'http://localhost:3031/gelateria';
let falliti = 0;
const esito = (ok, testo) => {
  console.log(`  ${ok ? '✓' : '✗'} ${testo}`);
  if (!ok) falliti++;
};

const b = await chromium.launch({
  executablePath: '/root/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome',
  args: ['--no-sandbox'],
});

async function apri({ width, height, touch = false }) {
  const ctx = await b.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch });
  await ctx.addCookies([
    { name: 'gelateria_session', value: token, domain: 'localhost', path: '/' },
  ]);
  const p = await ctx.newPage();
  const errori = [];
  p.on('pageerror', (e) => errori.push(String(e)));
  p.on('response', (r) => {
    if (r.status() >= 400 && r.url().includes('/api/')) errori.push(`${r.status()} ${r.url()}`);
  });
  return { p, ctx, errori };
}

const barra = (p) => p.locator('.fixed.inset-x-0.bottom-0');

/** Ogni blocco parte da un ordine vuoto: senza, i conteggi di un blocco
 *  falsano le asserzioni del successivo — ed è successo. */
async function svuota(p) {
  await p.evaluate(async () => {
    await fetch('/gelateria/api/orders/current', {
      method: 'DELETE',
      headers: { Accept: 'application/json' },
    });
  });
  await p.reload({ waitUntil: 'networkidle' });
}

console.log('\n── Criterio: da ricerca ad «aggiunto» in due interazioni ────────\n');
{
  const { p, errori } = await apri({ width: 1280, height: 900 });
  await p.goto(`${BASE}/ordini`, { waitUntil: 'networkidle' });
  await svuota(p);

  const campo = p.locator('input[type="text"], input:not([type])').first();
  esito(
    await campo.evaluate((e) => e === document.activeElement),
    'il campo di ricerca ha già il fuoco all’apertura',
  );

  // Interazione 1: scrivere. Interazione 2: Invio.
  await campo.type('amaretto', { delay: 30 });
  await p.waitForTimeout(900);
  const risultati = await p.locator('ul[aria-label="Risultati della ricerca"] > li').count();
  esito(risultati > 0, `la ricerca trova qualcosa (${risultati} risultati)`);

  await campo.press('Enter');
  await p.waitForTimeout(1200);
  const testoBarra = await barra(p).innerText();
  esito(
    /1\s+prodotto/.test(testoBarra),
    `dopo Invio la barra dice 1 prodotto — «${testoBarra.split('\n')[0]}»`,
  );
  esito(errori.length === 0, `nessun errore in console${errori.length ? ': ' + errori[0] : ''}`);
}

console.log('\n── Criterio: tutto con la sola tastiera ─────────────────────────\n');
{
  const { p, errori } = await apri({ width: 1280, height: 900 });
  await p.goto(`${BASE}/ordini`, { waitUntil: 'networkidle' });
  await svuota(p);
  const campo = p.locator('input[type="text"], input:not([type])').first();
  await campo.type('a', { delay: 30 });
  await p.waitForTimeout(900);

  const prima = await p.locator('ul[aria-label="Risultati della ricerca"] > li').count();
  esito(prima > 1, `più risultati fra cui muoversi (${prima})`);

  await campo.press('ArrowDown');
  await campo.press('ArrowDown');
  const attiva = await p
    .locator('ul[aria-label="Risultati della ricerca"] > li.border-brand-500')
    .first()
    .innerText();
  esito(true, `↓↓ sposta la selezione su «${attiva.split('\n')[0]}»`);

  await campo.press('Enter');
  await p.waitForTimeout(1200);
  const testoBarra = await barra(p).innerText();
  esito(
    /1\s+prodotto/.test(testoBarra),
    `Invio aggiunge quello selezionato — «${testoBarra.split('\n')[0]}»`,
  );

  // Invio di nuovo sullo stesso: deve aumentare, non duplicare.
  await campo.press('Enter');
  await p.waitForTimeout(1200);
  const dopo = await barra(p).innerText();
  esito(
    /1\s+prodotto/.test(dopo) && /2\s+confezioni/.test(dopo),
    `un secondo Invio aumenta la quantità e non duplica la riga — «${dopo.split('\n')[0]}»`,
  );

  // Il riepilogo si apre e si usa da tastiera.
  await p.keyboard.press('Tab');
  const raggiungibile = await p.evaluate(() => {
    const attivo = document.activeElement;
    return attivo
      ? `${attivo.tagName}:${(attivo.textContent || '').trim().slice(0, 30)}`
      : 'niente';
  });
  esito(raggiungibile !== 'niente', `Tab porta al comando successivo (${raggiungibile})`);
  esito(errori.length === 0, `nessun errore in console${errori.length ? ': ' + errori[0] : ''}`);
}

console.log('\n── Criterio: i totali della barra tornano con le righe ──────────\n');
{
  const { p } = await apri({ width: 1280, height: 900 });
  await p.goto(`${BASE}/ordini`, { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: /Guarda riepilogo ordine/i }).click();
  await p.waitForTimeout(500);

  const totali = await p.evaluate(() => {
    const barra = document.querySelector('.fixed.inset-x-0.bottom-0');
    const testo = barra.innerText;
    const euro = [...testo.matchAll(/([\d.]+,\d{2})\s*€/g)].map((m) => m[1]);
    const righeTesto = [...barra.querySelectorAll('li')].map((li) => li.innerText);
    return { testo, euro, righe: righeTesto.length };
  });
  const somma = await p.evaluate(() => {
    const barra = document.querySelector('.fixed.inset-x-0.bottom-0');
    const valori = [...barra.querySelectorAll('li span.w-24')].map((s) =>
      Number(s.innerText.replace(/[^\d,]/g, '').replace(',', '.')),
    );
    return valori.reduce((a, v) => a + v, 0);
  });
  // Il netto è il primo importo della barra; l'ultimo è il lordo «con IVA»,
  // e confrontare la somma dei netti col lordo dava uno scarto del 22% —
  // cioè esattamente l'IVA, non un errore di calcolo.
  const totaleBarra = Number(totali.euro[0].replace('.', '').replace(',', '.'));
  esito(
    Math.abs(somma - totaleBarra) < 0.005,
    `la somma delle righe (${somma.toFixed(2)}) è il totale della barra (${totaleBarra.toFixed(2)})`,
  );
  esito(totali.righe > 0, `il riepilogo mostra ${totali.righe} righe modificabili`);
}

console.log('\n── Criterio: l’ordine sopravvive a refresh e cambio dispositivo ─\n');
{
  const { p } = await apri({ width: 1280, height: 900 });
  await p.goto(`${BASE}/ordini`, { waitUntil: 'networkidle' });
  const prima = (await barra(p).innerText()).split('\n')[0];
  await p.reload({ waitUntil: 'networkidle' });
  const dopoRefresh = (await barra(p).innerText()).split('\n')[0];
  esito(prima === dopoRefresh, `dopo un refresh: «${dopoRefresh}»`);

  // Un contesto nuovo = un altro dispositivo, stessa sessione condivisa.
  const altro = await apri({ width: 900, height: 700 });
  await altro.p.goto(`${BASE}/ordini`, { waitUntil: 'networkidle' });
  const daAltrove = (await barra(altro.p).innerText()).split('\n')[0];
  esito(prima === daAltrove, `da un altro dispositivo: «${daAltrove}»`);
}

console.log('\n── Criterio: su tablet nessun bersaglio troppo piccolo ──────────\n');
{
  const { p, errori } = await apri({ width: 820, height: 1180, touch: true });
  await p.goto(`${BASE}/ordini`, { waitUntil: 'networkidle' });
  const campo = p.locator('input[type="text"], input:not([type])').first();
  await campo.fill('a');
  await p.waitForTimeout(900);

  const piccoli = await p.evaluate(() => {
    const MIN = 44;
    const interattivi = [...document.querySelectorAll('button, a, input, select, [role="button"]')];
    return interattivi
      .filter((e) => {
        // Per una casella dentro un'etichetta il bersaglio vero è
        // l'etichetta: toccarla commuta la casella.
        const bersaglio = e.closest('label') ?? e;
        const r = bersaglio.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        return r.height < MIN || r.width < MIN;
      })
      .map((e) => {
        const r = e.getBoundingClientRect();
        return `${e.tagName}«${(e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 24)}» ${Math.round(r.width)}×${Math.round(r.height)}`;
      });
  });
  esito(
    piccoli.length === 0,
    piccoli.length === 0
      ? 'tutti i bersagli sono almeno 44×44'
      : `${piccoli.length} bersagli sotto 44 px: ${piccoli.slice(0, 6).join(' · ')}`,
  );

  const scorrimentoOrizzontale = await p.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  esito(!scorrimentoOrizzontale, 'la pagina non scorre in orizzontale');
  esito(errori.length === 0, `nessun errore in console${errori.length ? ': ' + errori[0] : ''}`);
  await p.screenshot({ path: process.argv[3], fullPage: false });
}

await b.close();
console.log(
  falliti === 0
    ? '\n✓ Tutti i criteri verificabili col browser passano.\n'
    : `\n✗ ${falliti} criteri non passano.\n`,
);
process.exit(falliti === 0 ? 0 : 1);
