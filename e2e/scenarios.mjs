import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import {
  assert,
  assertEqual,
  captureDownload,
  clearDatabase,
  click,
  readContributions,
  readStore,
  reload,
  screenshot,
  setValue,
  text,
  unregisterServiceWorkers,
  uploadFile,
  waitFor,
  waitForContributionCount,
  waitForText,
} from './helpers.mjs';

async function openApp(page, base) {
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await unregisterServiceWorkers(page);
  await clearDatabase(page);
  await page.evaluate(() => localStorage.setItem('carbos.locale', 'es'));
  await reload(page);
  await waitFor(page, '#app header h1');
}

async function addFood(page, query, resultIndex = 0) {
  await switchEntryMode(page, '#entry-mode-search');
  await setValue(page, '#food-search', query);
  await page.waitForSelector('#search-results button.result', { timeout: 8000 });
  await page.evaluate((index) => {
    const buttons = document.querySelectorAll('#search-results button.result');
    buttons[index]?.click();
  }, resultIndex);
  await page.waitForSelector('#draft-items .draft-row', { timeout: 8000 });
}

/** Conmuta la superficie unica Foto | Buscar (A2) y espera el cambio de panel. */
async function switchEntryMode(page, selector) {
  await page.$eval(selector, (el) => {
    el.checked = true;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForFunction(
    (photoMode) => document.querySelector('#photo-panel').hidden !== photoMode,
    { timeout: 8000 },
    selector === '#entry-mode-photo',
  );
}

/**
 * El borrador (`#draft-items`), su total y el boton Registrar viven dentro de la
 * tarjeta `#entry` y son visibles con independencia del modo conmutado (A3).
 */
async function assertUnifiedEntry(page) {
  const inside = await page.$$eval('#draft-items, #register, #draft-total', (nodes) =>
    nodes.every((node) => Boolean(node.closest('#entry'))),
  );
  assert(inside, 'el borrador, su total y Registrar viven en #entry');
  const visible = await page.$$eval('#draft-items, #register, #draft-total', (nodes) =>
    nodes.every((node) => !node.hidden && node.getClientRects().length > 0),
  );
  assert(visible, 'el borrador, su total y Registrar son visibles');
}

async function register(page) {
  await click(page, '#register');
}

const DEFAULT_DETECTION = [
  {
    box: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 },
    score: 0.9,
    label: 'pan blanco',
    classId: 'pan_blanco',
    topk: [{ label: 'pan blanco', classId: 'pan_blanco', p: 0.9 }],
  },
];

/**
 * Instala el hook E2E de deteccion (mismo patron que __carbosChatStub): una o
 * varias detecciones sinteticas con clase del catalogo y caja normalizada, para
 * ejercitar el flujo sin depender de los pesos.
 */
async function installDetectionStub(page, results = DEFAULT_DETECTION) {
  await page.evaluateOnNewDocument((injected) => {
    globalThis.__carbosDetectionStub = {
      detect: () =>
        Promise.resolve({
          results: injected,
          engine: 'stub',
          detector: 'stub',
          classifier: 'stub',
        }),
      dispose: () => {},
    };
  }, results);
}

/**
 * Instala el hook E2E del codigo de barras (mismo patron que __carbosDetectionStub):
 * un decodificador sintetico que devuelve siempre el EAN dado, para ejercitar el
 * flujo sin camara ni BarcodeDetector (Firefox).
 */
async function installBarcodeStub(page, ean = '4006381333931') {
  await page.evaluateOnNewDocument((code) => {
    globalThis.__carbosBarcodeStub = { decode: () => Promise.resolve(code) };
  }, ean);
}

/**
 * Instala el hook E2E de red del codigo de barras (mismo patron que
 * `__carbosBarcodeStub`): sirve el manifest de packs, el pack (gzip) y una
 * respuesta de Open Food Facts v3 sin tocar la red real. Permite ejercitar la
 * descarga automatizada y la resolucion en linea en Firefox.
 */
async function installBarcodeFetchStub(page, fixtures) {
  await page.evaluateOnNewDocument((data) => {
    const packBytes = Uint8Array.from(atob(data.packBase64), (c) => c.charCodeAt(0));
    globalThis.__carbosBarcodeFetch = async (url) => {
      if (url.includes('barcode-manifest.json')) {
        return new Response(JSON.stringify(data.manifest), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === data.packUrl) {
        return new Response(packBytes, {
          status: 200,
          headers: { 'content-length': String(packBytes.byteLength) },
        });
      }
      if (url.includes('openfoodfacts.org')) {
        return new Response(JSON.stringify(data.off), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response('', { status: 404 });
    };
  }, fixtures);
}

async function uploadAndDetect(page, fixture) {
  // El input conserva el fichero anterior: hay que vaciarlo para que un segundo
  // disparo con el mismo fichero vuelva a emitir `change`.
  await page.$eval('#file-input', (el) => {
    el.value = '';
  });
  await uploadFile(page, '#file-input', fixture);
  await page.waitForSelector('#share-photo:not([hidden])', { timeout: 10000 });
}

/** `true` si el JPEG tiene un segmento APP1 con firma Exif (EXIF/GPS). */
function hasExifApp1(bytes) {
  if (!(bytes[0] === 0xff && bytes[1] === 0xd8)) return false;
  let i = 2;
  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) return false;
    const marker = bytes[i + 1];
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    if (marker === 0xda || marker === 0xd9) return false;
    const length = (bytes[i + 2] << 8) | bytes[i + 3];
    if (marker === 0xe1) {
      const sig = String.fromCharCode(
        bytes[i + 4],
        bytes[i + 5],
        bytes[i + 6],
        bytes[i + 7],
        bytes[i + 8],
        bytes[i + 9],
      );
      if (sig === 'Exif\0\0') return true;
    }
    i += 2 + length;
  }
  return false;
}

/** `true` si la secuencia ASCII `text` aparece en `bytes`. */
function containsAscii(bytes, text) {
  const needle = Array.from(text, (char) => char.charCodeAt(0));
  outer: for (let i = 0; i + needle.length <= bytes.length; i += 1) {
    for (let j = 0; j < needle.length; j += 1) {
      if (bytes[i + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
}

export const scenarios = [
  {
    name: 'carga la PWA en espanol',
    async run(page, ctx) {
      await page.evaluateOnNewDocument(() => localStorage.setItem('carbos.locale', 'es'));
      await page.goto(ctx.base, { waitUntil: 'domcontentloaded' });
      await waitFor(page, '#app header h1');
      assertEqual(await text(page, '#app header h1'), 'Carbos', 'titulo visible');
      assertEqual(await page.$eval('html', (el) => el.lang), 'es', 'idioma por defecto');
      await screenshot(page, 'carga');
    },
  },
  {
    name: 'anade un alimento del catalogo con porcion por defecto',
    async run(page, ctx) {
      await openApp(page, ctx.base);
      await addFood(page, 'manzana');
      const draftText = await text(page, '#draft-items');
      assert(draftText.includes('Manzana'), 'el borrador muestra Manzana');
      const total = await text(page, '#draft-total');
      assert(parseFloat(total) > 0, 'el total del borrador es positivo');
      await register(page);
      await waitForText(page, '#diary', 'Manzana');
      const meals = await readStore(page, 'meals');
      assertEqual(meals.length, 1, 'una comida en IndexedDB');
      assertEqual(meals[0]?.origin, 'manual', 'origen manual');
      assert(parseFloat(await text(page, '#day-total')) > 0, 'total del dia positivo');
      await screenshot(page, 'catalogo-porcion');
    },
  },
  {
    name: 'ajusta los gramos antes de registrar',
    async run(page, ctx) {
      await openApp(page, ctx.base);
      await addFood(page, 'manzana');
      await page.$eval('#draft-items input[type="number"]', (el) => {
        el.value = '100';
        el.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await register(page);
      await waitForText(page, '#diary', '100 g');
      const meals = await readStore(page, 'meals');
      assertEqual(meals[0]?.items[0]?.grams, 100, 'gramos ajustados guardados');
      await screenshot(page, 'ajuste-gramos');
    },
  },
  {
    name: 'corrige la cantidad con atajos y porciones',
    async run(page, ctx) {
      await openApp(page, ctx.base);
      await addFood(page, 'manzana');
      const grams = () => page.$eval('#draft-items input[type="number"]', (el) => Number(el.value));
      const initial = await grams();
      assert(initial > 1, 'la porcion por defecto es mayor que 1 g');

      await click(page, '.draft-shortcuts button:nth-child(2)');
      const doubled = await grams();
      assert(doubled > initial && doubled >= 1, 'doble aumenta la cantidad');

      await click(page, '.draft-shortcuts button:nth-child(1)');
      const halved = await grams();
      assert(halved >= 1 && halved < doubled, 'mitad reduce la cantidad');

      await click(page, '.draft-portions button:nth-child(1)');
      const small = await grams();
      assert(small >= 1 && small < halved, 'pequeno queda por debajo de la cantidad');

      await click(page, '.draft-portions button:nth-child(3)');
      const large = await grams();
      assert(large > small && large >= 1, 'grande supera a pequeno');

      await click(page, '.draft-portions button:nth-child(2)');
      const medium = await grams();
      assert(medium >= 1, 'mediano conserva la cantidad');

      if (await page.$('#detect-results select')) {
        await waitFor(page, '#draft-items .detect-alt');
      }

      await screenshot(page, 'atajos-porciones');
    },
  },
  {
    name: 'captura una foto sin salir del dispositivo',
    async run(page, ctx) {
      await openApp(page, ctx.base);

      const manifest = await page.evaluate(async (base) => {
        const res = await fetch(`${base}model-manifest.json`);
        return res.json();
      }, ctx.base);
      const declared = new Set();
      for (const entry of Object.values(manifest ?? {})) {
        if (entry && typeof entry === 'object' && typeof entry.url === 'string') {
          declared.add(entry.url);
        }
      }
      assert(declared.size > 0, 'el manifest declara los pesos del modelo');

      const external = [];
      page.on('request', (request) => {
        const url = request.url();
        if (url.startsWith(ctx.base) || url.startsWith('data:') || url.startsWith('blob:')) return;
        if (declared.has(url)) return;
        external.push(url);
      });
      await uploadFile(page, '#file-input', ctx.fixturePng);
      await page.waitForFunction(
        () => {
          const el = document.querySelector('#photo-status');
          const value = el?.textContent ?? '';
          return value.includes('no disponible') || value.includes('detectad');
        },
        { timeout: 10000 },
      );
      const hidden = await page.$eval('#photo-preview', (el) => el.hidden);
      assertEqual(hidden, false, 'la previsualizacion es visible');
      assertEqual(
        external.length,
        0,
        `sin peticiones externas fuera del manifest (${external.join(', ')})`,
      );
      await screenshot(page, 'foto');
    },
  },
  {
    name: 'registra la semana a partir del dia actual',
    async run(page, ctx) {
      await openApp(page, ctx.base);
      await addFood(page, 'pan');
      await register(page);
      await waitForText(page, '#diary', 'Pan');
      const day = parseFloat(await text(page, '#day-total'));
      const week = parseFloat(await text(page, '#week-total'));
      assert(day > 0 && week >= day, 'la semana cubre al menos el dia');
      assert(Number.isFinite(week), 'el total semanal es numerico');
      const bars = await page.$$eval('#week-bars .week-day', (nodes) => nodes.length);
      assertEqual(bars, 7, 'siete barras de dia');
      const active = await page.$$eval(
        '#week-bars .week-day[data-active]',
        (nodes) => nodes.length,
      );
      assertEqual(active, 1, 'un solo dia activo');
      await screenshot(page, 'semana');
    },
  },
  {
    name: 'recuerda el dia al recargar y conserva la comida',
    async run(page, ctx) {
      await openApp(page, ctx.base);
      await click(page, '#day-today');
      await click(page, '#day-prev');
      const selected = await page.$eval('#date', (el) => el.value);
      await addFood(page, 'pan');
      await register(page);
      await waitForText(page, '#diary', 'Pan');
      await reload(page);
      await waitFor(page, '#app header h1');
      await waitForText(page, '#diary', 'Pan');
      assertEqual(
        await page.$eval('#date', (el) => el.value),
        selected,
        'el dia seleccionado se conserva tras recargar',
      );
      const meals = await readStore(page, 'meals');
      assertEqual(meals.length, 1, 'la comida sigue guardada');
      assertEqual(meals[0]?.date, selected, 'la comida conserva su fecha');
      await screenshot(page, 'dia-recordado');
    },
  },
  {
    name: 'registra insulina sin calcular nada',
    async run(page, ctx) {
      await openApp(page, ctx.base);
      await setValue(page, '#ins-time', '08:30');
      await setValue(page, '#ins-units', '4');
      await click(page, '#add-insulin');
      await waitForText(page, '#diary', '08:30');
      const logs = await readStore(page, 'insulin');
      assertEqual(logs.length, 1, 'un registro de insulina');
      assertEqual(logs[0]?.units, 4, 'unidades tal cual');
      await screenshot(page, 'insulina');
    },
  },
  {
    name: 'edita la hora de una comida y la conserva al recargar',
    async run(page, ctx) {
      await openApp(page, ctx.base);
      await addFood(page, 'pan');
      await register(page);
      await waitForText(page, '#diary', 'Pan');
      await page.$eval('#diary input[type="time"]', (el) => {
        el.value = '07:15';
        el.dispatchEvent(new Event('change', { bubbles: true }));
      });
      for (let i = 0; i < 60; i += 1) {
        const meals = await readStore(page, 'meals');
        if (meals[0]?.time === '07:15') break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      await reload(page);
      await waitFor(page, '#app header h1');
      await waitForText(page, '#diary', 'Pan');
      const value = await page.$eval('#diary input[type="time"]', (el) => el.value);
      assertEqual(value, '07:15', 'la hora editada persiste tras recargar');
      const meals = await readStore(page, 'meals');
      assertEqual(meals[0]?.time, '07:15', 'la hora guardada es la editada');
      await screenshot(page, 'hora-editada');
    },
  },
  {
    name: 'ordena comidas e insulina en una sola linea de tiempo',
    async run(page, ctx) {
      await openApp(page, ctx.base);
      await addFood(page, 'pan');
      await register(page);
      await waitForText(page, '#diary', 'Pan');
      await page.$eval('#diary input[type="time"]', (el) => {
        el.value = '09:00';
        el.dispatchEvent(new Event('change', { bubbles: true }));
      });
      for (let i = 0; i < 60; i += 1) {
        const meals = await readStore(page, 'meals');
        if (meals[0]?.time === '09:00') break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      await setValue(page, '#ins-time', '08:30');
      await setValue(page, '#ins-units', '4');
      await click(page, '#add-insulin');
      await waitForText(page, '#diary', '08:30');
      const kinds = await page.$$eval('#diary .timeline-row', (rows) =>
        rows.map((row) => (row.querySelector('input[type="time"]') ? 'meal' : 'insulin')),
      );
      assertEqual(kinds.join(','), 'insulin,meal', 'la insulina anterior precede a la comida');
      await screenshot(page, 'linea-tiempo');
    },
  },
  {
    name: 'exporta a JSON e importa de vuelta',
    async run(page, ctx) {
      await openApp(page, ctx.base);
      await addFood(page, 'manzana');
      await register(page);
      await waitForText(page, '#diary', 'Manzana');
      const download = await captureDownload(page, '#export');
      assert(download, 'se dispara la descarga');
      const parsed = JSON.parse(download.body);
      assertEqual(parsed.version, 3, 'version de esquema en el export');
      assertEqual(parsed.meals.length, 1, 'el export lleva la comida');
      const file = join(ctx.tmpDir, 'plain.json');
      await writeFile(file, download.body, 'utf8');
      await openApp(page, ctx.base);
      await uploadFile(page, '#import', file);
      await waitForText(page, '#diary', 'Manzana');
      const meals = await readStore(page, 'meals');
      assertEqual(meals.length, 1, 'comida restaurada desde el import');
      await screenshot(page, 'export-import');
    },
  },
  {
    name: 'export cifrado e import con contrasena',
    async run(page, ctx) {
      await page.evaluateOnNewDocument(() => {
        window.prompt = () => 'secreto';
      });
      await openApp(page, ctx.base);
      await addFood(page, 'pan');
      await register(page);
      await waitForText(page, '#diary', 'Pan');
      await setValue(page, '#export-pass', 'secreto');
      const download = await captureDownload(page, '#export-enc');
      assert(download, 'se dispara la descarga cifrada');
      const envelope = JSON.parse(download.body);
      assertEqual(envelope.format, 'carbos-enc', 'sobre cifrado');
      assertEqual(envelope.kdf.name, 'argon2id', 'KDF argon2id');
      const file = join(ctx.tmpDir, 'cifrado.carbos');
      await writeFile(file, download.body, 'utf8');
      await openApp(page, ctx.base);
      await uploadFile(page, '#import', file);
      await waitForText(page, '#diary', 'Pan');
      const meals = await readStore(page, 'meals');
      assertEqual(meals.length, 1, 'comida restaurada desde el export cifrado');
      await screenshot(page, 'export-cifrado');
    },
  },
  {
    name: 'cambia de idioma sin dejar cadenas sueltas',
    async run(page, ctx) {
      await openApp(page, ctx.base);
      await setValue(page, '#locale', 'en');
      await waitForText(page, 'header p', 'Count carbs');
      assertEqual(await text(page, 'header h1'), 'Carbos', 'el nombre no se traduce');
      assertEqual(
        await page.$eval('#app [data-i18n="section.addFood"]', (el) => el.textContent),
        'Add food',
        'los textos se traducen',
      );
      assertEqual(await page.title(), 'Carbos · carbs on your device', 'el titulo sigue al idioma');
      assertEqual(
        await page.$eval('link[rel="manifest"]', (el) => el.getAttribute('href')),
        './manifest.en.webmanifest',
        'el manifest sigue al idioma',
      );

      await setValue(page, '#locale', 'es');
      await waitForText(page, 'header p', 'Cuenta carbohidratos');
      assertEqual(
        await page.title(),
        'Carbos · carbohidratos en tu dispositivo',
        'el titulo vuelve al castellano',
      );

      for (const tag of ['es', 'en']) {
        await setValue(page, '#locale', tag);
        await page.waitForFunction((lang) => document.documentElement.lang === lang, {}, tag);
        const sinTraducir = await page.$$eval('#app [data-i18n]', (nodes) =>
          nodes
            .filter((node) => (node.textContent ?? '').trim() === '')
            .map((node) => node.getAttribute('data-i18n') ?? ''),
        );
        assertEqual(sinTraducir.length, 0, `cadenas sin traducir en ${tag}: ${sinTraducir}`);
      }
      // El modulo de insulina tambien sigue al idioma (fallo reportado).
      await page.$$eval('details', (nodes) => nodes.forEach((node) => (node.open = true)));
      await page.$eval('#insulin-toggle', (el) => el.click());
      await page.waitForSelector('#ins-gate-accept', { timeout: 8000 });
      await setValue(page, '#locale', 'es');
      await waitForText(page, '#ins-gate-accept', 'Entiendo y la activo');
      await setValue(page, '#locale', 'en');
      await waitForText(page, '#ins-gate-accept', 'I understand, enable it');
      await setValue(page, '#locale', 'es');
      await waitForText(page, '#ins-gate-accept', 'Entiendo y la activo');
      const gateSinTraducir = await page.$$eval(
        '#insulin-host [data-i18n]',
        (nodes) => nodes.filter((node) => (node.textContent ?? '').trim() === '').length,
      );
      assertEqual(gateSinTraducir, 0, 'la puerta de insulina sin cadenas vacias');

      await screenshot(page, 'idioma');
    },
  },
  {
    name: 'el chat propone una comida y no escribe hasta confirmar',
    async run(page, ctx) {
      await page.evaluateOnNewDocument(() => {
        localStorage.setItem('carbos.chat.enabled', 'true');
        window.__carbosChatStub = {
          available: true,
          client: {
            ready: Promise.resolve(),
            chat: () =>
              Promise.resolve({
                text: '{"action":"log_meal","items":[{"query":"pan blanco","grams":100}]}',
                model: 'stub',
              }),
            dispose: () => {},
          },
        };
      });
      await openApp(page, ctx.base);
      await page.$eval('#settings', (el) => {
        el.open = true;
      });
      await waitFor(page, '#chat-input');
      await setValue(page, '#chat-input', 'cien gramos de pan blanco');
      await click(page, '#chat-send');
      await waitFor(page, '#chat-confirm');
      assertEqual(
        await page.$eval('#chat-card', (el) => el.hidden),
        false,
        'la tarjeta de confirmacion aparece',
      );
      const beforeMeals = await readStore(page, 'meals');
      const beforeInsulin = await readStore(page, 'insulin');
      assertEqual(beforeMeals.length, 0, 'sin comidas antes de confirmar');
      assertEqual(beforeInsulin.length, 0, 'sin insulina antes de confirmar');
      await click(page, '#chat-confirm');
      await waitForText(page, '#diary', 'Pan blanco');
      const meals = await readStore(page, 'meals');
      assertEqual(meals.length, 1, 'una comida escrita tras confirmar');
      assertEqual(meals[0]?.origin, 'manual', 'origen manual confirmado');
      await screenshot(page, 'chat-confirmacion');
    },
  },
  {
    name: 'instala la PWA y sirve offline tras la primera carga',
    async run(page, ctx) {
      await page.evaluateOnNewDocument(() => localStorage.setItem('carbos.locale', 'es'));
      await page.goto(ctx.base, { waitUntil: 'load' });
      await waitFor(page, '#app header h1');
      await reload(page);
      await waitFor(page, '#app header h1');
      const controlled = await page.evaluate(async () => {
        if (!('serviceWorker' in navigator)) return false;
        await navigator.serviceWorker.ready;
        return Boolean(navigator.serviceWorker.controller);
      });
      assert(controlled, 'el service worker controla la pagina');
      const manifest = await page.$eval('link[rel="manifest"]', (el) => el.getAttribute('href'));
      assert(Boolean(manifest && manifest.includes('manifest')), 'manifest enlazado');

      let offlineSupported = true;
      try {
        await page.setOfflineMode(true);
      } catch {
        offlineSupported = false;
      }
      if (offlineSupported) {
        await reload(page);
        await waitFor(page, '#app header h1');
        assertEqual(await text(page, '#app header h1'), 'Carbos', 'la app carga sin red');
        await page.setOfflineMode(false);
      }
      await screenshot(page, 'pwa-offline');
    },
  },
  {
    name: 'comparte recortes sin EXIF solo con consentimiento',
    async run(page, ctx) {
      await installDetectionStub(page);
      await openApp(page, ctx.base);
      // El receptor local evita tocar el endpoint de produccion al compartir.
      await page.evaluate(
        (url) => localStorage.setItem('carbos.contrib.endpoint', url),
        ctx.receiverUrl,
      );

      assertEqual(
        await page.$eval('#contrib-toggle', (el) => el.checked),
        false,
        'el toggle global esta apagado por defecto',
      );

      // (1) Con el toggle apagado, registrar una foto NO encola nada.
      await uploadAndDetect(page, ctx.fixtureMetaPng);
      await register(page);
      await waitForText(page, '#diary', 'Pan blanco');
      await waitForContributionCount(page, 0);
      assertEqual((await readContributions(page)).length, 0, 'toggle apagado: registrar no encola');

      // (1) Solo el boton "compartir esta foto" encola (toggle sigue apagado).
      await uploadAndDetect(page, ctx.fixtureMetaPng);
      await click(page, '#share-photo');
      await waitForContributionCount(page, 1);
      const shared = (await readContributions(page))[0];
      assertEqual(shared.classId, 'pan_blanco', 'se encola la clase confirmada');
      assert(
        shared.status === 'pending' || shared.status === 'sent',
        `el recorte se encola (estado ${shared.status})`,
      );

      // (4) El recorte es JPEG valido y no arrastra los metadatos del origen.
      assertEqual(shared.type, 'image/jpeg', 'el blob es JPEG');
      assert(
        shared.bytes[0] === 0xff && shared.bytes[1] === 0xd8 && shared.bytes[2] === 0xff,
        'cabecera JPEG (ff d8 ff)',
      );
      assert(shared.size > 0, 'el recorte no esta vacio');
      assert(!hasExifApp1(shared.bytes), 'el recorte no tiene segmento APP1 EXIF/GPS');
      assert(
        !containsAscii(shared.bytes, ctx.metaMarker),
        'no sobrevive la marca de metadatos de la imagen de origen',
      );

      // (2) Con el toggle encendido, registrar una foto encola los recortes.
      await page.$eval('#contrib-toggle', (el) => {
        el.checked = true;
        el.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await uploadAndDetect(page, ctx.fixtureMetaPng);
      await register(page);
      await waitForContributionCount(page, 2);
      assertEqual((await readContributions(page)).length, 2, 'toggle encendido: registrar encola');

      // (5) Desactivar el toggle no borra lo encolado; el borrado es manual.
      await page.$eval('#contrib-toggle', (el) => {
        el.checked = false;
        el.dispatchEvent(new Event('change', { bubbles: true }));
      });
      assertEqual((await readContributions(page)).length, 2, 'desactivar no borra la cola');
      await click(page, '#contrib-clear');
      await waitForContributionCount(page, 0);
      assertEqual((await readContributions(page)).length, 0, 'la cola se borra a mano');
      await screenshot(page, 'contribuciones-consentimiento');
    },
  },
  {
    name: 'sube el bundle v1 al endpoint con fetch y sin duplicar',
    async run(page, ctx) {
      await installDetectionStub(page);
      await openApp(page, ctx.base);
      ctx.received.length = 0;
      await page.evaluate(
        (url) => localStorage.setItem('carbos.contrib.endpoint', url),
        ctx.receiverUrl,
      );

      await uploadAndDetect(page, ctx.fixtureMetaPng);
      await click(page, '#share-photo');
      // Compartir sube de inmediato, sin esperar a un evento "online".
      for (let i = 0; i < 120 && ctx.received.length === 0; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      assertEqual(ctx.received.length, 1, 'un unico POST por lote');
      await waitForText(page, '#share-status', 'Compartido');
      const post = ctx.received[0];
      assertEqual(post.method, 'POST', 'metodo POST');
      assertEqual(post.headers['content-type'], 'application/zip', 'Content-Type application/zip');
      assertEqual(post.body.subarray(0, 2).toString('latin1'), 'PK', 'el cuerpo es un zip');
      assert(post.body.includes(Buffer.from('consent.json')), 'el zip lleva consent.json');
      assert(post.body.includes(Buffer.from('pan_blanco')), 'el zip lleva la clase confirmada');

      let status = '';
      for (let i = 0; i < 60; i += 1) {
        status = (await readContributions(page))[0]?.status ?? '';
        if (status === 'sent') break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      assertEqual(status, 'sent', 'el item pasa a sent tras el 2xx');

      // Un segundo disparo no reenvia lo ya enviado (sin duplicar).
      await page.evaluate(() => window.dispatchEvent(new Event('online')));
      await new Promise((resolve) => setTimeout(resolve, 400));
      assertEqual(ctx.received.length, 1, 'no se reenvia lo ya marcado como sent');
      await screenshot(page, 'contribuciones-subida');
    },
  },
  {
    name: 'deduplica detecciones repetidas y guia la porcion por la caja',
    async run(page, ctx) {
      await installDetectionStub(page, [
        {
          box: { x: 0, y: 0, w: 0.8, h: 0.8 },
          score: 0.9,
          label: 'pan blanco',
          classId: 'pan_blanco',
          topk: [{ label: 'pan blanco', classId: 'pan_blanco', p: 0.9 }],
        },
        {
          box: { x: 0.3, y: 0.3, w: 0.4, h: 0.4 },
          score: 0.5,
          label: 'pan blanco',
          classId: 'pan_blanco',
          topk: [{ label: 'pan blanco', classId: 'pan_blanco', p: 0.5 }],
        },
        {
          box: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
          score: 0.4,
          label: 'apple',
          classId: 'manzana',
          topk: [{ label: 'apple', classId: 'manzana', p: 0.4 }],
        },
      ]);
      await openApp(page, ctx.base);
      await uploadAndDetect(page, ctx.fixturePng);

      const rows = await page.$$eval('#detect-results .draft-row', (nodes) => nodes.length);
      assertEqual(rows, 2, 'el pan repetido se une en una sola deteccion');
      const draft = await page.$$eval('#draft-items .draft-row .draft-name', (nodes) =>
        nodes.map((node) => (node.textContent ?? '').trim()),
      );
      assertEqual(draft.length, 2, 'dos alimentos en el borrador');

      const boxes = await page.$$eval('#detect-overlay .detect-box', (nodes) => nodes.length);
      assertEqual(boxes, 2, 'se dibuja un contorno por alimento');
      const labels = await page.$$eval('#detect-overlay .detect-box-label', (nodes) =>
        nodes.map((node) => (node.textContent ?? '').trim()),
      );
      assert(
        labels.some((text) => text.includes('Pan blanco') && /\d+ g/.test(text)),
        `la etiqueta lleva nombre y gramos: ${labels.join(' | ')}`,
      );

      const gramsLarge = await page.$eval(
        '#draft-items .draft-row:nth-child(1) input[type="number"]',
        (el) => Number(el.value),
      );
      await click(page, '#draft-items .draft-row:nth-child(1) .draft-portions button:nth-child(2)');
      const gramsMedium = await page.$eval(
        '#draft-items .draft-row:nth-child(1) input[type="number"]',
        (el) => Number(el.value),
      );
      assertEqual(gramsMedium, 60, 'mediano coincide con la porcion por defecto del catalogo');
      assert(gramsLarge > gramsMedium, 'una caja grande sugiere mas porcion que mediano');
      await screenshot(page, 'deteccion-dedupe-porcion');
    },
  },
  {
    name: 'escanea un codigo de barras y prellena el borrador',
    async run(page, ctx) {
      const ean = '4006381333931';
      await installBarcodeStub(page, ean);
      await openApp(page, ctx.base);
      await page.$eval('#entry-mode-barcode', (el) => {
        el.checked = true;
        el.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await waitFor(page, '#barcode-panel:not([hidden]) #barcode-scan');

      // Boton principal "Escanear" (escaneo en vivo via stub): prellena el EAN.
      await click(page, '#barcode-scan');
      await waitForText(page, '#draft-items', ean);
      assert(
        (await text(page, '#draft-items')).includes(ean),
        'el escaneo con el stub prellena el EAN',
      );

      // Camino manual (en "Mas opciones"): escribir el EAN prellena otro item.
      await page.$eval('#barcode-panel details', (el) => {
        el.open = true;
      });
      await setValue(page, '#barcode-manual', ean);
      await click(page, '#barcode-manual-go');
      await page.waitForFunction(
        () => document.querySelectorAll('#draft-items .draft-row').length === 2,
        { timeout: 8000 },
      );
      const rows = await page.$$eval('#draft-items .draft-row .draft-name', (nodes) =>
        nodes.map((node) => (node.textContent ?? '').trim()),
      );
      assertEqual(rows.length, 2, 'dos items prellenados con el codigo');
      assert(
        rows.every((name) => name === ean),
        `los items llevan el EAN: ${rows.join(' | ')}`,
      );
      await screenshot(page, 'codigo-barras');
    },
  },
  {
    name: 'descarga el pack y resuelve en linea solo si se activa',
    async run(page, ctx) {
      const packBarcode = '4006381333931';
      const onlineEan = '5901234123457';
      const packLine =
        JSON.stringify({
          barcode: packBarcode,
          name: { es: 'Producto de pack', en: 'Pack product' },
          carbsPer100g: 42,
          source: 'test',
          savedAt: 0,
        }) + '\n';
      const packGz = gzipSync(Buffer.from(packLine, 'utf8'), { mtime: 0 });
      const sha256 = createHash('sha256').update(packGz).digest('hex');
      const packUrl = 'https://packs.test/es.jsonl.gz';
      const manifest = {
        format: 'carbos-barcode-packs',
        version: 1,
        packs: [
          {
            id: 'es',
            locale: 'es',
            url: packUrl,
            sha256,
            bytes: packGz.byteLength,
            product_count: 1,
            generated_at: '2026-01-01T00:00:00Z',
          },
        ],
      };
      const off = {
        status: 'success',
        product: {
          code: onlineEan,
          product_name_es: 'Producto en linea',
          product_name_en: 'Online product',
          brands: 'Marca',
          nutrition_data_per: '100g',
          nutriments: { carbohydrates_100g: 10 },
        },
      };
      await installBarcodeFetchStub(page, {
        manifest,
        packUrl,
        packBase64: packGz.toString('base64'),
        off,
      });
      await openApp(page, ctx.base);
      await page.$eval('#entry-mode-barcode', (el) => {
        el.checked = true;
        el.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await waitFor(page, '#barcode-panel:not([hidden]) #barcode-scan');
      // El pack/manual/online viven en "Mas opciones" (details): abrirlo.
      await page.$eval('#barcode-panel details', (el) => {
        el.open = true;
      });

      // 1) Descarga automatizada (manifest -> sha256 -> IndexedDB), sigue offline.
      await click(page, '#barcode-download');
      await waitForText(page, '#barcode-status', 'Pack descargado');
      const imported = await readStore(page, 'products');
      assertEqual(imported.length, 1, 'el pack descargado importa un producto');
      assertEqual(imported[0]?.barcode, packBarcode, 'el producto del pack queda en el store');

      // 2) Con el pack local, un EAN del pack resuelve sin red.
      await setValue(page, '#barcode-manual', packBarcode);
      await click(page, '#barcode-manual-go');
      await waitForText(page, '#draft-items', 'Producto de pack');

      // 3) El aviso de que "sale del dispositivo" esta presente.
      const host = await text(page, '#barcode-panel');
      assert(
        host.includes('sale de tu dispositivo'),
        'el aviso de resolucion en linea esta presente',
      );

      // 4) Opt-in en linea: un EAN fuera del pack consulta (stub) y cachea.
      await page.$eval('#barcode-online', (el) => {
        el.checked = true;
        el.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await setValue(page, '#barcode-manual', onlineEan);
      await click(page, '#barcode-manual-go');
      await waitForText(page, '#draft-items', 'Producto en linea');
      const products = await readStore(page, 'products');
      assertEqual(products.length, 2, 'la resolucion en linea cachea el producto');
      await screenshot(page, 'codigo-barras-online');
    },
  },
  {
    name: 'la primera apertura es un dialogo con fondo inert',
    async run(page, ctx) {
      await page.goto(ctx.base, { waitUntil: 'domcontentloaded' });
      await page.evaluate(() => {
        localStorage.removeItem('carbos.onboarded');
        localStorage.setItem('carbos.locale', 'es');
      });
      await reload(page);
      await waitFor(page, '#onboarding:not([hidden])');
      await page.waitForFunction(() => document.activeElement?.id === 'onboarding-start', {
        timeout: 8000,
      });
      assertEqual(
        await page.$eval('#onboarding', (el) => el.getAttribute('role')),
        'dialog',
        'el onboarding es un dialogo',
      );
      const inertBackground = await page.$$eval(
        '#app > header, #app > main, #app > footer',
        (nodes) => nodes.length === 3 && nodes.every((node) => node.hasAttribute('inert')),
      );
      assert(inertBackground, 'el fondo (header/main/footer) queda inert');

      await click(page, '#onboarding-start');
      await waitFor(page, '#onboarding[hidden]');
      await page.waitForFunction(() => document.activeElement?.id === 'date', { timeout: 8000 });

      await reload(page);
      await waitFor(page, '#app header h1');
      assertEqual(
        await page.$eval('#onboarding', (el) => el.hidden),
        true,
        'el onboarding no vuelve a mostrarse',
      );
      await screenshot(page, 'onboarding-dialogo');
    },
  },
  {
    name: 'registra desde la busqueda y desde la foto sin cambiar de tarjeta',
    async run(page, ctx) {
      await installDetectionStub(page);
      await openApp(page, ctx.base);

      await switchEntryMode(page, '#entry-mode-search');
      assertEqual(
        await page.$eval('#search-panel', (el) => el.hidden),
        false,
        'panel de busqueda visible',
      );
      await assertUnifiedEntry(page);

      await addFood(page, 'manzana');
      await assertUnifiedEntry(page);
      await register(page);
      await waitForText(page, '#diary', 'Manzana');

      await switchEntryMode(page, '#entry-mode-photo');
      assertEqual(
        await page.$eval('#photo-panel', (el) => el.hidden),
        false,
        'panel de foto visible',
      );
      await assertUnifiedEntry(page);

      await uploadAndDetect(page, ctx.fixturePng);
      await register(page);
      await waitForText(page, '#diary', 'Pan blanco');
      await assertUnifiedEntry(page);

      const meals = await readStore(page, 'meals');
      assertEqual(meals.length, 2, 'dos comidas registradas (busqueda y foto)');
      await screenshot(page, 'ciclo-unificado');
    },
  },
  {
    name: 'el doble toque no duplica comidas ni insulina',
    async run(page, ctx) {
      await openApp(page, ctx.base);
      await addFood(page, 'manzana');
      await page.$eval('#register', (el) => {
        el.click();
        el.click();
      });
      await waitForText(page, '#diary', 'Manzana');

      await setValue(page, '#ins-time', '08:30');
      await setValue(page, '#ins-units', '4');
      await page.$eval('#add-insulin', (el) => {
        el.click();
        el.click();
      });
      await waitForText(page, '#diary', '08:30');
      await new Promise((resolve) => setTimeout(resolve, 300));

      const meals = await readStore(page, 'meals');
      const logs = await readStore(page, 'insulin');
      assertEqual(meals.length, 1, 'exactamente una comida');
      assertEqual(logs.length, 1, 'exactamente un registro de insulina');
      await screenshot(page, 'doble-toque');
    },
  },
  {
    name: 'una imagen ilegible muestra un error visible',
    async run(page, ctx) {
      await openApp(page, ctx.base);
      const bad = join(ctx.tmpDir, 'ilegible.png');
      await writeFile(bad, 'esto no es una imagen', 'utf8');
      await uploadFile(page, '#file-input', bad);
      await waitForText(page, '#photo-status', 'No se pudo procesar');
      assert(
        await page.$eval('#photo-status', (el) => el.getClientRects().length > 0),
        'el estado de error es visible',
      );
      assertEqual(
        await page.$eval('#file-input', (el) => el.value),
        '',
        'la entrada de fichero se rearma para reintentar',
      );
      await screenshot(page, 'imagen-ilegible');
    },
  },
  {
    name: 'el recordatorio de copia es visible sin abrir Copia',
    async run(page, ctx) {
      await page.goto(ctx.base, { waitUntil: 'domcontentloaded' });
      await page.evaluate(() => {
        localStorage.removeItem('carbos.lastExport');
        localStorage.setItem('carbos.locale', 'es');
      });
      await reload(page);
      await waitFor(page, '#app header h1');
      await waitFor(page, '#export-reminder:not([hidden])');
      assertEqual(
        await page.$eval('#export-reminder', (el) => Boolean(el.closest('details'))),
        false,
        'el aviso no vive dentro de un details plegable',
      );
      assertEqual(
        await page.$eval('#export-reminder', (el) => el.getAttribute('role')),
        'status',
        'el aviso se anuncia',
      );
      assert(
        await page.$eval('#export-reminder', (el) => !el.hidden && el.getClientRects().length > 0),
        'el recordatorio es visible sin abrir Copia',
      );
      await screenshot(page, 'recordatorio-copia');
    },
  },
  {
    name: 'las barras de la semana llevan dia y gramos y el total es numerico',
    async run(page, ctx) {
      await openApp(page, ctx.base);
      await addFood(page, 'pan');
      await register(page);
      await waitForText(page, '#diary', 'Pan');

      const week = parseFloat(await text(page, '#week-total'));
      assert(Number.isFinite(week) && week > 0, 'el total semanal es numerico y positivo');
      assertEqual(
        await page.$eval('#week-bars', (el) => el.hasAttribute('aria-hidden')),
        false,
        'la lista de barras no es aria-hidden',
      );
      const listLabel = await page.$eval('#week-bars', (el) => el.getAttribute('aria-label') ?? '');
      assert(listLabel.trim().length > 0, 'la lista tiene nombre accesible');

      const labels = await page.$$eval('#week-bars .week-day .sr-only', (nodes) =>
        nodes.map((node) => (node.textContent ?? '').trim()),
      );
      assertEqual(labels.length, 7, 'siete dias etiquetados');
      assert(
        labels.every((label) => label.length > 0 && /\d/.test(label)),
        `cada dia expone dia + gramos: ${labels.join(' | ')}`,
      );
      const active = await page.$eval('#week-bars .week-day[data-active] .sr-only', (el) =>
        (el.textContent ?? '').trim(),
      );
      assert(
        active.includes('\u00b7') && /\d/.test(active),
        `el dia activo lleva dia y gramos: ${active}`,
      );
      await screenshot(page, 'semana-etiquetada');
    },
  },
];
