// Auditoria de UI sobre el build real (spec 16, seccion Auditoria): matriz de
// viewports, pasadas de prefers-reduced-motion y prefers-color-scheme, objetivos
// tactiles y contraste de las cajas de deteccion como FATALES, mas las nuevas
// aserciones (aviso por encima del pliegue, semana accesible, foco bajo la
// cabecera y safe-area en el CSS construido).
//
//   CARBOS_FIREFOX=/usr/bin/firefox node e2e/audit.mjs
import { readdirSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';
import puppeteer from 'puppeteer';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.AUDIT_PORT ?? 4181);
const HOST = '127.0.0.1';
const FIREFOX = process.env.CARBOS_FIREFOX || undefined;
const MIN_HIT = 44;
const MIN_CONTRAST = 4.5;
const PNG_1PX =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Seis clases del catalogo -> seis paletas de caja distintas (BOX_COLORS), para
// cubrir el contraste de todas las etiquetas de deteccion.
const BOX_CLASSES = [
  'pan_blanco',
  'arroz_blanco',
  'pasta_cocida',
  'patata_cocida',
  'tomate',
  'zanahoria',
];
const BOX_DETECTIONS = BOX_CLASSES.map((classId, index) => ({
  box: { x: 0.04 + (index % 3) * 0.3, y: 0.08 + Math.floor(index / 3) * 0.46, w: 0.26, h: 0.32 },
  score: 0.9 - index * 0.02,
  label: classId,
  classId,
  topk: [{ label: classId, classId, p: 0.9 - index * 0.02 }],
}));

// Matriz de viewports + pasada de altura reducida (proxi del teclado) y pasadas
// de medios. La pasada de deteccion sube el fixture para pintar las cajas.
const PASSES = [
  { id: '320x568', width: 320, height: 568 },
  { id: '390x844', width: 390, height: 844 },
  { id: '414x896', width: 414, height: 896 },
  { id: 'landscape-notch-844x390', width: 844, height: 390 },
  { id: 'reduced-height-390x400', width: 390, height: 400 },
  {
    id: 'reduced-motion-390x844',
    width: 390,
    height: 844,
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  },
  {
    id: 'dark-390x844',
    width: 390,
    height: 844,
    features: [{ name: 'prefers-color-scheme', value: 'dark' }],
  },
  { id: 'detect-boxes-390x844', width: 390, height: 844, detections: true },
];

/**
 * Hook E2E de deteccion (mismo patron que `__carbosDetectionStub` de
 * scenarios.mjs): una deteccion sintetica por clase del catalogo.
 */
