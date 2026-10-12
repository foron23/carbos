import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { preview } from 'vite';
import puppeteer from 'puppeteer';
import { ensureShotsDir, screenshot } from './helpers.mjs';
import { scenarios } from './scenarios.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.E2E_PORT ?? 4173);
const HOST = '127.0.0.1';
const FIREFOX = process.env.CARBOS_FIREFOX || undefined;

const PNG_1PX =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const results = [];

async function main() {
  await ensureShotsDir();
  const tmpDir = join(__dirname, 'tmp');
  await mkdir(tmpDir, { recursive: true });
  const fixturePng = join(tmpDir, 'sample.png');
  await writeFile(fixturePng, Buffer.from(PNG_1PX, 'base64'));

  const server = await preview({
    preview: { port: PORT, strictPort: true, host: HOST },
    logLevel: 'silent',
  });
  const base = `http://${HOST}:${PORT}/`;
  const launchOptions = { browser: 'firefox', headless: true };
  if (FIREFOX) launchOptions.executablePath = FIREFOX;
  const browser = await puppeteer.launch(launchOptions);

  try {
    for (const scenario of scenarios) {
      const page = await browser.newPage();
      await page.setViewport({ width: 430, height: 932, deviceScaleFactor: 2 });
      page.on('dialog', (dialog) => {
        void dialog.accept();
      });
      const ctx = { base, tmpDir, fixturePng };
      const started = Date.now();
      try {
        await scenario.run(page, ctx);
        results.push({ name: scenario.name, ok: true, ms: Date.now() - started });
        console.log(`  PASS  ${scenario.name}`);
      } catch (error) {
        let shot = '(sin captura)';
        try {
          shot = await screenshot(page, `fallo-${scenario.name}`);
        } catch {
          /* ignore */
        }
        results.push({ name: scenario.name, ok: false, ms: Date.now() - started, error, shot });
        console.error(
          `  FAIL  ${scenario.name}\n        ${error.message}\n        captura: ${shot}`,
        );
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
    await server.close();
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\nE2E: ${passed}/${results.length} escenarios en verde`);
  if (passed !== results.length) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
