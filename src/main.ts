import './style.css';
import {
  applyAlternative,
  carbsByMoment,
  dayCarbs,
  dayTimeline,
  deleteInsulin,
  deleteMeal,
  emptyVault,
  fromJson,
  itemCarbs,
  loadVault,
  mealCarbs,
  mealsForDate,
  mergeDetections,
  MOMENTS,
  portionGrams,
  PORTION_SIZES,
  putInsulin,
  putMeal,
  recentClassIds,
  replaceVault,
  roundCarbs,
  scaleGrams,
  selectableTopk,
  targetProgress,
  toJson,
  weekBreakdown,
} from './core';
import type { FoodItem, InsulinKind, InsulinLog, Meal, PortionSize, Vault, WeekDay } from './core';
import { CATALOG, searchFoods } from './catalog';
import type { Food } from './catalog';
import { detectLocale, isLocale, isStringKey, storeLocale, t } from './i18n';
import type { Locale, StringKey } from './i18n';
import { prepareImage } from './capture/image';
import type { CapturedImage } from './capture/image';
import { createDetectionClient } from './model';
import { suggestPortion, suggestPortions } from './model/portion';
import type { DetectionClient, DetectionResult, InferencePhase, TopKEntry } from './model';
import { decryptVault, encryptVault, isEncrypted } from './export/crypto';
import { setupInsulin } from './insulin';
import type { InsulinHandle } from './insulin';
import { isChatEnabled, setChatDisabled, setChatEnabled, setupChat } from './chat';
import type { ChatHandle } from './chat';
import { setupBarcode } from './barcode';
import type { BarcodeAdd, BarcodeHandle } from './barcode';
import { cropToJpeg } from './contrib/crop';
import {
  addContribution,
  canRetry,
  clearContributions,
  listContributions,
  markFailed,
  markSent,
} from './contrib/queue';
import { buildBundle } from './contrib/bundle';
import { DEFAULT_ENDPOINT, uploadBundle } from './contrib/upload';

interface Draft {
  origin: 'manual' | 'photo';
  items: FoodItem[];
}

let locale: Locale = detectLocale();

const APP_VERSION = '0.0.0';
const CONTRIB_AUTO_KEY = 'carbos.contrib.auto';
const CONTRIB_ENDPOINT_KEY = 'carbos.contrib.endpoint';
const CONTRIB_BATCH = 50;

/** Evita que dos flush (arranque + evento online) suban el mismo lote a la vez. */
let contributing = false;

function readContribAuto(): boolean {
  try {
    return localStorage.getItem(CONTRIB_AUTO_KEY) === '1';
  } catch {
    return false;
  }
}

function writeContribAuto(enabled: boolean): void {
  try {
    localStorage.setItem(CONTRIB_AUTO_KEY, enabled ? '1' : '0');
  } catch {
    /* almacenamiento no disponible */
  }
}

/** Endpoint configurable (spec 15); por defecto el Worker de Cloudflare. */
function readContribEndpoint(): string {
  try {
    return localStorage.getItem(CONTRIB_ENDPOINT_KEY) || DEFAULT_ENDPOINT;
  } catch {
    return DEFAULT_ENDPOINT;
  }
}

/**
 * El dia mostrado se recuerda para no perderlo al recargar. Sin esto la vista
 * vuelve a "hoy" y las comidas registradas en otro dia parecen no haberse
 * guardado. `sessionStorage` sobrevive a la recarga pero no a una apertura
 * nueva, donde se vuelve a "hoy".
 */
const VIEW_DATE_KEY = 'carbos.viewDate';
const VIEW_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

/**
 * Atajos de calidad de vida (D59): ids de alimentos marcados como favoritos por
 * la persona. Son un ajuste de UI (no dominio): viven en `localStorage` y no
 * tocan el esquema. Los recientes no se almacenan; se derivan del diario.
 */
const FAVORITES_KEY = 'carbos.favorites';
const QUICKADD_LIMIT = 8;

function readFavorites(): string[] {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function writeFavorites(ids: readonly string[]): void {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(ids));
  } catch {
    /* almacenamiento no disponible */
  }
}

function isFavorite(id: string): boolean {
  return readFavorites().includes(id);
}

function toggleFavorite(id: string): void {
  const ids = readFavorites();
  const index = ids.indexOf(id);
  if (index >= 0) ids.splice(index, 1);
  else ids.push(id);
  writeFavorites(ids);
}

/**
 * Objetivo diario de carbohidratos (D60): un ajuste de UI con **el numero de la
 * persona**. Vacio, no numerico o `<= 0` significa "sin objetivo".
 */
const DAILY_TARGET_KEY = 'carbos.dailyTarget';

