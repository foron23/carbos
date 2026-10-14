import { isStringKey, t } from '../i18n';
import type { Locale, StringKey } from '../i18n';
import { decodeBarcodeFromFile } from './decode';
import { downloadPack, fetchPacksManifest } from './download';
import { normalizeEan } from './ean';
import { isBarcodeOnlineEnabled, setBarcodeOnlineEnabled } from './flag';
import type { BarcodeFetcher } from './lookup/client';
import { importPack, parseManifest } from './pack';
import { resolveBarcode } from './resolve';
import { startLiveScan } from './scanner';
import type { LiveScanHandle } from './scanner';

/**
 * Panel del modulo de codigo de barras (Fase A offline + Fase B opt-in).
 *
 * Escanea o escribe un EAN-13/UPC-A, lo resuelve contra el pack local (descargado
 * o importado a mano, JSONL.gz + manifest sha256) y prellena el borrador. Por
 * defecto todo ocurre en el dispositivo; la red solo entra por dos vias
 * explicitas: (a) el boton "Descargar pack" y (b) la consulta en linea opt-in
 * ("Consultar en linea"), que avisa de que el codigo sale del dispositivo.
 *
 * Modulo separable (D7): la pestana "Codigo" siempre esta disponible; lo unico
 * opt-in es la **resolucion en linea** (`carbos.barcode.online`, por defecto off).
 */

/** Producto resuelto que se empuja al borrador (contrato con `main.ts`). */
export interface BarcodeAdd {
  name: string;
  grams: number;
  carbsPer100g: number;
  barcode: string;
  brand?: string | undefined;
}

export interface BarcodeDeps {
  getLocale: () => Locale;
  onAdd: (product: BarcodeAdd) => void;
}

export interface BarcodeHandle {
  /** Retraduce el panel y lo monta/desmonta segun el flag opt-in. */
  refresh(): void;
}

/** Racion por defecto cuando el pack no trae `defaultPortionGrams`. */
const DEFAULT_GRAMS = 100;

/**
 * Hook estrecho para el arnes E2E (mismo patron que `__carbosBarcodeStub`): si
 * `globalThis.__carbosBarcodeFetch` esta definido, se usa en lugar de `fetch`
 * para el manifest/pack y la consulta en linea. Si no, es inerte.
 */
function testFetcher(): BarcodeFetcher | undefined {
  return (globalThis as { __carbosBarcodeFetch?: BarcodeFetcher }).__carbosBarcodeFetch;
}

