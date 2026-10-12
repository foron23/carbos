// Capturas de UI para revisar los estados a ojo (onboarding, app, puerta de
// insulina, panel, modo oscuro). No forma parte del gate.
//
//   CARBOS_FIREFOX=/usr/bin/firefox node e2e/shots.mjs
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { preview } from 'vite';
import puppeteer from 'puppeteer';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, 'screenshots', 'uiux');
const PORT = Number(process.env.SHOTS_PORT ?? 4180);
const HOST = '127.0.0.1';
const FIREFOX = process.env.CARBOS_FIREFOX || undefined;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await mkdir(OUT, { recursive: true });
  const server = await preview({
    preview: { port: PORT, strictPort: true, host: HOST },
    logLevel: 'silent',
  });
  const base = `http://${HOST}:${PORT}/`;
  const browser = await puppeteer.launch({
    browser: 'firefox',
    headless: true,
    ...(FIREFOX ? { executablePath: FIREFOX } : {}),
  });

  const shot = async (page, name) => {
    await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true });
    console.log('captura:', name);
  };

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
    page.on('dialog', (dialog) => void dialog.accept());

    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#onboarding', { timeout: 20000 });
    await wait(600);
    await shot(page, '01-onboarding');

    await page.$eval('#onboarding-start', (el) => el.click());
    await wait(400);
    await shot(page, '02-app-light');

    await page.$eval('details:last-of-type', (el) => {
      el.open = true;
    });
    await wait(200);
    await page.$eval('#insulin-toggle', (el) => el.click());
    await wait(400);
    await shot(page, '03-puerta-insulina');

    await page.$eval('#ins-gate-accept', (el) => el.click());
    await wait(400);
    await shot(page, '04-panel-insulina');

    await page.$eval('#register', (el) => el.click());
    await wait(300);
    console.log(
      'aviso de registro vacio:',
      await page.$eval('#register-status', (el) => el.textContent),
    );
    await page.close();
  } finally {
    await browser.close();
    await server.close();
  }

  console.log(`\nCapturas en ${OUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
