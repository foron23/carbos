import { isStringKey, t } from '../i18n';
import type { Locale, StringKey } from '../i18n';
import { decodeBarcodeFromFile } from './decode';
import { downloadPack, fetchPacksManifest } from './download';
import { isBarcodeOnlineEnabled, setBarcodeOnlineEnabled } from './flag';
import type { BarcodeFetcher } from './lookup/client';
import { importPack, parseManifest } from './pack';
import { resolveBarcode } from './resolve';
import { startLiveScan } from './scanner';
import type { LiveScanHandle } from './scanner';
import { countProducts } from './store';

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
  /** Retraduce el panel. */
  refresh(): void;
  /** Prepara los datos (descarga el pack si hace falta) en segundo plano. */
  prepare(): void;
}

/** Resultado de usar un codigo: para el popup de confirmacion del visor. */
interface UseCodeResult {
  kind: 'hit' | 'miss' | 'invalid';
  name?: string;
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
  // Texto dinamico (p. ej. "Anadido: <nombre>"): tiene prioridad sobre la clave.
  let statusText: string | null = null;
  let live: LiveScanHandle | null = null;

  /** Fija un estado traducido y descarta cualquier texto dinamico previo. */
  const setStatus = (key: StringKey | null): void => {
    statusKey = key;
    statusText = null;
  };

  const paintStatus = (): void => {
    const status = root?.querySelector<HTMLElement>('#barcode-status');
    if (!status) return;
    status.textContent = statusText ?? (statusKey ? t(deps.getLocale(), statusKey) : '');
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

  async function useCode(code: string): Promise<UseCodeResult> {
    setStatus('barcode.detecting');
    paint();
    const online = isBarcodeOnlineEnabled();
    // Sin consulta en linea, asegurar los datos locales antes de resolver: la
    // primera vez descarga el pack (una sola accion del usuario: escanear).
    if (!online) await ensurePack();
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
      setStatus(hasCarbs ? 'barcode.ready' : 'barcode.identified');
      // Confirmacion con el nombre resuelto: se ve de un vistazo que se anadio.
      statusText = `${t(deps.getLocale(), 'barcode.added')} ${name}`;
      paint();
      return { kind: 'hit', name };
    }
    // No se inventa una fila: solo se avisa. El usuario decide (pack, en linea
    // o anadir a mano). Antes se anadia una fila con el EAN y 0 g, que era enganoso.
    setStatus('barcode.notFound');
    paint();
    return { kind: result.kind === 'miss' ? 'miss' : 'invalid' };
  }