function readDailyTarget(): number {
  try {
    const raw = localStorage.getItem(DAILY_TARGET_KEY);
    const value = raw === null ? Number.NaN : Number(raw);
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

function writeDailyTarget(value: number): void {
  try {
    if (value > 0) localStorage.setItem(DAILY_TARGET_KEY, String(value));
    else localStorage.removeItem(DAILY_TARGET_KEY);
  } catch {
    /* almacenamiento no disponible */
  }
}

function readViewDate(): string | null {
  try {
    const stored = sessionStorage.getItem(VIEW_DATE_KEY);
    return stored && VIEW_DATE_RE.test(stored) ? stored : null;
  } catch {
    return null;
  }
}

function storeViewDate(isoDate: string): void {
  try {
    sessionStorage.setItem(VIEW_DATE_KEY, isoDate);
  } catch {
    /* almacenamiento no disponible */
  }
}

let currentDate = readViewDate() ?? today();
let insulin: InsulinHandle | null = null;
let chat: ChatHandle | null = null;
let barcode: BarcodeHandle | null = null;

/** Mensajes de estado: se guarda la clave para poder retraducirlos. */
const statusKeys = new Map<string, StringKey>();

function setStatus(id: string, key: StringKey): void {
  byId(id).textContent = tr(key);
  statusKeys.set(id, key);
}

function relocalizeStatuses(): void {
  for (const [id, key] of statusKeys) byId(id).textContent = tr(key);
}

/** Borra un mensaje de estado y lo saca del mapa de retraduccion. */
function clearStatus(id: string): void {
  byId(id).textContent = '';
  statusKeys.delete(id);
}
let draft: Draft = { origin: 'manual', items: [] };
/** Comida registrada que se esta editando (null = se crea una nueva). */
let editingMeal: Meal | null = null;
/** Hay una repeticion (D61) en el borrador: cancelable, pero es una comida nueva. */
let repeatPending = false;
let capture: CapturedImage | null = null;
let vault: Vault = emptyVault();

const MODEL_MANIFEST_URL = new URL('model-manifest.json', document.baseURI).href;
const MODEL_CACHE = 'carbos-models-v1';
const PHASE_KEYS: Record<InferencePhase, StringKey> = {
  manifest: 'model.manifest',
  downloading: 'model.downloading',
  verifying: 'model.verifying',
  session: 'model.session',
  detecting: 'photo.detecting',
  classifying: 'photo.classifying',
};

let detections: DetectionResult[] = [];
let detectionDraftIds: string[] = [];
let detectionEngine = '';
let detectionMeta: { detector: string; classifier: string } | null = null;
let photoStatusKey: StringKey | null = null;
let detectAbort: AbortController | null = null;
let detectionClient: DetectionClient | null = null;
/** La entrada escalonada de las cajas corre solo al resolver la deteccion (B2). */
let animateDetectBoxes = false;

/** Resetea el estado de deteccion (un solo dueno; evita el shotgun surgery). */
function clearDetections(): void {
  detections = [];
  detectionDraftIds = [];
  detectionMeta = null;
  detectionEngine = '';
}

/**
 * Hook estrecho para el arnes E2E (mismo patron que `__carbosChatStub`): si
 * `globalThis.__carbosDetectionStub` esta definido, se usa en lugar del worker
 * real. Si no, es completamente inerte.
 */
function getDetectionClient(): DetectionClient {
  if (!detectionClient) {
    const stub = (globalThis as { __carbosDetectionStub?: DetectionClient | null })
      .__carbosDetectionStub;
    detectionClient = stub ?? createDetectionClient();
  }
  return detectionClient;
}

function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Elemento no encontrado: #${id}`);
  return node as T;
}

/** Fecha local en ISO (YYYY-MM-DD). `toISOString` desplaza de dia fuera de UTC. */
function isoDay(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function today(): string {
  return isoDay(new Date());
}

/** Hora local en HH:MM, con ceros a la izquierda. */
function nowTime(): string {
  const date = new Date();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function uid(): string {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
}

function tr(key: StringKey): string {
  return t(locale, key);
}

const app = byId('app');
app.innerHTML = `
  <section id="onboarding" class="onboarding" hidden role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
    <h2 id="onboarding-title" data-i18n="onboarding.title"></h2>
    <ol>
      <li>
        <strong data-i18n="onboarding.privacyTitle"></strong>
        <p data-i18n="onboarding.privacyBody"></p>
      </li>
      <li>
        <strong data-i18n="onboarding.storageTitle"></strong>
        <p data-i18n="onboarding.storageBody"></p>
      </li>
      <li>
        <strong data-i18n="onboarding.scopeTitle"></strong>
        <p data-i18n="onboarding.scopeBody"></p>
      </li>
    </ol>
    <button id="onboarding-start" type="button" class="primary" data-i18n="onboarding.start"></button>
  </section>

  <header class="topbar">
    <div class="bar">
      <h1>Carbos</h1>
      <label class="lang">
        <span data-i18n="nav.language"></span>
        <select id="locale"></select>
      </label>
    </div>
    <p class="tagline muted" data-i18n="app.tagline"></p>
    <div class="day-summary">
      <output id="day-total" class="total" aria-live="polite"></output>
      <div
        id="target-progress"
        class="target-progress"
        hidden
        role="progressbar"
        aria-valuemin="0"
        aria-valuemax="0"
        aria-valuenow="0"
        data-i18n-aria="target.progress"
      >
        <span class="target-bar" aria-hidden="true"><span id="target-fill" class="target-fill"></span></span>
        <output id="target-text" class="target-text"></output>
      </div>
      <span class="chip"><span data-i18n="diary.week"></span>: <output id="week-total"></output></span>
      <ul id="week-bars" class="week-bars"></ul>
    </div>
    <label class="sr-only" for="date" data-i18n="field.date"></label>
    <div class="row daynav">
      <button id="day-prev" type="button" data-i18n-aria="nav.prevDay">\u2039</button>
      <input id="date" type="date" />
      <button id="day-next" type="button" data-i18n-aria="nav.nextDay">\u203a</button>
      <button id="day-today" type="button" data-i18n="nav.today"></button>
    </div>
    <p id="header-disclaimer" class="header-disclaimer" role="note" data-i18n="footer.disclaimerShort"></p>
  </header>

  <nav id="section-nav" class="section-nav" data-i18n-aria="nav.label">
    <a class="nav-item" href="#entry" data-target="entry"><svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="22" height="22" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg><span class="nav-text" data-i18n="nav.add"></span><span class="nav-indicator" data-nav-indicator aria-hidden="true"></span></a>
    <a class="nav-item" href="#s-diario" data-target="s-diario"><svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="22" height="22" aria-hidden="true"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg><span class="nav-text" data-i18n="nav.diary"></span><span class="nav-indicator" data-nav-indicator aria-hidden="true"></span></a>
    <a class="nav-item" href="#s-insulina" data-target="s-insulina"><svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="22" height="22" aria-hidden="true"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"></path></svg><span class="nav-text" data-i18n="nav.insulin"></span><span class="nav-indicator" data-nav-indicator aria-hidden="true"></span></a>
    <a class="nav-item" href="#s-ajustes" data-target="s-ajustes"><svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="22" height="22" aria-hidden="true"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line></svg><span class="nav-text" data-i18n="nav.settings"></span><span class="nav-indicator" data-nav-indicator aria-hidden="true"></span></a>
  </nav>

  <main>
  <fieldset id="entry" class="card entry">
    <legend id="entry-legend" data-i18n="section.addFood"></legend>
    <h2 class="sr-only" data-i18n="section.addFood"></h2>
    <div class="segmented" role="radiogroup" aria-labelledby="entry-legend">
      <label class="seg">
        <input type="radio" name="entry-mode" id="entry-mode-photo" checked />
        <span data-i18n="section.photo"></span>
      </label>
      <label class="seg">
        <input type="radio" name="entry-mode" id="entry-mode-search" />
        <span data-i18n="button.search"></span>
      </label>
      <label class="seg">
        <input type="radio" name="entry-mode" id="entry-mode-barcode" />
        <span data-i18n="entry.barcode"></span>
      </label>
    </div>
    <div id="photo-panel" class="entry-panel">
      <div id="photo-wrap" class="preview-wrap" hidden>
        <img id="photo-preview" class="preview" alt="" />
        <div id="detect-overlay" class="detect-overlay" aria-hidden="true"></div>
      </div>
      <p id="photo-status" class="muted" data-i18n="photo.none" aria-live="polite"></p>
      <div class="row">
        <label class="btn"><input id="camera-input" class="sr-only" type="file" accept="image/*" capture="environment" data-i18n-aria="button.takePhoto" /><span data-i18n="button.takePhoto"></span></label>
        <label class="btn"><input id="file-input" class="sr-only" type="file" accept="image/*" data-i18n-aria="button.chooseFile" /><span data-i18n="button.chooseFile"></span></label>
      </div>
      <p class="muted" data-i18n="text.photoNote"></p>
      <div id="detect-panel" hidden>
        <p id="detect-summary" class="muted" aria-live="polite"></p>
        <h3 data-i18n="photo.detected"></h3>
        <ul id="detect-results" class="draft"></ul>
        <p class="muted" data-i18n="photo.resultsNote"></p>
      </div>
      <p><button id="share-photo" type="button" data-i18n="contrib.share" hidden></button></p>
      <p id="share-status" class="muted" aria-live="polite"></p>
    </div>
    <div id="search-panel" class="entry-panel" hidden>
      <div id="quickadd" class="quickadd" hidden></div>
      <label for="food-search" data-i18n="field.search"></label>
      <div class="row">
        <input id="food-search" type="search" autocomplete="off" />
      </div>
      <ul id="search-results" class="results"></ul>
    </div>
    <div id="barcode-panel" class="entry-panel" hidden></div>
    <p id="draft-editing" class="notice" role="status" data-i18n="diary.editing" hidden></p>
    <h3 data-i18n="draft.items"></h3>
    <ul id="draft-items" class="draft"></ul>
    <p><span data-i18n="label.total"></span>: <output id="draft-total" aria-live="polite"></output></p>
    <div class="row">
      <button id="register" type="button" class="primary" data-i18n="button.register"></button>
      <button id="register-cancel" type="button" data-i18n="button.cancel" hidden></button>
    </div>
    <p id="register-status" class="muted" aria-live="polite"></p>
    <p class="muted" data-i18n="text.estimateNote"></p>
  </fieldset>

  <fieldset class="card" id="s-diario">
    <legend data-i18n="section.diary"></legend>
    <h2 class="sr-only" data-i18n="section.diary"></h2>
    <div id="diary-summary" class="diary-summary">
      <p class="summary-row summary-total"><span data-i18n="summary.total"></span><strong class="summary-carbs"><output id="summary-carbs"></output></strong></p>
      <p class="summary-row summary-target" id="summary-target-row" hidden><span data-i18n="summary.target"></span><output id="summary-target" class="summary-count"></output></p>
      <p class="summary-row"><output id="summary-meals" class="summary-count"></output><span data-i18n="summary.meals"></span></p>
      <p class="summary-row"><output id="summary-insulin" class="summary-count"></output><span data-i18n="summary.insulin"></span></p>
      <ul class="moment-breakdown">
        <li class="moment"><span data-i18n="moment.morning"></span><output class="moment-carbs" data-moment="morning"></output></li>
        <li class="moment"><span data-i18n="moment.afternoon"></span><output class="moment-carbs" data-moment="afternoon"></output></li>
        <li class="moment"><span data-i18n="moment.evening"></span><output class="moment-carbs" data-moment="evening"></output></li>
      </ul>
    </div>
    <ul id="diary"></ul>
  </fieldset>

  <fieldset class="card" id="s-insulina">
    <legend data-i18n="section.insulinLog"></legend>
    <h2 class="sr-only" data-i18n="section.insulinLog"></h2>
    <p class="muted" data-i18n="insulin.note"></p>
    <div class="grid">
      <label><span data-i18n="field.time"></span><input id="ins-time" type="time" /></label>
      <label><span data-i18n="field.units"></span><input id="ins-units" type="number" inputmode="decimal" min="0" step="0.1" value="0" /></label>
      <label><span data-i18n="field.kind"></span>
        <select id="ins-kind">
          <option value="bolus" data-i18n="kind.bolus"></option>
          <option value="basal" data-i18n="kind.basal"></option>
        </select>
      </label>
    </div>
    <p><button id="add-insulin" type="button" data-i18n="button.addInsulin"></button></p>
  </fieldset>

  <p id="export-reminder" class="notice" role="status" hidden></p>

  <details class="card">
    <summary data-i18n="section.copy"></summary>
    <h2 class="sr-only" data-i18n="section.copy"></h2>
    <label for="export-pass" data-i18n="export.passwordPrompt"></label>
    <input id="export-pass" type="password" autocomplete="new-password" />
    <p class="muted" data-i18n="export.passwordHint"></p>
    <div class="row">
      <button id="export" type="button" data-i18n="button.exportJson"></button>
      <button id="export-enc" type="button" data-i18n="button.exportEncrypted"></button>
      <label class="btn"><input id="import" class="sr-only" type="file" accept="application/json,.json,.carbos" data-i18n-aria="button.import" /><span data-i18n="button.import"></span></label>
    </div>
    <p id="copy-status" class="muted" aria-live="polite"></p>
    <p class="muted" data-i18n="storage.notice"></p>
  </details>

  <div id="s-ajustes" class="settings-anchor">
  <details class="card" id="settings">
    <summary data-i18n="section.settings"></summary>
    <h2 class="sr-only" data-i18n="section.settings"></h2>
    <label class="field daily-target-field"><span data-i18n="settings.dailyTarget"></span><input id="daily-target" type="number" min="0" step="1" inputmode="numeric" /></label>
    <p><button id="persist" type="button" data-i18n="button.persist"></button></p>
    <p id="persist-status" class="muted" aria-live="polite"></p>
    <label class="check"><input id="insulin-toggle" type="checkbox" /> <span data-i18n="settings.insulinModule"></span></label>
    <div id="insulin-host" hidden></div>
    <label class="check"><input id="chat-toggle" type="checkbox" /> <span data-i18n="settings.chatModule"></span></label>
    <div id="chat-host" hidden></div>
    <label class="check"><input id="contrib-toggle" type="checkbox" /> <span data-i18n="settings.contribAuto"></span></label>
    <p id="contrib-status" class="muted" aria-live="polite" data-i18n="contrib.none"></p>
    <p><button id="contrib-clear" type="button" data-i18n="contrib.clear"></button></p>
    <p class="muted" data-i18n="contrib.note"></p>
  </details>
  </div>
  </main>

  <footer>
    <p class="notice" role="note" data-i18n="footer.disclaimer"></p>
  </footer>
  <div class="page-tail" aria-hidden="true"></div>
`;

const localeSelect = byId<HTMLSelectElement>('locale');
localeSelect.innerHTML = ['es', 'en']
  .map((code) => `<option value="${code}">${code.toUpperCase()}</option>`)
  .join('');

function applyI18n(): void {
  for (const node of app.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const key = node.dataset.i18n;
    if (key && isStringKey(key)) node.textContent = tr(key);
  }
  for (const node of app.querySelectorAll<HTMLInputElement>('[data-i18n-ph]')) {
    const key = node.dataset.i18nPh;
    if (key && isStringKey(key)) node.placeholder = tr(key);
  }
  for (const node of app.querySelectorAll<HTMLElement>('[data-i18n-aria]')) {
    const key = node.dataset.i18nAria;
    if (key && isStringKey(key)) node.setAttribute('aria-label', tr(key));
  }
  document.documentElement.lang = locale;
  document.title = tr('app.title');
  const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (description) description.content = tr('app.tagline');
  const manifest = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  if (manifest) {
    manifest.href = locale === 'en' ? './manifest.en.webmanifest' : './manifest.webmanifest';
  }
}

function downloadText(filename: string, text: string, type: string): void {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function addFoodToDraft(food: Food): void {
  draft.items.push({
    id: uid(),
    name: food.name[locale],
    grams: food.defaultPortionGrams,
    carbsPer100g: food.carbsPer100g,
    classId: food.id,
  });
  renderDraft();
}

/**
 * Escaneo (spec 17): empuja el producto resuelto al borrador con origen manual y
 * **resetea** las detecciones, de modo que una foto anterior no contamine la
 * confianza ni dispare el auto-compartir. La procedencia va en `FoodItem.barcode`.
 */
function pushBarcodeItem(product: BarcodeAdd): void {
  // Cancela una deteccion de foto en vuelo: si no, al resolverla rellenaria
  // `detections` y el registro contaria una confianza/modelo de una foto ajena.
  detectAbort?.abort();
  draft.items.push({
    id: uid(),
    name: product.name,
    grams: product.grams,
    carbsPer100g: product.carbsPer100g,
    barcode: product.barcode,
    brand: product.brand,
  });
  draft.origin = 'manual';
  clearDetections();
  renderDraft();
}

function actionButton(key: StringKey, name: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = tr(key);
  button.setAttribute('aria-label', `${tr(key)} ${name}`);
  button.addEventListener('click', onClick);
  return button;
}

function portionKey(size: PortionSize): StringKey {
  return `portion.${size}`;
}

/** Estrella de favorito (D59) del resultado de busqueda; persiste y repinta. */
function favoriteStar(food: Food): HTMLButtonElement {
  const star = document.createElement('button');
  star.type = 'button';
  star.className = 'fav-toggle';
  const paint = (): void => {
    const on = isFavorite(food.id);
    star.setAttribute('aria-pressed', String(on));
    star.setAttribute(
      'aria-label',
      `${tr(on ? 'quickadd.unfavorite' : 'quickadd.favorite')}: ${food.name[locale]}`,
    );
    star.textContent = on ? '★' : '☆';
  };
  paint();
  star.addEventListener('click', () => {
    toggleFavorite(food.id);
    paint();
    renderQuickAdd();
  });
  return star;
}

function renderSearch(): void {
  const query = byId<HTMLInputElement>('food-search').value;
  const list = byId('search-results');
  if (query.trim().length < 2) {
    list.innerHTML = `<li class="muted">${tr('search.hint')}</li>`;
    return;
  }
  const results = searchFoods(query, 8, CATALOG);
  if (results.length === 0) {
    list.innerHTML = `<li class="muted" data-i18n="search.noResults">${tr('search.noResults')}</li>`;
    return;
  }
  list.innerHTML = '';
  for (const food of results) {
    const item = document.createElement('li');
    item.className = 'result-row';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'result';
    button.textContent = `${food.name[locale]} · ${food.carbsPer100g} ${tr('unit.grams')}/100 ${tr('unit.grams')}`;
    button.addEventListener('click', () => {
      addFoodToDraft(food);
      byId<HTMLInputElement>('food-search').value = '';
      list.innerHTML = '';
    });
    item.append(button, favoriteStar(food));
    list.appendChild(item);
  }
}

/** Un grupo de atajos (titulo + chips) del bloque de quick-add (D59). */
function quickAddGroup(titleKey: StringKey, foods: readonly Food[]): HTMLElement {
  const group = document.createElement('div');
  group.className = 'quickadd-group';
  group.appendChild(i18nEl('p', titleKey, 'quickadd-title'));
  const list = document.createElement('ul');
  list.className = 'quickadd-list';
  for (const food of foods) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'quickadd-chip';
    button.textContent = food.name[locale];
    button.addEventListener('click', () => addFoodToDraft(food));
    item.appendChild(button);
    list.appendChild(item);
  }
  group.appendChild(list);
  return group;
}

/**
 * Atajos de un toque (D59): favoritos (marcados a mano) y recientes (derivados
 * del diario, patron D57). Se oculta si no hay ninguno, para no dejar ruido.
 */
function renderQuickAdd(): void {
  const host = byId('quickadd');
  const favorites = readFavorites()
    .map((id) => foodById(id))
    .filter((food): food is Food => food !== undefined);
  const recents = recentClassIds(vault.meals, QUICKADD_LIMIT)
    .map((id) => foodById(id))
    .filter((food): food is Food => food !== undefined);
  host.textContent = '';
  if (favorites.length === 0 && recents.length === 0) {
    host.hidden = true;
    return;
  }
  host.hidden = false;
  if (favorites.length > 0) host.appendChild(quickAddGroup('quickadd.favorites', favorites));
  if (recents.length > 0) host.appendChild(quickAddGroup('quickadd.recents', recents));
}

function renderDraft(): void {
  const list = byId('draft-items');
  if (draft.items.length === 0) {
    list.innerHTML = `<li class="muted">${tr('draft.empty')}</li>`;
  } else {
    list.innerHTML = '';
    draft.items.forEach((item, index) => {
      const row = document.createElement('li');
      row.className = 'draft-row';
      const name = document.createElement('span');
      name.className = 'draft-name';
      name.textContent = item.name;
      const gramsLabel = document.createElement('label');
      const grams = document.createElement('input');
      grams.type = 'number';
      grams.min = '0';
      grams.step = '1';
      grams.inputMode = 'decimal';
      grams.value = String(item.grams);
      grams.setAttribute('aria-label', tr('field.grams'));
      grams.addEventListener('change', () => {
        item.grams = Math.max(0, Number.parseFloat(grams.value) || 0);
        renderDraft();
      });
      gramsLabel.append(grams, document.createTextNode(` ${tr('unit.grams')}`));
      // Un item escaneado que no esta en el catalogo no trae carbohidratos
      // fiables: se dejan editar por 100 g para no registrar un 0 en silencio.
      const food = foodById(item.classId);
      if (item.barcode !== undefined && !food) {
        const carbsLabel = document.createElement('label');
        const carbs = document.createElement('input');
        carbs.type = 'number';
        carbs.min = '0';
        carbs.step = '0.1';
        carbs.inputMode = 'decimal';
        carbs.value = String(item.carbsPer100g);
        carbs.setAttribute('aria-label', tr('field.carbsPer100g'));
        carbs.addEventListener('change', () => {
          item.carbsPer100g = Math.max(0, Number.parseFloat(carbs.value) || 0);
          renderDraft();
        });
        carbsLabel.append(carbs, document.createTextNode(` ${tr('field.carbsPer100g')}`));
        const total = document.createElement('span');
        total.className = 'muted';
        total.textContent = `${roundCarbs(itemCarbs(item))} ${tr('unit.grams')}`;
        row.append(name, gramsLabel, carbsLabel, total);
      } else {
        const carbs = document.createElement('span');
        carbs.className = 'muted';
        carbs.textContent = `${roundCarbs(itemCarbs(item))} ${tr('unit.grams')}`;
        row.append(name, gramsLabel, carbs);
      }

      if (food) {
        const portions = document.createElement('div');
        portions.className = 'draft-portions';
        for (const size of PORTION_SIZES) {
          portions.appendChild(
            actionButton(portionKey(size), item.name, () => {
              item.grams = portionGrams(food.defaultPortionGrams, size);
              renderDraft();
            }),
          );
        }
        row.appendChild(portions);
      }

      const shortcuts = document.createElement('div');
      shortcuts.className = 'draft-shortcuts';
      shortcuts.append(
        actionButton('button.half', item.name, () => {
          item.grams = scaleGrams(item.grams, 0.5);
          renderDraft();
        }),
        actionButton('button.double', item.name, () => {
          item.grams = scaleGrams(item.grams, 2);
          renderDraft();
        }),
      );
      row.appendChild(shortcuts);

      const detectionIndex = detectionDraftIds.indexOf(item.id);
      const result = detectionIndex >= 0 ? detections[detectionIndex] : undefined;
      const alternatives = result ? selectableTopk(result.topk) : [];
      if (alternatives.length > 1) {
        const select = document.createElement('select');
        select.className = 'detect-alt';
        select.setAttribute('aria-label', tr('button.change'));
        alternatives.forEach((entry, altIndex) => {
          const option = document.createElement('option');
          option.value = String(altIndex);
          option.textContent = `${topkLabel(entry)} ${Math.round(entry.p * 100)}%`;
          select.appendChild(option);
        });
        select.addEventListener('change', () => {
          const chosen = alternatives[Number(select.value)];
          if (chosen) chooseDetection(detectionIndex, chosen);
        });
        row.appendChild(select);
      }

      const remove = actionButton('button.remove', item.name, () => {
        draft.items.splice(index, 1);
        renderDraft();
      });
      remove.className = 'remove';
      row.appendChild(remove);
      list.appendChild(row);
    });
  }
  const total = draft.items.reduce((sum, item) => sum + itemCarbs(item), 0);
  byId('draft-total').textContent = `${roundCarbs(total)} ${tr('unit.grams')}`;
  const editing = editingMeal !== null;
  byId<HTMLButtonElement>('register').textContent = tr(editing ? 'button.save' : 'button.register');
  byId<HTMLButtonElement>('register-cancel').hidden = !(editing || repeatPending);
  byId('draft-editing').hidden = !editing;
  renderOverlay();
}

function setPhotoStatus(key: StringKey | null): void {
  photoStatusKey = key;
  byId('photo-status').textContent = tr(key ?? 'photo.ready');
}

function renderPhoto(): void {
  const wrap = byId('photo-wrap');
  const preview = byId<HTMLImageElement>('photo-preview');
  const status = byId('photo-status');
  if (capture) {
    preview.src = capture.dataUrl;
    preview.alt = tr('photo.previewAlt');
    preview.hidden = false;
    wrap.hidden = false;
    status.textContent = tr(photoStatusKey ?? 'photo.ready');
  } else {
    preview.hidden = true;
    preview.alt = '';
    preview.removeAttribute('src');
    wrap.hidden = true;
    status.textContent = tr(photoStatusKey ?? 'photo.none');
  }
  renderOverlay();
  updateShareButton();
}

/** Colores de los contornos; se repiten si hay mas detecciones. */
const BOX_COLORS = ['#16a34a', '#2563eb', '#db2777', '#d97706', '#7c3aed', '#0891b2'];

/**
 * Elige el color de texto (negro o blanco) con mayor contraste WCAG sobre la
 * paleta de la caja. Ni el blanco ni el negro solos llegan a 4.5:1 en las seis
 * paletas, asi que la eleccion es por color (F del pase v2).
 */
function boxLabelInk(hex: string): string {
  const channel = (offset: number): number => parseInt(hex.slice(offset, offset + 2), 16) / 255;
  const linear = (value: number): number =>
    value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  const luminance =
    0.2126 * linear(channel(1)) + 0.7152 * linear(channel(3)) + 0.0722 * linear(channel(5));
  const onWhite = 1.05 / (luminance + 0.05);
  const onBlack = (luminance + 0.05) / 0.05;
  return onWhite >= onBlack ? '#ffffff' : '#000000';
}

/** Dibuja la caja (contorno + etiqueta con nombre y gramos) de cada deteccion. */
function renderOverlay(): void {
  const overlay = byId('detect-overlay');
  overlay.innerHTML = '';
  if (!capture) return;
  const entering = animateDetectBoxes;
  detections.forEach((result, index) => {
    const itemId = detectionDraftIds[index];
    const item = itemId ? draft.items.find((candidate) => candidate.id === itemId) : undefined;
    const food = foodById(result.classId);
    const box = result.box;
    const el = document.createElement('div');
    el.className = 'detect-box';
    el.style.setProperty('--i', String(index));
    if (entering) el.classList.add('detect-box--enter');
    if (box.y < 0.12) el.classList.add('detect-box--flip');
    const boxColor = BOX_COLORS[index % BOX_COLORS.length] ?? '#16a34a';
    el.style.setProperty('--box-color', boxColor);
    el.style.left = `${box.x * 100}%`;
    el.style.top = `${box.y * 100}%`;
    el.style.width = `${box.w * 100}%`;
    el.style.height = `${box.h * 100}%`;
    const label = document.createElement('span');
    label.className = 'detect-box-label';
    label.classList.toggle('ink', boxLabelInk(boxColor) === '#000000');
    const name = item?.name ?? (food ? food.name[locale] : tr('unknown.food'));
    const grams = item ? ` · ${Math.round(item.grams)} ${tr('unit.grams')}` : '';
    label.textContent = `${name}${grams}`;
    el.appendChild(label);
    overlay.appendChild(el);
  });
}

function updateShareButton(): void {
  const confirmed = draft.items.some(
    (item) => Boolean(item.classId) && detectionDraftIds.includes(item.id),
  );
  byId<HTMLButtonElement>('share-photo').hidden = !(capture && confirmed);
}

async function enqueueFrom(
  image: CapturedImage | null,
  dets: DetectionResult[],
  ids: string[],
  items: FoodItem[],
): Promise<number> {
  if (!image) return 0;
  let queued = 0;
  for (let index = 0; index < ids.length; index += 1) {
    const id = ids[index];
    if (!id) continue;
    const detection = dets[index];
    const item = items.find((candidate) => candidate.id === id);
    if (!detection || !item?.classId) continue;
    try {
      const blob = await cropToJpeg(image, detection.box);
      await addContribution({ classId: item.classId, blob });
      queued += 1;
    } catch {
      /* recorte o encolado fallido: seguimos con el resto */
    }
  }
  return queued;
}

async function renderContribStatus(): Promise<void> {
  try {
    const count = (await listContributions()).filter((record) => canRetry(record)).length;
    byId('contrib-status').textContent =
      count > 0 ? `${count} - ${tr('contrib.queueLabel')}` : tr('contrib.none');
  } catch {
    /* almacenamiento no disponible */
  }
}

async function flushContributions(announce = false): Promise<void> {
  if (contributing) return;
  contributing = true;
  if (announce) setStatus('share-status', 'contrib.uploading');
  try {
    // pending + failed reintentables: un fallo no es terminal hasta agotar intentos.
    const queue = (await listContributions()).filter((record) => canRetry(record));
    let sent = 0;
    let failed = 0;
    for (let start = 0; start < queue.length; start += CONTRIB_BATCH) {
      const batch = queue.slice(start, start + CONTRIB_BATCH);
      if (batch.length === 0) continue;
      try {
        const images = await Promise.all(
          batch.map(async (record) => ({
            classId: record.classId,
            data: new Uint8Array(await record.blob.arrayBuffer()),
          })),
        );
        const zip = await buildBundle(images, {
          appVersion: APP_VERSION,
          // El consentimiento es el momento de encolar, no el del reintento.
          grantedAt: new Date(Math.min(...batch.map((record) => record.createdAt))).toISOString(),
        });
        const result = await uploadBundle(zip, { endpoint: readContribEndpoint() });
        if (result.ok) sent += batch.length;
        else failed += batch.length;
        const settle = result.ok ? markSent : markFailed;
        await Promise.all(batch.map((record) => settle(record.id)));
      } catch {
        failed += batch.length;
        await Promise.all(batch.map((record) => markFailed(record.id))).catch(() => undefined);
      }
    }
    if (announce && failed === 0 && sent > 0) setStatus('share-status', 'contrib.sent');
    else if (failed > 0) setStatus('share-status', 'contrib.shareFailed');
    await renderContribStatus();
  } catch {
    if (announce) setStatus('share-status', 'contrib.shareFailed');
  } finally {
    contributing = false;
  }
}

function foodById(id: string | null | undefined): Food | undefined {
  if (!id) return undefined;
  return CATALOG.foods.find((food) => food.id === id);
}

function pushFood(food: Food, grams = food.defaultPortionGrams): string {
  const id = uid();
  draft.items.push({
    id,
    name: food.name[locale],
    grams,
    carbsPer100g: food.carbsPer100g,
    classId: food.id,
  });
  return id;
}

function topkLabel(entry: TopKEntry): string {
  const food = foodById(entry.classId);
  return food ? food.name[locale] : tr('unknown.food');
}

function chooseDetection(index: number, entry: TopKEntry): void {
  const food = foodById(entry.classId);
  if (!food) return;
  const existingId = detectionDraftIds[index];
  const item = existingId
    ? draft.items.find((candidate) => candidate.id === existingId)
    : undefined;
  if (item) {
    const position = draft.items.indexOf(item);
    draft.items[position] = applyAlternative(item, {
      id: food.id,
      name: food.name[locale],
      carbsPer100g: food.carbsPer100g,
    });
  } else {
    const box = detections[index]?.box;
    const grams = box ? suggestPortion(box, food.defaultPortionGrams).grams : undefined;
    detectionDraftIds[index] = pushFood(food, grams);
  }
  renderDraft();
  renderDetect();
}

function applyDetections(results: DetectionResult[]): void {
  // La porcion inicial se reparte por AREA entre los items resueltos (SPEC 18,
  // D1): sumar una porcion completa por caja sobrecuenta con varias detecciones.
  const resolved = results
    .map((result, index) => ({ result, index, food: foodById(result.classId) }))
    .filter((entry): entry is { result: DetectionResult; index: number; food: Food } =>
      Boolean(entry.food),
    );
  const grams = suggestPortions(
    resolved.map((entry) => ({
      box: entry.result.box,
      defaultGrams: entry.food.defaultPortionGrams,
    })),
  );
  detectionDraftIds = results.map(() => '');
  resolved.forEach((entry, i) => {
    detectionDraftIds[entry.index] = pushFood(entry.food, grams[i]);
  });
  animateDetectBoxes = true;
  renderDraft();
  renderDetect();
  window.requestAnimationFrame(() => {
    animateDetectBoxes = false;
  });
}

function renderDetect(): void {
  const panel = byId('detect-panel');
  const summary = byId('detect-summary');
  const list = byId('detect-results');
  updateShareButton();
  renderOverlay();
  if (detections.length === 0) {
    panel.hidden = true;
    summary.textContent = '';
    list.innerHTML = '';
    return;
  }
  panel.hidden = false;
  const engine = detectionEngine ? ` · ${tr('detect.engine')}: ${detectionEngine}` : '';
  summary.textContent = `${detections.length} · ${tr('photo.detected')}${engine}`;
  list.innerHTML = '';
  detections.forEach((result, index) => {
    const best: TopKEntry = result.topk[0] ?? {
      label: result.label,
      classId: result.classId,
      p: result.score,
    };
    const row = document.createElement('li');
    row.className = 'draft-row';
    const name = document.createElement('span');
    name.className = 'draft-name';
    // Nombre, confianza y gramos estimados: el ajuste de gramos vive en el
    // borrador compartido, pero la fila de deteccion ya anuncia la porcion (A3).
    const draftItem = detectionDraftIds[index]
      ? draft.items.find((candidate) => candidate.id === detectionDraftIds[index])
      : undefined;
    const grams = draftItem ? ` · ${Math.round(draftItem.grams)} ${tr('unit.grams')}` : '';
    name.textContent = `${topkLabel(best)} · ${Math.round(best.p * 100)}%${grams}`;
    row.appendChild(name);
    const alternatives = selectableTopk(result.topk);
    if (alternatives.length > 1) {
      const select = document.createElement('select');
      select.className = 'detect-alt';
      select.setAttribute('aria-label', tr('detect.alternatives'));
      alternatives.forEach((entry, altIndex) => {
        const option = document.createElement('option');
        option.value = String(altIndex);
        option.textContent = `${topkLabel(entry)} ${Math.round(entry.p * 100)}%`;
        select.appendChild(option);
      });
      select.addEventListener('change', () => {
        const chosen = alternatives[Number(select.value)];
        if (chosen) chooseDetection(index, chosen);
      });
      row.appendChild(select);
    }
    list.appendChild(row);
  });
}

async function startDetection(image: CapturedImage): Promise<void> {
  detectAbort?.abort();
  const controller = new AbortController();
  detectAbort = controller;
  const previous = new Set(detectionDraftIds.filter(Boolean));
  if (previous.size > 0) draft.items = draft.items.filter((item) => !previous.has(item.id));
  clearDetections();
  renderDraft();
  renderDetect();
  setPhotoStatus('photo.detecting');
  const photoSurface = byId('photo-preview');
  photoSurface.setAttribute('aria-busy', 'true');
  const statusEl = byId('photo-status');
  statusEl.classList.add('busy');
  try {
    const outcome = await getDetectionClient().detect(
      { dataUrl: image.dataUrl, width: image.width, height: image.height },
      { manifestUrl: MODEL_MANIFEST_URL, cacheName: MODEL_CACHE, signal: controller.signal },
      { onProgress: (event) => setPhotoStatus(PHASE_KEYS[event.phase]) },
    );
    if (controller.signal.aborted) return;
    const merged = mergeDetections(outcome.results);
    detections = merged;
    detectionEngine = outcome.engine;
    detectionMeta = { detector: outcome.detector, classifier: outcome.classifier };
    applyDetections(merged);
    setPhotoStatus(merged.length > 0 ? 'photo.detected' : 'photo.noItems');
  } catch (error) {
    if (
      controller.signal.aborted ||
      (error instanceof DOMException && error.name === 'AbortError')
    ) {
      return;
    }
    clearDetections();
    renderDetect();
    // Visible solo en consola: permite diagnosticar fallos del runtime sin UI.
    console.warn(
      '[detect] fallo el reconocimiento:',
      error instanceof Error ? error.message : error,
    );
    setPhotoStatus('photo.noModel');
  } finally {
    if (detectAbort === controller) {
      photoSurface.removeAttribute('aria-busy');
      statusEl.classList.remove('busy');
    }
  }
}

function renderWeekBars(days: WeekDay[]): void {
  const list = byId('week-bars');
  const max = Math.max(0, ...days.map((day) => day.carbs));
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'narrow', timeZone: 'UTC' });
  const weekdayLong = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' });
  list.setAttribute('aria-label', tr('diary.week'));

  // Reconciliacion (B4): si la semana conserva su forma (mismas fechas y
  // longitud) se actualizan los nodos existentes; reconstruir solo cuando la
  // forma cambia, para que la entrada escalonada corra unicamente entonces.
  const sameShape =
    list.children.length === days.length &&
    days.every((day, index) => {
      const item = list.children[index] as HTMLElement | undefined;
      return item?.dataset.date === day.date;
    });

  if (!sameShape) {
    list.innerHTML = '';
    days.forEach((day, index) => {
      const item = document.createElement('li');
      item.className = 'week-day';
      item.dataset.date = day.date;
      const bar = document.createElement('span');
      bar.className = 'week-bar';
      const fill = document.createElement('span');
      fill.className = 'week-fill';
      // --i alimenta el retardo escalonado de la entrada (B2).
      fill.style.setProperty('--i', String(index));
      bar.appendChild(fill);
      const label = document.createElement('span');
      label.className = 'week-label';
      label.setAttribute('aria-hidden', 'true');
      const value = document.createElement('span');
      value.className = 'sr-only';
      item.append(bar, label, value);
      list.appendChild(item);
    });
  }

  days.forEach((day, index) => {
    const item = list.children[index] as HTMLElement | undefined;
    if (!item) return;
    if (day.active) item.dataset.active = '';
    else delete item.dataset.active;
    const date = new Date(`${day.date}T00:00:00Z`);
    const fill = item.querySelector<HTMLElement>('.week-fill');
    if (fill) fill.style.setProperty('--fill', String(max > 0 ? day.carbs / max : 0));
    const label = item.querySelector<HTMLElement>('.week-label');
    if (label) label.textContent = weekday.format(date);
    const value = item.querySelector<HTMLElement>('.sr-only');
    if (value) {
      value.textContent = `${weekdayLong.format(date)} · ${roundCarbs(day.carbs)} ${tr('unit.grams')}`;
    }
  });
}

function renderToday(): void {
  const consumed = roundCarbs(dayCarbs(vault.meals, currentDate));
  byId('day-total').textContent = `${consumed} ${tr('unit.grams')}`;
  const days = weekBreakdown(vault.meals, currentDate);
  const weekTotal = days.reduce((sum, day) => sum + day.carbs, 0);
  byId('week-total').textContent = `${roundCarbs(weekTotal)} ${tr('unit.grams')}`;
  renderWeekBars(days);
  renderTarget(consumed);
}

/**
 * Progreso del objetivo (D60) en el topbar y en el resumen del Diario. Sin
 * objetivo, ambos quedan ocultos: la UI es la de SPEC 22. El texto es
 * informativo ("Restante"), nunca valorativo, y el numero es el del usuario.
 */
function renderTarget(consumed: number): void {
  const progress = byId('target-progress');
  const summaryRow = byId('summary-target-row');
  const target = readDailyTarget();
  if (target <= 0) {
    progress.hidden = true;
    summaryRow.hidden = true;
    return;
  }
  const info = targetProgress(consumed, target);
  const delta = info.over ? consumed - target : info.remaining;
  const deltaLabel = `${info.over ? tr('target.over') : tr('target.remaining')} ${roundCarbs(delta)} ${tr('unit.grams')}`;
  const amount = `${roundCarbs(consumed)} / ${target} ${tr('unit.grams')}`;
  progress.hidden = false;
  progress.setAttribute('aria-valuemax', String(target));
  progress.setAttribute('aria-valuenow', String(roundCarbs(consumed)));
  progress.setAttribute('aria-valuetext', `${amount} · ${deltaLabel}`);
  byId('target-fill').style.inlineSize = `${Math.round(info.ratio * 100)}%`;
  byId('target-text').textContent = `${amount} · ${deltaLabel}`;
  summaryRow.hidden = false;
  byId('summary-target').textContent = `${amount} · ${deltaLabel}`;
}

/**
 * Pulso de la cifra del dia al registrar correctamente (B2). El movimiento no es
 * el unico portador: "Comida registrada" (`aria-live`) lo anuncia igual.
 */
function pulseDayTotal(): void {
  const total = byId('day-total');
  total.classList.remove('pulse');
  window.requestAnimationFrame(() => total.classList.add('pulse'));
  window.setTimeout(() => total.classList.remove('pulse'), 400);
}

const SVG_UTENSILS = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13" aria-hidden="true"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/></svg>`;
const SVG_DROPLET = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13" aria-hidden="true"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>`;

/**
 * Entradas del diario expandidas en esta sesion (B5): la revelacion progresiva
 * no se persiste al recargar, pero un re-render dentro de la sesion la conserva.
 */
const expandedEntries = new Set<string>();

/** Crea un nodo cuyo texto traduce `key` y deja la clave para futuras pasadas. */
function i18nEl(tag: string, key: StringKey, className?: string): HTMLElement {
  const el = document.createElement(tag);
  if (className) el.className = className;
  el.setAttribute('data-i18n', key);
  el.textContent = tr(key);
  return el;
}

function mealName(meal: Meal): string {
  return meal.items.map((food) => food.name).join(', ') || tr('diary.meal');
}

/**
 * Control de revelacion progresiva (B5). Mantiene `aria-expanded` sincronizado
 * con `hidden` del detalle y recuerda la expansion dentro de la sesion.
 */
function createToggle(key: string, name: string, detail: HTMLElement): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'timeline-toggle';
  button.textContent = tr('diary.expand');
  button.setAttribute('aria-label', `${tr('diary.expand')} ${name}`);
  detail.hidden = !expandedEntries.has(key);
  button.setAttribute('aria-expanded', String(!detail.hidden));
  button.addEventListener('click', () => {
    const nextExpanded = detail.hidden;
    detail.hidden = !nextExpanded;
    button.setAttribute('aria-expanded', String(nextExpanded));
    if (nextExpanded) expandedEntries.add(key);
    else expandedEntries.delete(key);
  });
  return button;
}

