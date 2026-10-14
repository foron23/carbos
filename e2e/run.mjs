import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { preview } from 'vite';
import puppeteer from 'puppeteer';
import { ensureShotsDir, screenshot } from './helpers.mjs';
import { scenarios as coreScenarios } from './scenarios.mjs';
import { scenarios as recordsScenarios } from './scenarios-records.mjs';

// El diario editable/quitable vive en su propio fichero (spec 17 toca scenarios.mjs).
const scenarios = [...coreScenarios, ...recordsScenarios];
// Depuracion: E2E_ONLY=<subcadena>[,<subcadena>...] ejecuta solo esos escenarios.
const E2E_ONLY = process.env.E2E_ONLY;
const onlyTerms = E2E_ONLY ? E2E_ONLY.split(',') : [];
const selected = onlyTerms.length
  ? scenarios.filter((s) => onlyTerms.some((term) => s.name.includes(term)))
  : scenarios;

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.E2E_PORT ?? 4173);
const HOST = '127.0.0.1';
const FIREFOX = process.env.CARBOS_FIREFOX || undefined;

const PNG_1PX =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/** Marca unica que se inyecta en los metadatos de la imagen de origen. */
const META_MARKER = 'CARBOS_GPS_41.3902_2.1656_EXIF';

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Inserta un chunk `tEXt` (metadatos) antes del IEND. El canvas de la app no lo
 * conserva: es la prueba de que el recorte sale limpio (spec 15, criterio 4).
 */
function pngWithTextChunk(png, keyword, text) {
  const type = Buffer.from('tEXt', 'latin1');
  const data = Buffer.concat([Buffer.from(`${keyword}\0`, 'latin1'), Buffer.from(text, 'latin1')]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([type, data])), 0);
  const chunk = Buffer.concat([length, type, data, crc]);
  const iend = png.subarray(png.length - 12);
  return Buffer.concat([png.subarray(0, png.length - 12), chunk, iend]);
}

const results = [];

async function main() {
  await ensureShotsDir();
  const tmpDir = join(__dirname, 'tmp');
  await mkdir(tmpDir, { recursive: true });
  const fixturePng = join(tmpDir, 'sample.png');
  await writeFile(fixturePng, Buffer.from(PNG_1PX, 'base64'));
  const fixtureMetaPng = join(tmpDir, 'sample-meta.png');
  await writeFile(
    fixtureMetaPng,
    pngWithTextChunk(Buffer.from(PNG_1PX, 'base64'), 'Comment', META_MARKER),
  );

  const server = await preview({
    preview: { port: PORT, strictPort: true, host: HOST },
    logLevel: 'silent',
  });
  const base = `http://${HOST}:${PORT}/`;

  // Receptor de contribuciones para el E2E de subida: guarda los POST crudos.
  const received = [];
  const receiver = createServer((req, res) => {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      Vary: 'Origin',
    };
    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors);
      res.end();
      return;
    }
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      received.push({ method: req.method, headers: req.headers, body: Buffer.concat(chunks) });
      res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, id: 'e2e', key: 'contrib/e2e.zip' }));
    });
  });
  await new Promise((resolve) => receiver.listen(0, HOST, resolve));
  const receiverUrl = `http://${HOST}:${receiver.address().port}/api/contrib`;

  const launchOptions = { browser: 'firefox', headless: true };
  if (FIREFOX) launchOptions.executablePath = FIREFOX;
  const browser = await puppeteer.launch(launchOptions);

  try {
    for (const scenario of selected) {
      const page = await browser.newPage();
      // Viewport por defecto 430x932; un escenario puede fijar el suyo propio
      // (p.ej. 390x844 para el umbral de 3 entradas o 1280x800 para el rail).
      await page.setViewport(
        scenario.viewport ?? { width: 430, height: 932, deviceScaleFactor: 2 },
      );
      page.on('dialog', (dialog) => {
        void dialog.accept();
      });
      const ctx = {
        base,
        tmpDir,
        fixturePng,
        fixtureMetaPng,
        metaMarker: META_MARKER,
        receiverUrl,
        received,
      };
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
    await new Promise((resolve) => receiver.close(resolve));
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\nE2E: ${passed}/${results.length} escenarios en verde`);
  if (passed !== results.length) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