  async function decodeFile(file: File): Promise<void> {
    setStatus('barcode.detecting');
    paint();
    const code = await decodeBarcodeFromFile(file);
    if (!code) {
      setStatus('barcode.unsupported');
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
    setStatus('barcode.downloading');
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
        setStatus('barcode.noPack');
        paint();
        return;
      }
      const status = root?.querySelector<HTMLElement>('#barcode-status');
      for (const entry of chosen) {
        await downloadPack(entry, {
          ...(fetcher ? { fetcher } : {}),
          onProgress: ({ loaded, total }) => {
            if (status) {
              // Si el transporte descomprime (Content-Encoding: gzip), `loaded` cuenta los
              // bytes del JSONL y `total` los del .gz: el cociente se dispara. Acotamos.
              const pct = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
              status.textContent = `${t(deps.getLocale(), 'barcode.downloading')} ${pct}%`;
            }
          },
        });
      }
      setStatus('barcode.downloaded');
    } catch {
      setStatus('barcode.downloadFailed');
    }
    paint();
    void updatePackHint();
  }

  // Descarga perezosa y automatica del pack: se lanza al abrir la pestana o en
  // el primer escaneo, y el escaneo espera a que termine. No hay que pulsar nada.
  let packPrep: Promise<void> | null = null;
  function ensurePack(): Promise<void> {
    if (isBarcodeOnlineEnabled()) return Promise.resolve();
    if (packPrep) return packPrep;
    packPrep = (async () => {
      try {
        if ((await countProducts()) > 0) return;
        await download();
      } catch {
        /* sin datos: el escaneo caera a "no encontrado" */
      } finally {
        packPrep = null;
      }
    })();
    return packPrep;
  }

  /** Muestra el aviso de "sin datos" mientras el store local este vacio. */
  async function updatePackHint(): Promise<void> {
    const hint = root?.querySelector<HTMLElement>('#barcode-empty-hint');
    if (!hint) return;
    try {
      hint.hidden = (await countProducts()) > 0;
    } catch {
      hint.hidden = true;
    }
  }

  async function importFiles(files: File[]): Promise<void> {
    setStatus('barcode.importing');
    paint();
    try {
      const manifestFile = files.find((file) => /\.json$/i.test(file.name));
      const packFile = files.find((file) => file !== manifestFile);
      if (!manifestFile || !packFile) throw new Error('faltan ficheros');
      const manifest = parseManifest(JSON.parse(await manifestFile.text()));
      await importPack({ manifest, blob: packFile });
      setStatus('barcode.imported');
    } catch {
      setStatus('barcode.importFailed');
    }
    paint();
  }

  const mount = (): void => {
    // La visibilidad del panel la gobierna el conmutador de modo (main.ts).
    host.innerHTML = `
      <fieldset class="card inset">
        <legend data-i18n="section.barcode"></legend>
        <p><button id="barcode-scan" type="button" class="primary" data-i18n="button.scanBarcode"></button></p>
        <div id="barcode-viewer" class="barcode-viewer" hidden>
          <video id="barcode-video" class="barcode-video" autoplay playsinline muted></video>
          <div class="barcode-reticle" aria-hidden="true"></div>
          <p class="barcode-reticle-hint" data-i18n="barcode.aimHint"></p>
          <div id="barcode-flash" class="barcode-flash" aria-hidden="true" hidden></div>
        </div>
        <p><button id="barcode-stop" type="button" data-i18n="button.cancel" hidden></button></p>
        <p id="barcode-status" class="muted" aria-live="polite"></p>
        <p id="barcode-empty-hint" class="muted" data-i18n="barcode.emptyHint" hidden></p>
        <div class="row">
          <button id="barcode-download" type="button" data-i18n="barcode.downloadPack"></button>
          <label class="btn"><input id="barcode-pack" class="sr-only" type="file" accept=".gz,.json,application/gzip,application/json" multiple data-i18n-aria="barcode.importPack" /><span data-i18n="barcode.importPack"></span></label>
        </div>
        <label class="check"><input id="barcode-online" type="checkbox" /> <span data-i18n="barcode.onlineLabel"></span></label>
        <p class="muted" data-i18n="barcode.onlineWarning"></p>
        <details>
          <summary data-i18n="barcode.moreOptions"></summary>
          <p class="muted" data-i18n="barcode.hint"></p>
          <div class="row">
            <label for="barcode-manual" data-i18n="barcode.manualLabel"></label>
            <input id="barcode-manual" type="text" inputmode="numeric" autocomplete="off" />
            <button id="barcode-manual-go" type="button" data-i18n="button.search"></button>
          </div>
          <label class="btn"><input id="barcode-input" class="sr-only" type="file" accept="image/*" capture="environment" data-i18n-aria="barcode.scanPhoto" /><span data-i18n="barcode.scanPhoto"></span></label>
          <p class="muted" data-i18n="barcode.onlineNote"></p>
        </details>
        <p class="muted" data-i18n="barcode.attribution"></p>
      </fieldset>
    `;
    root = host.querySelector('fieldset');
    const video = host.querySelector<HTMLVideoElement>('#barcode-video');
    const viewer = host.querySelector<HTMLElement>('#barcode-viewer');
    const flash = host.querySelector<HTMLElement>('#barcode-flash');
    const status = host.querySelector<HTMLElement>('#barcode-status');
    const stopButton = host.querySelector<HTMLButtonElement>('#barcode-stop');

    // Popup sobre el retículo: verde si se encontro y anadio el producto (con su
    // nombre), rojo si no. Se pinta un instante antes de cerrar el visor.
    const showFlash = (result: UseCodeResult): void => {
      if (!flash) return;
      const success = result.kind === 'hit';
      flash.classList.toggle('is-success', success);
      flash.classList.toggle('is-error', !success);
      flash.textContent = success
        ? `${t(deps.getLocale(), 'barcode.added')} ${result.name ?? ''}`.trim()
        : t(deps.getLocale(), 'barcode.missShort');
      flash.hidden = false;
    };

    // Estado visual del visor: `scanning` (animacion de barrido) o `locked`
    // (codigo ya leido, congelado). Ambas clases viven en src/style.css.
    const setViewerState = (state: 'scanning' | 'locked' | null): void => {
      if (!viewer) return;
      viewer.classList.toggle('is-scanning', state === 'scanning');
      viewer.classList.toggle('is-locked', state === 'locked');
    };

    // Indicador de actividad en el propio texto de estado (giro via CSS).
    const setBusy = (on: boolean): void => {
      status?.classList.toggle('busy', on);
    };

    const hideViewer = (): void => {
      setViewerState(null);
      setBusy(false);
      if (flash) {
        flash.hidden = true;
        flash.classList.remove('is-success', 'is-error');
      }
      if (viewer) viewer.hidden = true;
      if (video) video.srcObject = null;
      if (stopButton) stopButton.hidden = true;
    };

    const stopScan = (): void => {
      live?.stop();
      live = null;
      hideViewer();
    };

    // Boton principal: escaneo en vivo (nativo o quagga2). Si no hay camara
    // disponible, cae a la foto o a la entrada manual.
    const beginScan = (): void => {
      setStatus('barcode.detecting');
      paint();
      // Mostrar el visor ANTES de arrancar: un video `display:none` no dibuja
      // fotogramas y la decodificacion no ve nada.
      if (viewer) viewer.hidden = false;
      setViewerState('scanning');
      setBusy(true);
      if (stopButton) stopButton.hidden = false;
      let fallback = false;
      let detected = false;
      // Si a los 8 s no ha leido nada, sugerir acercar la camara o usar la foto.
      const aimTimer = window.setTimeout(() => {
        if (!detected && live) {
          setStatus('barcode.aim');
          paint();
        }
      }, 8000);
      void startLiveScan({
        video: video as HTMLVideoElement,
        onCode: (code) => {
          detected = true;
          window.clearTimeout(aimTimer);
          // Congela la camara y muestra "codigo leido" mientras se resuelve.
          live?.stop();
          live = null;
          if (video) video.srcObject = null;
          setViewerState('locked');
          setBusy(false);
          setStatus('barcode.codeDetected');
          paint();
          void (async () => {
            const result = await useCode(code);
            showFlash(result);
            // Deja ver la confirmacion (verde) o el aviso (rojo) antes de cerrar.
            await new Promise((resolve) =>
              window.setTimeout(resolve, result.kind === 'hit' ? 1600 : 2400),
            );
            hideViewer();
          })();
        },
        onError: (reason) => {
          setStatus(reason === 'denied' ? 'barcode.cameraDenied' : 'barcode.unsupported');
          if (reason === 'unsupported') fallback = true;
          setBusy(false);
          paint();
        },
      }).then((handle) => {
        if (handle) {
          live = handle;
          return;
        }
        // Sin camara: ocultar el visor y, si procede, caer a la foto.
        hideViewer();
        if (!detected && fallback) host.querySelector<HTMLInputElement>('#barcode-input')?.click();
      });
    };

    host.querySelector('#barcode-scan')?.addEventListener('click', beginScan);
    stopButton?.addEventListener('click', () => {
      stopScan();
      setStatus(null);
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
    void updatePackHint();
  };

  const refresh = (): void => {
    if (!root) mount();
    else paint();
  };

  refresh();

  return { refresh, prepare: () => void ensurePack() };
}