function timeInput(value: string, onCommit: (time: string) => void): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'time';
  input.className = 'timeline-time';
  input.value = value;
  input.setAttribute('aria-label', tr('field.time'));
  input.addEventListener('change', () => {
    if (!TIME_RE.test(input.value)) {
      input.value = value;
      return;
    }
    onCommit(input.value);
  });
  return input;
}

function insulinBody(log: InsulinLog): string {
  return `${log.units} ${tr('unit.units')} · ${tr(`kind.${log.kind}` as StringKey)}`;
}

/** Botones (editar/quitar) de una entrada del diario; `id` es el nombre accesible. */
function entryActions(
  id: string,
  items: { key: StringKey; cls: string; run: () => void }[],
): HTMLDivElement {
  const wrap = document.createElement('div');
  wrap.className = 'timeline-actions';
  for (const item of items) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = item.cls;
    button.textContent = tr(item.key);
    button.setAttribute('aria-label', `${tr(item.key)} ${id}`);
    button.addEventListener('click', item.run);
    wrap.appendChild(button);
  }
  return wrap;
}

/** Deja de editar o de repetir y vacia el borrador. */
function resetEdit(): void {
  editingMeal = null;
  repeatPending = false;
  draft = { origin: 'manual', items: [] };
}

/** Carga una comida registrada en el borrador para ajustarla y guardarla. */
function startEditMeal(meal: Meal): void {
  editingMeal = meal;
  repeatPending = false;
  draft = { origin: meal.origin, items: meal.items.map((item) => ({ ...item })) };
  clearStatus('register-status');
  renderDraft();
  renderDiary();
  byId('entry').scrollIntoView({ block: 'start', behavior: 'smooth' });
}

