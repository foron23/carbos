import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const SHOTS_DIR = join(__dirname, 'screenshots');

let shotCounter = 0;

export async function ensureShotsDir() {
  await mkdir(SHOTS_DIR, { recursive: true });
}

export async function screenshot(page, name) {
  const safe = `${String(++shotCounter).padStart(2, '0')}-${name.replace(/[^a-z0-9-]+/gi, '-')}.png`;
  await page.screenshot({ path: join(SHOTS_DIR, safe), fullPage: true });
  return safe;
}

export function assert(condition, message) {
  if (!condition) throw new Error(`ASSERT: ${message}`);
}

export function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(
      `ASSERT: ${message} (esperado ${JSON.stringify(expected)}, obtenido ${JSON.stringify(actual)})`,
    );
  }
}

export async function waitFor(page, selector, timeout = 10000) {
  await page.waitForSelector(selector, { timeout });
}

export async function text(page, selector) {
  return page.$eval(selector, (el) => el.textContent?.trim() ?? '');
}

export async function setValue(page, selector, value) {
  await page.$eval(
    selector,
    (el, v) => {
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    },
    value,
  );
}

export async function click(page, selector) {
  await page.$eval(selector, (el) => el.click());
}

export async function reload(page) {
  await page.reload({ waitUntil: 'domcontentloaded' });
}

export async function uploadFile(page, selector, path) {
  const input = await page.$(selector);
  if (!input) throw new Error(`No existe ${selector}`);
  await input.uploadFile(path);
}

export async function waitForText(page, selector, expected, timeout = 8000) {
  await page.waitForFunction(
    (sel, want) => {
      const el = document.querySelector(sel);
      return !!el && (el.textContent ?? '').includes(want);
    },
    { timeout },
    selector,
    expected,
  );
}

export async function readStore(page, store) {
  return page.evaluate(
    (storeName) =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open('carbos');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(storeName)) {
            db.close();
            resolve([]);
            return;
          }
          const tx = db.transaction(storeName, 'readonly');
          const all = tx.objectStore(storeName).getAll();
          all.onsuccess = () => {
            db.close();
            resolve(all.result);
          };
          all.onerror = () => {
            db.close();
            reject(all.error);
          };
        };
      }),
    store,
  );
}

export async function clearDatabase(page) {
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        const request = indexedDB.deleteDatabase('carbos');
        request.onsuccess = () => resolve(true);
        request.onerror = () => resolve(false);
        request.onblocked = () => resolve(false);
      }),
  );
}

export async function unregisterServiceWorkers(page) {
  await page
    .evaluate(async () => {
      if (!('serviceWorker' in navigator)) return;
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    })
    .catch(() => {});
}

export async function captureDownload(page, triggerSelector) {
  return page.evaluate(async (selector) => {
    const trigger = document.querySelector(selector);
    if (!trigger) throw new Error(`No existe ${selector}`);
    let captured = null;
    const originalClick = HTMLAnchorElement.prototype.click;
    const originalRevoke = URL.revokeObjectURL;
    HTMLAnchorElement.prototype.click = function () {
      captured = { href: this.href, download: this.download };
    };
    URL.revokeObjectURL = () => {};
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    try {
      trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      for (let i = 0; i < 100 && !captured; i += 1) await wait(20);
      if (!captured) return null;
      const response = await fetch(captured.href);
      const body = await response.text();
      return { download: captured.download, body };
    } finally {
      HTMLAnchorElement.prototype.click = originalClick;
      URL.revokeObjectURL = originalRevoke;
    }
  }, triggerSelector);
}