async function installDetectionStub(page, results = BOX_DETECTIONS) {
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

// Se ejecuta dentro de la pagina.
function collect() {
  const nameOf = (el) => {
    const aria = el.getAttribute('aria-label');
    if (aria?.trim()) return aria.trim();
    const ref = el.getAttribute('aria-labelledby');
    if (ref) {
      const text = ref
        .split(/\s+/)
        .map((id) => {
          const node = document.getElementById(id);
          return node?.textContent?.trim() ?? '';
        })
        .join(' ')
        .trim();
      if (text) return text;
    }
    if (el.id) {
      const forLabel = document.querySelector(`label[for="${el.id}"]`);
      if (forLabel?.textContent?.trim()) return forLabel.textContent.trim();
    }
    const wrapped = el.closest('label');
    if (wrapped?.textContent?.trim()) return wrapped.textContent.trim();
    if (el.tagName === 'INPUT') return el.value?.trim() ?? '';
    return el.textContent?.trim() || el.getAttribute('title')?.trim() || '';
  };

  const parse = (value) => {
    const match = String(value).match(/rgba?\(([^)]+)\)/);
    if (!match) return null;
    const parts = match[1].split(/[,/ ]+/).map((part) => parseFloat(part));
    return [parts[0], parts[1], parts[2]];
  };
  const luminance = ([r, g, b]) => {
    const lin = (v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  };
  const ratio = (a, b) => {
    const la = luminance(a);
    const lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  };

  const vw = document.documentElement.clientWidth;
  const overflow = [];
  const small = [];
  const unnamed = [];

  for (const el of document.querySelectorAll('body *')) {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    if (rect.right > vw + 1 || rect.left < -1) {
      overflow.push({
        tag: el.tagName,
        id: el.id,
        cls: String(el.className || '').slice(0, 30),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
      });
    }
  }
  for (const el of document.querySelectorAll('button, input, select, summary, a[href]')) {
    const rect = el.getBoundingClientRect();
    if (rect.height === 0) continue;
    if (rect.height < 44) {
      // En casillas y radios el area real de pulsacion es la etiqueta.
      const isBox = el.type === 'checkbox' || el.type === 'radio';
      const label = isBox ? el.closest('label') : null;
      const hit = label ? label.getBoundingClientRect().height : rect.height;
      if (hit < 44) {
        small.push({
          tag: label ? 'LABEL' : el.tagName,
          id: el.id,
          type: el.getAttribute('type'),
          h: Math.round(hit),
        });
      }
    }
    if (!nameOf(el)) unnamed.push({ tag: el.tagName, id: el.id, type: el.getAttribute('type') });
  }

  const disclaimerEl = document.getElementById('header-disclaimer');
  const disclaimer = disclaimerEl
    ? (() => {
        const rect = disclaimerEl.getBoundingClientRect();
        const style = window.getComputedStyle(disclaimerEl);
        return {
          present: true,
          role: disclaimerEl.getAttribute('role'),
          top: rect.top,
          bottom: rect.bottom,
          height: rect.height,
          visible:
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            Number(style.opacity) !== 0 &&
            rect.height > 0 &&
            rect.width > 0,
        };
      })()
    : { present: false };

  const weekBars = document.getElementById('week-bars');
  const week = weekBars
    ? {
        ariaHidden: weekBars.getAttribute('aria-hidden'),
        ariaLabel: weekBars.getAttribute('aria-label'),
        days: Array.from(weekBars.querySelectorAll('.week-day')).map((day) => {
          const text = (day.textContent || '').trim();
          return { text, hasNumber: /\d/.test(text) };
        }),
      }
    : null;

  const detectLabels = Array.from(document.querySelectorAll('.detect-box-label')).map((label) => {
    const style = window.getComputedStyle(label);
    const fg = parse(style.color);
    const bg = parse(style.backgroundColor);
    return {
      text: (label.textContent || '').trim(),
      color: style.color,
      background: style.backgroundColor,
      contrast: fg && bg ? Number(ratio(fg, bg).toFixed(2)) : null,
    };
  });

  return {
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: vw,
    innerHeight: window.innerHeight,
    overflow,
    small,
    unnamed,
    disclaimer,
    week,
    detectLabels,
    media: {
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      colorSchemeDark: window.matchMedia('(prefers-color-scheme: dark)').matches,
      colorSchemeLight: window.matchMedia('(prefers-color-scheme: light)').matches,
    },
  };
}

/**
 * Prefs de Firefox que respaldan las media queries `prefers-*`. Son el
 * equivalente real de `page.emulateMediaFeatures` (que exige CDP, no
 * disponible en Firefox): `ui.prefersReducedMotion` y
 * `layout.css.prefers-color-scheme.content-override`.
 */
function prefsFor(pass) {
  const prefs = {};
  for (const feature of pass.features ?? []) {
    if (feature.name === 'prefers-reduced-motion' && feature.value === 'reduce') {
      prefs['ui.prefersReducedMotion'] = 1;
    }
    if (feature.name === 'prefers-color-scheme' && feature.value === 'dark') {
      prefs['layout.css.prefers-color-scheme.content-override'] = 0;
    }
  }
  return prefs;
}

async function launchBrowser(pass) {
  const launchOptions = {
    browser: 'firefox',
    headless: true,
    extraPrefsFirefox: prefsFor(pass),
  };
  if (FIREFOX) launchOptions.executablePath = FIREFOX;
  return puppeteer.launch(launchOptions);
}

async function runPass(browser, base, fixture, pass, fatal) {
  const page = await browser.newPage();
  const prefix = `[${pass.id}]`;
  try {
    await page.setViewport({ width: pass.width, height: pass.height, deviceScaleFactor: 2 });
    if (pass.features?.length) {
      // Preferente: cuando el navegador soporta CDP; en Firefox cae a las prefs
      // que ya lleva el navegador de esta pasada.
      await page.emulateMediaFeatures(pass.features).catch(() => {});
    }
    page.on('dialog', (dialog) => void dialog.accept());
    if (pass.detections) await installDetectionStub(page);

    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#onboarding', { timeout: 20000 });
    await page.$eval('#onboarding-start', (el) => el.click());
    await wait(300);
    // Desplegar todo para que la auditoria vea los controles ocultos.
    await page.$$eval('details', (nodes) => nodes.forEach((node) => (node.open = true)));
    const enabled = await page.$eval('#insulin-toggle', (el) => el.checked);
    if (!enabled) {
      await page.$eval('#insulin-toggle', (el) => el.click());
      await wait(200);
      await page.$eval('#ins-gate-accept', (el) => el.click());
      await wait(300);
    }

    if (pass.detections) {
      await page.$eval('#file-input', (el) => {
        el.value = '';
      });
      await (await page.$('#file-input')).uploadFile(fixture);
      await page.waitForSelector('#detect-overlay .detect-box-label', { timeout: 10000 });
      await wait(200);
    }

    const data = await page.evaluate(collect);
    console.log(
      `\n=== ${prefix} (${pass.width}x${pass.height}) scrollWidth ${data.scrollWidth}, clientWidth ${data.clientWidth} ===`,
    );

    // Desborde horizontal: fatal.
    if (data.scrollWidth > data.clientWidth + 1) {
      fatal.push(`${prefix} la pagina desborda en horizontal`);
      console.log('  DESBORDE:', JSON.stringify(data.overflow));
    } else {
      console.log('  sin desborde horizontal');
    }

    // Las pasadas de medios deben aplicar de verdad (no ser un no-op silencioso).
    if (pass.features?.some((f) => f.name === 'prefers-reduced-motion')) {
      if (!data.media.reducedMotion) {
        fatal.push(`${prefix} prefers-reduced-motion: reduce no aplica`);
        console.log('  prefers-reduced-motion NO aplica');
      } else {
        console.log('  prefers-reduced-motion: reduce aplica');
      }
    }
    if (pass.features?.some((f) => f.name === 'prefers-color-scheme')) {
      if (!data.media.colorSchemeDark || data.media.colorSchemeLight) {
        fatal.push(`${prefix} prefers-color-scheme: dark no aplica`);
        console.log('  prefers-color-scheme: dark NO aplica');
      } else {
        console.log('  prefers-color-scheme: dark aplica');
      }
    }

    // Controles sin nombre accesible: fatal.
    if (data.unnamed.length > 0) {
      fatal.push(`${prefix} ${data.unnamed.length} control(es) sin nombre accesible`);
      console.log('  SIN NOMBRE:', JSON.stringify(data.unnamed));
    } else {
      console.log('  todos los controles con nombre accesible');
    }

    // Objetivos tactiles < 44 px: FATAL (ya no aviso).
    if (data.small.length > 0) {
      fatal.push(`${prefix} ${data.small.length} control(es) por debajo de ${MIN_HIT}px`);
      console.log('  <44px:', JSON.stringify(data.small));
    } else {
      console.log(`  todos los objetivos tactiles >= ${MIN_HIT}px`);
    }

    // (a) Aviso [role=note] de la cabecera visible por encima del pliegue a 320.
    if (pass.id === '320x568') {
      const disc = data.disclaimer;
      const aboveFold = Boolean(
        disc?.present &&
        disc.role === 'note' &&
        disc.visible &&
        disc.top >= -1 &&
        disc.bottom <= data.innerHeight + 1,
      );
      if (!aboveFold) {
        fatal.push(`${prefix} #header-disclaimer no es visible por encima del pliegue`);
        console.log('  AVISO FUERA DE PANTALLA:', JSON.stringify(disc));
      } else {
        console.log(
          `  #header-disclaimer visible por encima del pliegue (bottom ${Math.round(disc.bottom)})`,
        );
      }
    }

    // (b) #week-bars sin aria-hidden y cada .week-day con valor numerico.
    if (data.week) {
      const problems = [];
      if (data.week.ariaHidden !== null) problems.push('#week-bars es aria-hidden');
      if (data.week.days.length !== 7) problems.push(`${data.week.days.length} dias (esperado 7)`);
      const noNumber = data.week.days.filter((day) => !day.hasNumber).length;
      if (noNumber > 0) problems.push(`${noNumber} .week-day sin valor numerico`);
      if (problems.length > 0) {
        fatal.push(`${prefix} semana accesible: ${problems.join('; ')}`);
        console.log('  SEMANA:', problems.join('; '));
      } else {
        console.log('  #week-bars accesible (7 dias con valor numerico)');
      }
    } else {
      fatal.push(`${prefix} #week-bars no existe`);
    }

    // (c) Foco bajo la cabecera pegajosa (solo en viewports altos y sin deteccion).
    if (!pass.detections && pass.height >= 500) {
      // Trigger de busqueda para tener un ultimo resultado que enfocar.
      await page.$eval('#entry-mode-search', (el) => el.click());
      await page.$eval('#food-search', (el) => {
        el.value = 'pan';
        el.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await page
        .waitForSelector('#search-results button.result', { timeout: 8000 })
        .catch(() => {});

      const focus = await page.evaluate(() => {
        const header = document.querySelector('.topbar');
        const out = [];
        const targets = [];
        const insTime = document.getElementById('ins-time');
        if (insTime) targets.push(['#ins-time', insTime]);
        const results = document.querySelectorAll('#search-results button.result');
        if (results.length > 0) targets.push(['ultimo-resultado', results[results.length - 1]]);
        for (const [name, el] of targets) {
          el.focus();
          const rect = el.getBoundingClientRect();
          const bottom = header ? header.getBoundingClientRect().bottom : 0;
          out.push({ name, top: Math.round(rect.top), headerBottom: Math.round(bottom) });
        }
        return out;
      });
      if (focus.length === 0) {
        fatal.push(`${prefix} no se pudo enfocar #ins-time ni el ultimo resultado`);
        console.log('  FOCO: sin objetivos');
      }
      for (const item of focus) {
        if (item.top < item.headerBottom - 1) {
          fatal.push(
            `${prefix} ${item.name} queda bajo la cabecera (top ${item.top} < ${item.headerBottom})`,
          );
          console.log(`  FOCO OCULTO: ${JSON.stringify(item)}`);
        } else {
          console.log(`  foco ${item.name}: top ${item.top} >= cabecera ${item.headerBottom}`);
        }
      }
    }

    // Contraste de cada .detect-box-label vs su fondo: FATAL.
    if (pass.detections) {
      if (data.detectLabels.length === 0) {
        fatal.push(`${prefix} sin .detect-box-label tras la deteccion`);
        console.log('  SIN ETIQUETAS DE DETECCION');
      } else {
        for (const label of data.detectLabels) {
          if (label.contrast === null || label.contrast < MIN_CONTRAST) {
            fatal.push(
              `${prefix} .detect-box-label "${label.text}" contraste ${label.contrast} < ${MIN_CONTRAST} (${label.color} sobre ${label.background})`,
            );
            console.log(`  CONTRASTE BAJO: ${label.text} -> ${label.contrast}`);
          }
        }
        if (data.detectLabels.every((l) => l.contrast !== null && l.contrast >= MIN_CONTRAST)) {
          const min = Math.min(...data.detectLabels.map((l) => l.contrast));
          console.log(
            `  ${data.detectLabels.length} etiquetas de deteccion con contraste >= ${MIN_CONTRAST} (min ${min})`,
          );
        }
      }
    }
  } finally {
    await page.close();
  }
}

/** (d) Asercion estatica: el CSS construido usa env(safe-area-inset-*) en los 4 lados. */
function checkBuiltCss(fatal) {
  const assetsDir = join(__dirname, '..', 'dist', 'assets');
  let files = [];
  try {
    files = readdirSync(assetsDir).filter((name) => name.endsWith('.css'));
  } catch (error) {
    fatal.push(`no se pudo leer dist/assets: ${error.message}`);
    return;
  }
  if (files.length === 0) {
    fatal.push('dist/assets sin fichero CSS construido');
    return;
  }
  const css = files.map((name) => readFileSync(join(assetsDir, name), 'utf8')).join('\n');
  const missing = ['top', 'right', 'bottom', 'left'].filter(
    (side) => !css.includes(`env(safe-area-inset-${side}`),
  );
  if (missing.length > 0) {
    fatal.push(`el CSS construido no usa env(safe-area-inset-${missing.join(', ')})`);
  } else {
    console.log('\nCSS construido: env(safe-area-inset-*) presente en top, right, bottom y left');
  }
}

async function main() {
  const tmpDir = join(__dirname, 'tmp');
  await mkdir(tmpDir, { recursive: true });
  const fixture = join(tmpDir, 'audit.png');
  await writeFile(fixture, Buffer.from(PNG_1PX, 'base64'));

  const server = await preview({
    preview: { port: PORT, strictPort: true, host: HOST },
    logLevel: 'silent',
  });
  const base = `http://${HOST}:${PORT}/`;

  const fatal = [];
  try {
    for (const pass of PASSES) {
      const browser = await launchBrowser(pass);
      try {
        await runPass(browser, base, fixture, pass, fatal);
      } catch (error) {
        fatal.push(`[${pass.id}] fallo la pasada: ${error.message}`);
        console.log(`\n=== [${pass.id}] ERROR: ${error.message}`);
      } finally {
        await browser.close();
      }
    }
    checkBuiltCss(fatal);
  } finally {
    await server.close();
  }

  if (fatal.length > 0) {
    console.log('');
    for (const problem of fatal) console.log(`FALLO  ${problem}`);
    console.log('AUDIT: RED');
    process.exit(1);
  }
  console.log('\nAUDIT: GREEN');
}

main().catch((error) => {
  console.log(error);
  console.log('AUDIT: RED');
  process.exit(1);
});