function cancelEdit(): void {
  resetEdit();
  clearStatus('register-status');
  renderDraft();
  renderDiary();
}

/**
 * Repetir una comida (D61): clona sus items al borrador como una **comida nueva**
 * (ids nuevos, dia en vista, hora actual al registrar). No registra nada: la
 * persona confirma con Registrar. Conserva los atajos por item (D34).
 */
function repeatMeal(meal: Meal): void {
  editingMeal = null;
  repeatPending = true;
  draft = { origin: meal.origin, items: meal.items.map((item) => ({ ...item, id: uid() })) };
  // Una repeticion no hereda detecciones ni la foto pendiente de otra captura:
  // evita emparejar una imagen ajena con esta comida al registrar.
  clearDetections();
  capture = null;
  photoStatusKey = null;
  clearStatus('register-status');
  renderDraft();
  renderDiary();
  renderPhoto();
  byId('entry').scrollIntoView({ block: 'start', behavior: 'smooth' });
}

/** Quita una comida del diario (con confirmacion: es un registro de salud). */
function removeMeal(meal: Meal): void {
  if (!window.confirm(tr('diary.confirmDelete'))) return;
  void deleteMeal(meal.id).then(() => {
    if (editingMeal?.id === meal.id) resetEdit();
    return refresh();
  });
}

