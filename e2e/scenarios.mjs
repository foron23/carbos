import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
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
  await setValue(page, '#food-search', query);
  await page.waitForSelector('#search-results button.result', { timeout: 8000 });
  await page.evaluate((index) => {
    const buttons = document.querySelectorAll('#search-results button.result');
    buttons[index]?.click();
  }, resultIndex);
  await page.waitForSelector('#draft-items .draft-row', { timeout: 8000 });
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
      assertEqual(shared.status, 'pending', 'el recorte queda pendiente');

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
      await page.evaluate(
        (url) => localStorage.setItem('carbos.contrib.endpoint', url),
        ctx.receiverUrl,
      );

      await uploadAndDetect(page, ctx.fixtureMetaPng);
      await click(page, '#share-photo');
      await waitForContributionCount(page, 1);

      // El flush corre al recuperar conexion (la app es offline-first).
      await page.evaluate(() => window.dispatchEvent(new Event('online')));
      for (let i = 0; i < 100 && ctx.received.length === 0; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      assertEqual(ctx.received.length, 1, 'un unico POST por lote');
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
];
