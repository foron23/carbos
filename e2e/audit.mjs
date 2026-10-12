// Auditoria de UI sobre el build real: desborde horizontal, nombres accesibles
// y tamano de los objetivos tactiles. Falla si aparece desborde o un control
// sin nombre; avisa (sin fallar) de los controles por debajo de 44 px.
//
//   CARBOS_FIREFOX=/usr/bin/firefox node e2e/audit.mjs
import { preview } from 'vite';
import puppeteer from 'puppeteer';

const PORT = Number(process.env.AUDIT_PORT ?? 4181);
const HOST = '127.0.0.1';
const FIREFOX = process.env.CARBOS_FIREFOX || undefined;
const WIDTHS = [390, 320];

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

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
  return {
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: vw,
    overflow,
    small,
    unnamed,
  };
}

async function main() {
  const server = await preview({
    preview: { port: PORT, strictPort: true, host: HOST },
    logLevel: 'silent',
  });
  const base = `http://${HOST}:${PORT}/`;
  const launchOptions = { browser: 'firefox', headless: true };
  if (FIREFOX) launchOptions.executablePath = FIREFOX;
  const browser = await puppeteer.launch(launchOptions);

  const fatal = [];
  const warnings = [];

  try {
    for (const width of WIDTHS) {
      const page = await browser.newPage();
      await page.setViewport({ width, height: 844, deviceScaleFactor: 2 });
      page.on('dialog', (dialog) => void dialog.accept());
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

      const data = await page.evaluate(collect);
      const drifted = data.scrollWidth > data.clientWidth + 1;
      console.log(
        `\n=== ${width}px (scrollWidth ${data.scrollWidth}, clientWidth ${data.clientWidth}) ===`,
      );
      if (drifted) {
        fatal.push(`${width}px: la pagina desborda en horizontal`);
        console.log('  DESBORDE:', JSON.stringify(data.overflow));
      } else {
        console.log('  sin desborde horizontal');
      }
      if (data.unnamed.length > 0) {
        fatal.push(`${width}px: ${data.unnamed.length} control(es) sin nombre accesible`);
        console.log('  SIN NOMBRE:', JSON.stringify(data.unnamed));
      } else {
        console.log('  todos los controles con nombre accesible');
      }
      if (data.small.length > 0) {
        warnings.push(`${width}px: ${JSON.stringify(data.small)}`);
        console.log('  AVISO (<44px):', JSON.stringify(data.small));
      }
      await page.close();
    }
  } finally {
    await browser.close();
    await server.close();
  }

  for (const warning of warnings) console.log(`\nAVISO  ${warning}`);
  if (fatal.length > 0) {
    for (const problem of fatal) console.error(`FALLO  ${problem}`);
    process.exit(1);
  }
  console.log('\nAuditoria de UI: en verde (los avisos de tamano no bloquean).');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