function removeInsulin(log: InsulinLog): void {
  if (!window.confirm(tr('diary.confirmDelete'))) return;
  void deleteInsulin(log.id).then(refresh);
}

/** Nodo de una entrada de comida (B1-B5): marcador circular, carbs protagonistas. */
function mealEntry(meal: Meal): HTMLLIElement {
  const item = document.createElement('li');
  item.className = 'timeline-entry timeline-entry--meal';

  const marker = document.createElement('span');
  marker.className = 'timeline-marker timeline-marker--meal';
  marker.setAttribute('aria-hidden', 'true');
  marker.innerHTML = SVG_UTENSILS;
  item.appendChild(marker);

  const card = document.createElement('div');
  card.className = 'timeline-card';

  const head = document.createElement('div');
  head.className = 'timeline-head';
  head.appendChild(i18nEl('span', 'diary.meal', 'timeline-kind'));
  head.appendChild(
    i18nEl(
      'span',
      meal.origin === 'photo' ? 'diary.originPhoto' : 'diary.originManual',
      'timeline-origin',
    ),
  );

  // Fila colapsada: el dato protagonista (carbs) y el control de detalle.
  const main = document.createElement('div');
  main.className = 'timeline-main';
  const carbs = document.createElement('p');
  carbs.className = 'timeline-carbs';
  const carbsOut = document.createElement('output');
  carbsOut.textContent = `${roundCarbs(mealCarbs(meal))} ${tr('unit.grams')}`;
  carbs.appendChild(carbsOut);
  main.appendChild(carbs);

  // Detalle (B5): info secundaria (chips, confianza) + hora editable + acciones.
  const detail = document.createElement('div');
  detail.className = 'timeline-detail';

  const chips = document.createElement('ul');
  chips.className = 'timeline-chips';
  for (const food of meal.items) {
    const chip = document.createElement('li');
    chip.className = 'timeline-chip';
    const name = document.createElement('span');
    name.className = 'chip-name';
    name.textContent = food.name;
    const grams = document.createElement('span');
    grams.className = 'chip-grams';
    grams.textContent = `${Math.round(food.grams)} ${tr('unit.grams')}`;
    const chipCarbs = document.createElement('span');
    chipCarbs.className = 'chip-carbs';
    chipCarbs.textContent = `${roundCarbs(itemCarbs(food))} ${tr('unit.grams')}`;
    chip.append(name, grams, chipCarbs);
    chips.appendChild(chip);
  }
  detail.appendChild(chips);

  if (meal.confidence !== null) {
    const pct = Math.round(meal.confidence * 100);
    const conf = document.createElement('p');
    conf.className = 'timeline-confidence';
    const meter = document.createElement('span');
    meter.className = 'confidence-meter';
    const fill = document.createElement('span');
    fill.className = 'confidence-fill';
    fill.style.inlineSize = `${pct}%`;
    meter.appendChild(fill);
    const label = document.createElement('span');
    label.className = 'muted';
    label.textContent = `${tr('confidence.label')}: ${pct}%`;
    conf.append(meter, label);
    detail.appendChild(conf);
  }

  detail.appendChild(
    timeInput(meal.time, (time) => {
      void putMeal({ ...meal, time }).then(refresh);
    }),
  );
  detail.appendChild(
    entryActions(mealName(meal), [
      { key: 'button.edit', cls: 'edit-entry', run: () => startEditMeal(meal) },
      { key: 'button.repeat', cls: 'repeat-entry', run: () => repeatMeal(meal) },
      { key: 'button.remove', cls: 'delete-entry', run: () => removeMeal(meal) },
    ]),
  );

  main.appendChild(createToggle(`meal:${meal.id}`, mealName(meal), detail));
  card.append(head, main, detail);
  item.appendChild(card);
  return item;
}

