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

/**
 * Lee el store IndexedDB `contributions` y devuelve, por cada registro, el id,
 * la clase, el estado y los bytes del JPEG como array de numeros (para poder
 * inspeccionar la cabecera y comprobar que no lleva EXIF/GPS).
 */
export async function readContributions(page) {
  return page.evaluate(async () => {
    const records = await new Promise((resolve, reject) => {
      const request = indexedDB.open('carbos');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('contributions')) {
          db.close();
          resolve([]);
          return;
        }
        const tx = db.transaction('contributions', 'readonly');
        const all = tx.objectStore('contributions').getAll();
        all.onsuccess = () => {
          db.close();
          resolve(all.result);
        };
        all.onerror = () => {
          db.close();
          reject(all.error);
        };
      };
    });
    const out = [];
    for (const record of records) {
      const buffer = await record.blob.arrayBuffer();
      out.push({
        classId: record.classId,
        status: record.status,
        attempts: record.attempts,
        type: record.blob.type,
        size: record.blob.size,
        bytes: Array.from(new Uint8Array(buffer)),
      });
    }
    return out;
  });
}

/** Espera a que el store `contributions` tenga exactamente `count` registros. */
export async function waitForContributionCount(page, count, timeout = 8000) {
  await page.waitForFunction(
    (want) =>
      new Promise((resolve) => {
        const request = indexedDB.open('carbos');
        request.onerror = () => resolve(false);
        request.onsuccess = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('contributions')) {
            db.close();
            resolve(want === 0);
            return;
          }
          const tx = db.transaction('contributions', 'readonly');
          const all = tx.objectStore('contributions').getAll();
          all.onsuccess = () => {
            db.close();
            resolve(all.result.length === want);
          };
          all.onerror = () => {
            db.close();
            resolve(false);
          };
        };
      }),
    { timeout },
    count,
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