export function setupBarcode(host: HTMLElement, deps: BarcodeDeps): BarcodeHandle {
  let root: HTMLElement | null = null;
  let statusKey: StringKey | null = null;
  let live: LiveScanHandle | null = null;

  const paintStatus = (): void => {
    const status = root?.querySelector<HTMLElement>('#barcode-status');
    if (status) status.textContent = statusKey ? t(deps.getLocale(), statusKey) : '';
  };

  const localize = (): void => {
    if (!root) return;
    for (const node of root.querySelectorAll<HTMLElement>('[data-i18n]')) {
      const key = node.dataset.i18n;
      if (key && isStringKey(key)) node.textContent = t(deps.getLocale(), key);
    }
    for (const node of root.querySelectorAll<HTMLInputElement>('[data-i18n-ph]')) {
      const key = node.dataset.i18nPh;
      if (key && isStringKey(key)) node.placeholder = t(deps.getLocale(), key);
    }
    for (const node of root.querySelectorAll<HTMLElement>('[data-i18n-aria]')) {
      const key = node.dataset.i18nAria;
      if (key && isStringKey(key)) node.setAttribute('aria-label', t(deps.getLocale(), key));
    }
  };

  const paint = (): void => {
    localize();
    paintStatus();
  };

  async function useCode(code: string): Promise<void> {
    statusKey = 'barcode.detecting';
    paint();
    const online = isBarcodeOnlineEnabled();
    const fetcher = testFetcher();
    const result = await resolveBarcode(code, fetcher ? { online, fetcher } : { online });
    if (result.kind === 'hit') {
      const { product } = result;
      const name = typeof product.name === 'string' ? product.name : product.name[deps.getLocale()];
      const hasCarbs = product.carbsPer100g !== undefined;
      const add: BarcodeAdd = {
        name,
        grams: product.defaultPortionGrams ?? DEFAULT_GRAMS,
        carbsPer100g: product.carbsPer100g ?? 0,
        barcode: product.barcode,
      };
      if (product.brand !== undefined) add.brand = product.brand;
      deps.onAdd(add);
      // Sin carbohidratos conocidos: identificado, pero el usuario los ajusta.
      statusKey = hasCarbs ? 'barcode.ready' : 'barcode.identified';
    } else if (result.kind === 'miss') {
      // Miss offline: prellenar con el propio codigo y pedir los gramos a mano.
      const normalized = normalizeEan(code);
      if (normalized) {
        deps.onAdd({
          name: normalized,
          grams: DEFAULT_GRAMS,
          carbsPer100g: 0,
          barcode: normalized,
        });
      }
      statusKey = 'barcode.notFound';
    } else {
      statusKey = 'barcode.notFound';
    }
    paint();
  }

  async function decodeFile(file: File): Promise<void> {
    statusKey = 'barcode.detecting';
    paint();
    const code = await decodeBarcodeFromFile(file);
    if (!code) {
      statusKey = 'barcode.unsupported';
      paint();
      return;
    }
    await useCode(code);
  }

  /**
   * Descarga el pack del manifest hospedado (misma idea que los pesos del modelo),
   * con progreso, verificacion sha256 e importacion; despues el escaneo es local.
   */
  async function download(): Promise<void> {
    statusKey = 'barcode.downloading';
    paint();
    try {
      const fetcher = testFetcher();
      const manifestUrl = new URL('barcode-manifest.json', document.baseURI).href;
      const manifest = await fetchPacksManifest(manifestUrl, fetcher ?? fetch);
      const locale = deps.getLocale();
      // Todos los packs del idioma: principal (con nutricion) + resto (identificacion).
      const entries = manifest.packs.filter((pack) => pack.locale === locale);
      const chosen = entries.length > 0 ? entries : manifest.packs;
      if (chosen.length === 0) {
        statusKey = 'barcode.noPack';
        paint();
        return;
      }
      const status = root?.querySelector<HTMLElement>('#barcode-status');
      for (const entry of chosen) {
        await downloadPack(entry, {
          ...(fetcher ? { fetcher } : {}),
          onProgress: ({ loaded, total }) => {
            if (status) {
              const pct = total > 0 ? Math.round((loaded / total) * 100) : 0;
              status.textContent = `${t(deps.getLocale(), 'barcode.downloading')} ${pct}%`;
            }
          },
        });
      }
      statusKey = 'barcode.downloaded';
    } catch {
      statusKey = 'barcode.downloadFailed';
    }
    paint();
  }

  async function importFiles(files: File[]): Promise<void> {
    statusKey = 'barcode.importing';
    paint();
    try {
      const manifestFile = files.find((file) => /\.json$/i.test(file.name));
      const packFile = files.find((file) => file !== manifestFile);
      if (!manifestFile || !packFile) throw new Error('faltan ficheros');
      const manifest = parseManifest(JSON.parse(await manifestFile.text()));
      await importPack({ manifest, blob: packFile });
      statusKey = 'barcode.imported';
    } catch {
      statusKey = 'barcode.importFailed';
    }
    paint();
  }

  const mount = (): void => {
    // La visibilidad del panel la gobierna el conmutador de modo (main.ts).
    host.innerHTML = `
      <fieldset class="card inset">
        <legend data-i18n="section.barcode"></legend>
        <p><button id="barcode-scan" type="button" class="primary" data-i18n="button.scanBarcode"></button></p>
        <video id="barcode-video" class="barcode-video" hidden autoplay playsinline muted></video>
        <p><button id="barcode-stop" type="button" data-i18n="button.cancel" hidden></button></p>
        <p id="barcode-status" class="muted" aria-live="polite"></p>
        <details>
          <summary data-i18n="barcode.moreOptions"></summary>
          <p class="muted" data-i18n="barcode.hint"></p>
          <div class="row">
            <label for="barcode-manual" data-i18n="barcode.manualLabel"></label>
            <input id="barcode-manual" type="text" inputmode="numeric" autocomplete="off" />
            <button id="barcode-manual-go" type="button" data-i18n="button.search"></button>
          </div>
          <div class="row">
            <label class="btn"><input id="barcode-input" class="sr-only" type="file" accept="image/*" capture="environment" data-i18n-aria="barcode.scanPhoto" /><span data-i18n="barcode.scanPhoto"></span></label>
            <button id="barcode-download" type="button" data-i18n="barcode.downloadPack"></button>
            <label class="btn"><input id="barcode-pack" class="sr-only" type="file" accept=".gz,.json,application/gzip,application/json" multiple data-i18n-aria="barcode.importPack" /><span data-i18n="barcode.importPack"></span></label>
          </div>
          <label class="check"><input id="barcode-online" type="checkbox" /> <span data-i18n="barcode.onlineLabel"></span></label>
          <p class="muted" data-i18n="barcode.onlineWarning"></p>
          <p class="muted" data-i18n="barcode.onlineNote"></p>
        </details>
        <p class="muted" data-i18n="barcode.attribution"></p>
      </fieldset>
    `;
    root = host.querySelector('fieldset');
    const video = host.querySelector<HTMLVideoElement>('#barcode-video');
    const stopButton = host.querySelector<HTMLButtonElement>('#barcode-stop');

    const stopScan = (): void => {
      live?.stop();
      live = null;
      if (video) {
        video.hidden = true;
        video.srcObject = null;
      }
      if (stopButton) stopButton.hidden = true;
    };

    // Boton principal: escaneo en vivo (nativo o quagga2). Si no hay camara
    // disponible, cae a la foto o a la entrada manual.
    const beginScan = (): void => {
      statusKey = 'barcode.detecting';
      paint();
      // Mostrar el visor ANTES de arrancar: un video `display:none` no dibuja
      // fotogramas y la decodificacion no ve nada.
      if (video) video.hidden = false;
      if (stopButton) stopButton.hidden = false;
      let fallback = false;
      let detected = false;
      // Si a los 8 s no ha leido nada, sugerir acercar la camara o usar la foto.
      const aimTimer = window.setTimeout(() => {
        if (!detected && live) {
          statusKey = 'barcode.aim';
          paint();
        }
      }, 8000);
      void startLiveScan({
        video: video as HTMLVideoElement,
        onCode: (code) => {
          detected = true;
          window.clearTimeout(aimTimer);
          stopScan();
          void useCode(code);
        },
        onError: (reason) => {
          statusKey = reason === 'denied' ? 'barcode.cameraDenied' : 'barcode.unsupported';
          if (reason === 'unsupported') fallback = true;
          paint();
        },
      }).then((handle) => {
        if (handle) {
          live = handle;
          return;
        }
        // Sin camara: ocultar el visor y, si procede, caer a la foto.
        if (video) video.hidden = true;
        if (stopButton) stopButton.hidden = true;
        if (!detected && fallback) host.querySelector<HTMLInputElement>('#barcode-input')?.click();
      });
    };

    host.querySelector('#barcode-scan')?.addEventListener('click', beginScan);
    stopButton?.addEventListener('click', () => {
      stopScan();
      statusKey = null;
      paint();
    });

    const manual = host.querySelector<HTMLInputElement>('#barcode-manual');
    const runManual = (): void => {
      const value = manual?.value.trim() ?? '';
      if (value) void useCode(value);
    };
    host.querySelector('#barcode-manual-go')?.addEventListener('click', runManual);
    manual?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') runManual();
    });
    host.querySelector<HTMLInputElement>('#barcode-input')?.addEventListener('change', (event) => {
      const input = event.target as HTMLInputElement;
      const file = input.files?.[0];
      if (file) void decodeFile(file);
      input.value = '';
    });
    host.querySelector<HTMLInputElement>('#barcode-pack')?.addEventListener('change', (event) => {
      const input = event.target as HTMLInputElement;
      const files = Array.from(input.files ?? []);
      if (files.length > 0) void importFiles(files);
      input.value = '';
    });
    host.querySelector('#barcode-download')?.addEventListener('click', () => {
      void download();
    });
    const online = host.querySelector<HTMLInputElement>('#barcode-online');
    if (online) {
      online.checked = isBarcodeOnlineEnabled();
      online.addEventListener('change', () => setBarcodeOnlineEnabled(online.checked));
    }
    paint();
  };

  const refresh = (): void => {
    if (!root) mount();
    else paint();
  };

  refresh();

  return { refresh };
}