/** Nodo de una entrada de insulina (B1/B2): ficha fina con marcador rombo. */
function insulinEntry(log: InsulinLog): HTMLLIElement {
  const item = document.createElement('li');
  item.className = 'timeline-entry timeline-entry--insulin';

  const marker = document.createElement('span');
  marker.className = 'timeline-marker timeline-marker--insulin';
  marker.setAttribute('aria-hidden', 'true');
  marker.innerHTML = SVG_DROPLET;
  item.appendChild(marker);

  const card = document.createElement('div');
  card.className = 'timeline-card timeline-card--insulin';

  const head = document.createElement('div');
  head.className = 'timeline-head';
  head.appendChild(i18nEl('span', 'diary.insulin', 'timeline-kind'));
  const time = document.createElement('span');
  time.className = 'timeline-time-static';
  time.textContent = log.time;
  head.appendChild(time);

  const main = document.createElement('div');
  main.className = 'timeline-main';
  const body = document.createElement('p');
  body.className = 'timeline-insulin-body';
  body.textContent = insulinBody(log);
  main.appendChild(body);

  const detail = document.createElement('div');
  detail.className = 'timeline-detail';
  detail.appendChild(
    entryActions(insulinBody(log), [
      { key: 'button.remove', cls: 'delete-entry', run: () => removeInsulin(log) },
    ]),
  );
  main.appendChild(createToggle(`insulin:${log.id}`, insulinBody(log), detail));
  card.append(head, main, detail);
  item.appendChild(card);
  return item;
}

function renderDiary(): void {
  const list = byId('diary');
  const summary = byId('diary-summary');
  const dayMeals = mealsForDate(vault.meals, currentDate);
  const dayLogs = vault.insulin.filter((log) => log.date === currentDate);
  const entries = dayTimeline(vault.meals, vault.insulin, currentDate);

  const total = roundCarbs(dayMeals.reduce((sum, meal) => sum + mealCarbs(meal), 0));
  const insulinTotal = roundCarbs(dayLogs.reduce((sum, log) => sum + log.units, 0));
  const moments = carbsByMoment(dayMeals);
  byId('summary-carbs').textContent = `${total} ${tr('unit.grams')}`;
  byId('summary-meals').textContent = String(dayMeals.length);
  byId('summary-insulin').textContent = `${insulinTotal} ${tr('unit.units')}`;
  for (const moment of MOMENTS) {
    const cell = document.querySelector<HTMLOutputElement>(
      `.moment-carbs[data-moment="${moment}"]`,
    );
    if (cell) cell.textContent = `${roundCarbs(moments[moment])} ${tr('unit.grams')}`;
  }
  summary.hidden = entries.length === 0;

  list.innerHTML = '';
  if (entries.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'diary-empty';
    empty.appendChild(i18nEl('p', 'diary.empty', 'muted'));
    const cta = i18nEl('a', 'diary.emptyCta', 'primary diary-cta') as HTMLAnchorElement;
    cta.href = '#entry';
    empty.appendChild(cta);
    list.appendChild(empty);
    return;
  }
  for (const entry of entries) {
    list.appendChild(entry.kind === 'meal' ? mealEntry(entry.meal) : insulinEntry(entry.log));
  }
}

const LAST_EXPORT_KEY = 'carbos.lastExport';

/**
 * El recordatorio de copia sale del `<details>` plegable (E2): es un aviso en
 * flujo, con `role="status"`, y se reevalua en cada `render()` para que
 * aparezca o desaparezca segun el estado sin abrir Copia.
 */
function renderExportReminder(): void {
  const reminder = byId('export-reminder');
  let last: string | null = null;
  try {
    last = localStorage.getItem(LAST_EXPORT_KEY);
  } catch {
    last = null;
  }
  const days = last === null ? null : Math.floor((Date.now() - Number(last)) / 86400000);
  const stale = days === null || !Number.isFinite(days) || days >= 7;
  reminder.hidden = !stale;
  if (stale) reminder.textContent = tr('export.reminder');
}

function render(): void {
  applyI18n();
  localeSelect.value = locale;
  renderToday();
  renderPhoto();
  renderDraft();
  renderDetect();
  renderSearch();
  renderQuickAdd();
  renderDiary();
  renderExportReminder();
  relocalizeStatuses();
  insulin?.refresh();
  chat?.refresh();
  barcode?.refresh();
  requestAnimationFrame(() => {
    publishDaybarHeight();
    publishNavHeight();
  });
}

function publishDaybarHeight(): void {
  const topbar = document.querySelector<HTMLElement>('.topbar');
  if (!topbar) return;
  document.documentElement.style.setProperty('--daybar-h', `${topbar.offsetHeight}px`);
}

/**
 * Altura efectiva de la nav: su alto real en movil (barra inferior) y 0 en
 * escritorio, donde es un rail a la izquierda que no ocupa el flujo (A6).
 */
function navHeight(): number {
  const nav = document.getElementById('section-nav');
  if (!nav) return 0;
  return window.matchMedia('(min-width: 64rem)').matches ? 0 : nav.offsetHeight;
}

function publishNavHeight(): void {
  document.documentElement.style.setProperty('--nav-h', `${navHeight()}px`);
}

const SECTION_IDS = ['entry', 's-diario', 's-insulina', 's-ajustes'] as const;
let scrollspyReady = false;

/**
 * Scrollspy (A5): un unico observer marca el destino visible con `aria-current`.
 * La raiz descuenta la cabecera y la barra inferior para que la seccion activa
 * sea la primera visible por debajo del chrome. Al cargar, *Añadir*.
 */
function setupScrollspy(): void {
  if (scrollspyReady) return;
  scrollspyReady = true;
  const nav = byId('section-nav');
  const links = new Map<string, HTMLAnchorElement>();
  for (const link of nav.querySelectorAll<HTMLAnchorElement>('.nav-item')) {
    const target = link.dataset.target;
    if (target) links.set(target, link);
  }
  const setActive = (target: string): void => {
    for (const [key, link] of links) {
      if (key === target) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    }
  };
  const topInset =
    (document.querySelector<HTMLElement>('.topbar')?.offsetHeight ?? 0) + navHeight();

  const state = new Map<string, { top: number; intersecting: boolean }>();
  let current = 'entry';
  const update = (): void => {
    let best: string | null = null;
    let bestTop = Infinity;
    for (const id of SECTION_IDS) {
      const info = state.get(id);
      if (!info?.intersecting) continue;
      if (info.top < bestTop) {
        bestTop = info.top;
        best = id;
      }
    }
    if (best && best !== current) {
      current = best;
      setActive(best);
    }
  };
  const observer = new IntersectionObserver(
    (records) => {
      for (const record of records) {
        state.set(record.target.id, {
          top: record.boundingClientRect.top,
          intersecting: record.isIntersecting,
        });
      }
      update();
    },
    { rootMargin: `-${topInset}px 0px 0px 0px`, threshold: 0 },
  );
  setActive('entry');
  for (const id of SECTION_IDS) {
    const section = document.getElementById(id);
    if (section) observer.observe(section);
  }
}

async function refresh(): Promise<void> {
  vault = await loadVault();
  render();
  void renderContribStatus();
}

function wire(): void {
  const ONBOARDED_KEY = 'carbos.onboarded';
  const onboarding = byId('onboarding');
  let onboarded = true;
  try {
    onboarded = localStorage.getItem(ONBOARDED_KEY) === '1';
  } catch {
    onboarded = true;
  }
  const setSiblingsInert = (on: boolean): void => {
    for (const sibling of Array.from(app.children)) {
      if (sibling === onboarding) continue;
      if (on) sibling.setAttribute('inert', '');
      else sibling.removeAttribute('inert');
    }
  };
  if (!onboarded) {
    onboarding.hidden = false;
    setSiblingsInert(true);
    requestAnimationFrame(() => byId('onboarding-start').focus());
  }
  byId('onboarding-start').addEventListener('click', () => {
    try {
      localStorage.setItem(ONBOARDED_KEY, '1');
    } catch {
      /* almacenamiento no disponible */
    }
    onboarding.hidden = true;
    setSiblingsInert(false);
    byId<HTMLInputElement>('date').focus();
  });

  byId<HTMLInputElement>('date').value = currentDate;
  localeSelect.value = locale;

  const dailyTargetInput = byId<HTMLInputElement>('daily-target');
  const initialTarget = readDailyTarget();
  dailyTargetInput.value = initialTarget > 0 ? String(initialTarget) : '';
  dailyTargetInput.addEventListener('change', () => {
    const value = Number.parseFloat(dailyTargetInput.value);
    writeDailyTarget(Number.isFinite(value) && value > 0 ? value : 0);
    render();
  });

  localeSelect.addEventListener('change', () => {
    const value = localeSelect.value;
    if (isLocale(value)) {
      locale = value;
      storeLocale(locale);
      render();
    }
  });

  byId<HTMLInputElement>('date').addEventListener('change', () => {
    currentDate = byId<HTMLInputElement>('date').value || today();
    storeViewDate(currentDate);
    resetEdit();
    render();
  });

  const setDay = (isoDate: string): void => {
    currentDate = isoDate;
    storeViewDate(isoDate);
    byId<HTMLInputElement>('date').value = isoDate;
    resetEdit();
    render();
  };
  const shiftDay = (days: number): void => {
    const [year = 1970, month = 1, day = 1] = currentDate.split('-').map(Number);
    const base = new Date(year, month - 1, day);
    base.setDate(base.getDate() + days);
    setDay(isoDay(base));
  };
  byId('day-prev').addEventListener('click', () => shiftDay(-1));
  byId('day-next').addEventListener('click', () => shiftDay(1));
  byId('day-today').addEventListener('click', () => setDay(today()));

  const onFile = (event: Event): void => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    void prepareImage(file)
      .then((image) => {
        capture = image;
        draft.origin = 'photo';
        photoStatusKey = null;
        renderPhoto();
        void startDetection(image);
      })
      .catch(() => {
        // Fallo de imagen visible y entradas rearmadas para reintentar (E3).
        setPhotoStatus('photo.error');
        byId<HTMLInputElement>('camera-input').value = '';
        byId<HTMLInputElement>('file-input').value = '';
      });
  };
  byId<HTMLInputElement>('camera-input').addEventListener('change', onFile);
  byId<HTMLInputElement>('file-input').addEventListener('change', onFile);

  let searchTimer: number | undefined;
  byId<HTMLInputElement>('food-search').addEventListener('input', () => {
    if (searchTimer !== undefined) window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(renderSearch, 120);
  });

  // Conmutador de la superficie unica (A2): Foto por defecto, Buscar oculto.
  // Los radios nativos solo revelan un panel; no hay logica de dominio nueva.
  const photoPanel = byId('photo-panel');
  const searchPanel = byId('search-panel');
  const barcodePanel = byId('barcode-panel');
  const applyEntryMode = (): void => {
    const mode = app.querySelector<HTMLInputElement>('input[name="entry-mode"]:checked')?.id;
    photoPanel.hidden = mode !== 'entry-mode-photo';
    searchPanel.hidden = mode !== 'entry-mode-search';
    barcodePanel.hidden = mode !== 'entry-mode-barcode';
    // Al abrir "Codigo", preparar los datos en segundo plano (descarga del pack).
    if (mode === 'entry-mode-barcode') barcode?.prepare();
  };
  for (const radio of app.querySelectorAll<HTMLInputElement>('input[name="entry-mode"]')) {
    radio.addEventListener('change', applyEntryMode);
  }
  applyEntryMode();

  const registerButton = byId<HTMLButtonElement>('register');
  const addInsulinButton = byId<HTMLButtonElement>('add-insulin');
  byId('register-cancel').addEventListener('click', cancelEdit);
  registerButton.addEventListener('click', () => {
    if (registerButton.disabled) return;
    if (draft.items.length === 0) {
      setStatus('register-status', 'register.empty');
      return;
    }
    const editing = editingMeal;
    let meal: Meal;
    if (editing) {
      // Editar: mismo id, fecha y hora; solo cambian los alimentos.
      meal = { ...editing, items: draft.items.map((item) => ({ ...item })) };
    } else {
      const confidence =
        detections.length > 0
          ? detections.reduce((sum, result) => sum + result.score, 0) / detections.length
          : null;
      const topk = detections.flatMap((result) =>
        result.topk
          .filter((entry) => entry.classId)
          .slice(0, 1)
          .map((entry) => ({ classId: entry.classId as string, p: entry.p })),
      );
      meal = {
        id: uid(),
        date: currentDate,
        time: nowTime(),
        items: draft.items.map((item) => ({ ...item })),
        confidence,
        origin: draft.origin,
        model:
          detectionMeta && topk.length > 0
            ? { detector: detectionMeta.detector, classifier: detectionMeta.classifier, topk }
            : undefined,
      };
    }
    const photoImage = capture;
    const photoDets = detections;
    const photoIds = detectionDraftIds;
    const photoItems = draft.items.map((item) => ({ ...item }));
    const registerCard = registerButton.closest('fieldset');
    registerButton.disabled = true;
    registerCard?.setAttribute('aria-busy', 'true');
    const rearm = (): void => {
      registerButton.disabled = false;
      registerCard?.removeAttribute('aria-busy');
    };
    // Editar no vuelve a compartir la foto: el consentimiento fue al crearla.
    if (!editing && draft.origin === 'photo' && readContribAuto() && photoImage) {
      void enqueueFrom(photoImage, photoDets, photoIds, photoItems)
        .then((count) => {
          if (count === 0) return;
          if (navigator.onLine === false) void renderContribStatus();
          else void flushContributions();
        })
        .catch(() => undefined);
    }
    void putMeal(meal)
      .then(() => {
        resetEdit();
        capture = null;
        clearDetections();
        photoStatusKey = null;
        setStatus('register-status', 'register.done');
        return refresh();
      })
      .then(() => pulseDayTotal())
      .catch((error) => {
        console.warn(
          '[register] no se pudo registrar la comida:',
          error instanceof Error ? error.message : error,
        );
      })
      .finally(rearm);
  });

  byId('share-photo').addEventListener('click', () => {
    void enqueueFrom(
      capture,
      detections,
      detectionDraftIds,
      draft.items.map((item) => ({ ...item })),
    ).then((count) => {
      if (count === 0) return;
      if (navigator.onLine === false) {
        setStatus('share-status', 'contrib.queued');
        void renderContribStatus();
      } else {
        // Sube ya; el estado pasa a "subiendo" y luego a enviado/fallo.
        void flushContributions(true);
      }
    });
  });

  const contribToggle = byId<HTMLInputElement>('contrib-toggle');
  contribToggle.checked = readContribAuto();
  contribToggle.addEventListener('change', () => {
    writeContribAuto(contribToggle.checked);
  });

  byId('contrib-clear').addEventListener('click', () => {
    void clearContributions().then(() => {
      setStatus('share-status', 'contrib.cleared');
      return renderContribStatus();
    });
  });

  addInsulinButton.addEventListener('click', () => {
    if (addInsulinButton.disabled) return;
    const time = byId<HTMLInputElement>('ins-time').value || '00:00';
    const units = Number.parseFloat(byId<HTMLInputElement>('ins-units').value) || 0;
    const kind = byId<HTMLSelectElement>('ins-kind').value as InsulinKind;
    const insulinCard = addInsulinButton.closest('fieldset');
    addInsulinButton.disabled = true;
    insulinCard?.setAttribute('aria-busy', 'true');
    const rearm = (): void => {
      addInsulinButton.disabled = false;
      insulinCard?.removeAttribute('aria-busy');
    };
    void putInsulin({ id: uid(), date: currentDate, time, units, kind })
      .then(refresh)
      .catch((error) => {
        console.warn(
          '[insulin] no se pudo registrar:',
          error instanceof Error ? error.message : error,
        );
      })
      .finally(rearm);
  });

  const markExported = (): void => {
    try {
      localStorage.setItem(LAST_EXPORT_KEY, String(Date.now()));
    } catch {
      /* almacenamiento no disponible */
    }
    renderExportReminder();
  };

  byId('export').addEventListener('click', () => {
    void loadVault().then((current) => {
      downloadText(`carbos-${today()}.json`, toJson(current), 'application/json');
      setStatus('copy-status', 'export.done');
      markExported();
    });
  });

  byId('export-enc').addEventListener('click', () => {
    const password = byId<HTMLInputElement>('export-pass').value;
    void loadVault()
      .then((current) => encryptVault(current, password))
      .then((text) => {
        downloadText(`carbos-${today()}.carbos`, text, 'application/json');
        setStatus('copy-status', 'export.done');
        markExported();
      });
  });

  byId<HTMLInputElement>('import').addEventListener('change', (event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    void file
      .text()
      .then((text) => {
        if (isEncrypted(text)) {
          const password = window.prompt(tr('export.passwordPrompt')) ?? '';
          return decryptVault(text, password);
        }
        return Promise.resolve(fromJson(text));
      })
      .then((imported) => replaceVault(imported))
      .then(() => {
        setStatus('copy-status', 'export.imported');
        input.value = '';
        return refresh();
      })
      .catch(() => {
        setStatus('copy-status', 'export.importFailed');
      });
  });

  byId('persist').addEventListener('click', () => {
    if (!navigator.storage?.persist) {
      setStatus('persist-status', 'storage.denied');
      return;
    }
    void navigator.storage.persist().then((granted) => {
      setStatus('persist-status', granted ? 'storage.granted' : 'storage.denied');
    });
  });

  insulin = setupInsulin(
    byId('insulin-host'),
    byId<HTMLInputElement>('insulin-toggle'),
    () => locale,
  );
  const chatToggle = byId<HTMLInputElement>('chat-toggle');
  chatToggle.checked = isChatEnabled();
  chatToggle.addEventListener('change', () => {
    const enabled = chatToggle.checked;
    setChatEnabled(enabled);
    if (enabled) setChatDisabled(false);
    chat?.reload();
  });
  chat = setupChat(byId('chat-host'), {
    getLocale: () => locale,
    getDate: () => currentDate,
    setDate: (date) => setDay(date),
    refresh: () => {
      void refresh();
    },
  });
  barcode = setupBarcode(byId('barcode-panel'), {
    getLocale: () => locale,
    onAdd: (product) => {
      pushBarcodeItem(product);
    },
  });
  renderExportReminder();

  // Nav persistente: al destino Ajustes se le abre el <details> plegado. Sin
  // `preventDefault`: el enlace y el `scroll-padding` hacen el desplazamiento.
  byId('section-nav').addEventListener('click', (event) => {
    const link = (event.target as HTMLElement).closest<HTMLAnchorElement>('.nav-item');
    if (link?.dataset.target === 's-ajustes') {
      const settings = document.getElementById('settings');
      if (settings instanceof HTMLDetailsElement) settings.open = true;
    }
  });
  setupScrollspy();
}

wire();
void refresh();
void flushContributions();
void renderContribStatus();
window.addEventListener('online', () => {
  void flushContributions();
});
window.addEventListener('resize', () => {
  publishDaybarHeight();
  publishNavHeight();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* PWA opcional: sin service worker la app sigue funcionando */
    });
  });
}
