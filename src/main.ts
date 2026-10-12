import './style.css';
import {
  dayCarbs,
  emptyVault,
  fromJson,
  itemCarbs,
  loadVault,
  putInsulin,
  putMeal,
  replaceVault,
  roundCarbs,
  slotCarbs,
  toJson,
  weekCarbs,
} from './core';
import type { FoodItem, InsulinKind, Meal, MealSlot, Vault } from './core';
import { CATALOG, searchFoods } from './catalog';
import type { Food } from './catalog';
import { detectLocale, isLocale, isStringKey, storeLocale, t } from './i18n';
import type { Locale, StringKey } from './i18n';
import { prepareImage } from './capture/image';
import type { CapturedImage } from './capture/image';
import { createDetectionClient } from './model';
import type { DetectionClient, DetectionResult, InferencePhase, TopKEntry } from './model';
import { decryptVault, encryptVault, isEncrypted } from './export/crypto';
import { setupInsulin } from './insulin';
import type { InsulinHandle } from './insulin';

const SLOTS: readonly MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];

interface Draft {
  slot: MealSlot;
  origin: 'manual' | 'photo';
  items: FoodItem[];
}

let locale: Locale = detectLocale();

/**
 * El dia mostrado se recuerda para no perderlo al recargar. Sin esto la vista
 * vuelve a "hoy" y las comidas registradas en otro dia parecen no haberse
 * guardado. `sessionStorage` sobrevive a la recarga pero no a una apertura
 * nueva, donde se vuelve a "hoy".
 */
const VIEW_DATE_KEY = 'carbos.viewDate';
const VIEW_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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

/** Mensajes de estado: se guarda la clave para poder retraducirlos. */
const statusKeys = new Map<string, StringKey>();

function setStatus(id: string, key: StringKey): void {
  byId(id).textContent = tr(key);
  statusKeys.set(id, key);
}

function relocalizeStatuses(): void {
  for (const [id, key] of statusKeys) byId(id).textContent = tr(key);
}
let draft: Draft = { slot: 'breakfast', origin: 'manual', items: [] };
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

function getDetectionClient(): DetectionClient {
  if (!detectionClient) detectionClient = createDetectionClient();
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

function uid(): string {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
}

function tr(key: StringKey): string {
  return t(locale, key);
}

function slotOptions(): string {
  return SLOTS.map((slot) => `<option value="${slot}" data-i18n="slot.${slot}"></option>`).join('');
}

const app = byId('app');
app.innerHTML = `
  <section id="onboarding" class="onboarding" hidden aria-labelledby="onboarding-title">
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
    <p class="muted" data-i18n="app.tagline"></p>
  </header>

  <fieldset class="card hero daybar">
    <legend data-i18n="section.today"></legend>
    <p class="hero-figure">
      <output id="day-total" class="total" aria-live="polite"></output>
      <span class="chip"><span data-i18n="diary.week"></span>: <output id="week-total"></output></span>
    </p>
    <label for="date" data-i18n="field.date"></label>
    <div class="row daynav">
      <button id="day-prev" type="button" data-i18n-aria="nav.prevDay">\u2039</button>
      <input id="date" type="date" />
      <button id="day-next" type="button" data-i18n-aria="nav.nextDay">\u203a</button>
      <button id="day-today" type="button" data-i18n="nav.today"></button>
    </div>
  </fieldset>

  <fieldset class="card">
    <legend data-i18n="section.photo"></legend>
    <img id="photo-preview" class="preview" alt="" hidden />
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
  </fieldset>

  <fieldset class="card">
    <legend data-i18n="section.addFood"></legend>
    <label for="draft-slot" data-i18n="field.slot"></label>
    <select id="draft-slot">${slotOptions()}</select>
    <label for="food-search" data-i18n="field.search"></label>
    <div class="row">
      <input id="food-search" type="search" autocomplete="off" />
    </div>
    <ul id="search-results" class="results"></ul>
    <h3 data-i18n="draft.items"></h3>
    <ul id="draft-items" class="draft"></ul>
    <p><span data-i18n="label.total"></span>: <output id="draft-total" aria-live="polite"></output></p>
    <p><button id="register" type="button" class="primary" data-i18n="button.register"></button></p>
    <p id="register-status" class="muted" aria-live="polite"></p>
    <p class="muted" data-i18n="text.estimateNote"></p>
  </fieldset>

  <fieldset class="card">
    <legend data-i18n="section.diary"></legend>
    <ul id="diary"></ul>
  </fieldset>

  <fieldset class="card">
    <legend data-i18n="section.insulinLog"></legend>
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
    <ul id="insulin-list"></ul>
  </fieldset>

  <details class="card">
    <summary data-i18n="section.copy"></summary>
    <p id="export-reminder" class="muted" hidden></p>
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

  <details class="card">
    <summary data-i18n="section.settings"></summary>
    <p><button id="persist" type="button" data-i18n="button.persist"></button></p>
    <p id="persist-status" class="muted" aria-live="polite"></p>
    <label class="check"><input id="insulin-toggle" type="checkbox" /> <span data-i18n="settings.insulinModule"></span></label>
    <div id="insulin-host" hidden></div>
  </details>

  <footer>
    <p class="notice" role="note" data-i18n="footer.disclaimer"></p>
  </footer>
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
  });
  renderDraft();
}

function renderSearch(): void {
  const query = byId<HTMLInputElement>('food-search').value;
  const list = byId('search-results');
  if (query.trim().length < 2) {
    list.innerHTML = '';
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
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'result';
    button.textContent = `${food.name[locale]} · ${food.carbsPer100g} ${tr('unit.grams')}/100 ${tr('unit.grams')}`;
    button.addEventListener('click', () => {
      addFoodToDraft(food);
      byId<HTMLInputElement>('food-search').value = '';
      list.innerHTML = '';
    });
    item.appendChild(button);
    list.appendChild(item);
  }
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
      const carbs = document.createElement('span');
      carbs.className = 'muted';
      carbs.textContent = `${roundCarbs(itemCarbs(item))} ${tr('unit.grams')}`;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = tr('button.remove');
      remove.setAttribute('aria-label', `${tr('button.remove')} ${item.name}`);
      remove.addEventListener('click', () => {
        draft.items.splice(index, 1);
        renderDraft();
      });
      row.append(name, gramsLabel, carbs, remove);
      list.appendChild(row);
    });
  }
  const total = draft.items.reduce((sum, item) => sum + itemCarbs(item), 0);
  byId('draft-total').textContent = `${roundCarbs(total)} ${tr('unit.grams')}`;
}

function setPhotoStatus(key: StringKey | null): void {
  photoStatusKey = key;
  byId('photo-status').textContent = tr(key ?? 'photo.ready');
}

function renderPhoto(): void {
  const preview = byId<HTMLImageElement>('photo-preview');
  const status = byId('photo-status');
  if (capture) {
    preview.src = capture.dataUrl;
    preview.hidden = false;
    status.textContent = tr(photoStatusKey ?? 'photo.ready');
  } else {
    preview.hidden = true;
    preview.removeAttribute('src');
    photoStatusKey = null;
    status.textContent = tr('photo.none');
  }
}

function foodById(id: string | null): Food | undefined {
  if (!id) return undefined;
  return CATALOG.foods.find((food) => food.id === id);
}

function pushFood(food: Food): string {
  const id = uid();
  draft.items.push({
    id,
    name: food.name[locale],
    grams: food.defaultPortionGrams,
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
    item.name = food.name[locale];
    item.carbsPer100g = food.carbsPer100g;
    item.classId = food.id;
  } else {
    detectionDraftIds[index] = pushFood(food);
  }
  renderDraft();
}

function applyDetections(results: DetectionResult[]): void {
  detectionDraftIds = results.map((result) => {
    const food = foodById(result.classId);
    return food ? pushFood(food) : '';
  });
  renderDraft();
  renderDetect();
}

function renderDetect(): void {
  const panel = byId('detect-panel');
  const summary = byId('detect-summary');
  const list = byId('detect-results');
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
    name.textContent = `${topkLabel(best)} · ${Math.round(best.p * 100)}%`;
    row.appendChild(name);
    if (result.topk.length > 1) {
      const select = document.createElement('select');
      select.className = 'detect-alt';
      select.setAttribute('aria-label', tr('detect.alternatives'));
      result.topk.forEach((entry, altIndex) => {
        const option = document.createElement('option');
        option.value = String(altIndex);
        option.textContent = `${topkLabel(entry)} ${Math.round(entry.p * 100)}%`;
        option.disabled = !entry.classId;
        select.appendChild(option);
      });
      select.addEventListener('change', () => {
        const chosen = result.topk[Number(select.value)];
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
  detections = [];
  detectionDraftIds = [];
  detectionEngine = '';
  detectionMeta = null;
  renderDraft();
  renderDetect();
  setPhotoStatus('photo.detecting');
  try {
    const outcome = await getDetectionClient().detect(
      { dataUrl: image.dataUrl, width: image.width, height: image.height },
      { manifestUrl: MODEL_MANIFEST_URL, cacheName: MODEL_CACHE, signal: controller.signal },
      { onProgress: (event) => setPhotoStatus(PHASE_KEYS[event.phase]) },
    );
    if (controller.signal.aborted) return;
    detections = outcome.results;
    detectionEngine = outcome.engine;
    detectionMeta = { detector: outcome.detector, classifier: outcome.classifier };
    applyDetections(outcome.results);
    setPhotoStatus(outcome.results.length > 0 ? 'photo.detected' : 'photo.noItems');
  } catch (error) {
    if (
      controller.signal.aborted ||
      (error instanceof DOMException && error.name === 'AbortError')
    ) {
      return;
    }
    detections = [];
    detectionDraftIds = [];
    renderDetect();
    setPhotoStatus('photo.noModel');
  }
}

function renderToday(): void {
  byId('day-total').textContent =
    `${roundCarbs(dayCarbs(vault.meals, currentDate))} ${tr('unit.grams')}`;
  const weekStart = currentDate;
  byId('week-total').textContent =
    `${roundCarbs(weekCarbs(vault.meals, weekStart))} ${tr('unit.grams')}`;
}

function renderDiary(): void {
  const list = byId('diary');
  const meals = vault.meals.filter((meal) => meal.date === currentDate);
  if (meals.length === 0) {
    list.innerHTML = `<li class="muted">${tr('diary.empty')}</li>`;
    return;
  }
  list.innerHTML = '';
  for (const meal of meals) {
    const item = document.createElement('li');
    const head = document.createElement('strong');
    head.textContent = `${tr(`slot.${meal.slot}` as StringKey)} (${slotCarbs(vault.meals, currentDate, meal.slot)} ${tr('unit.grams')})`;
    const detail = document.createElement('div');
    detail.className = 'muted';
    const items = meal.items
      .map(
        (food) =>
          `${food.name} ${food.grams} ${tr('unit.grams')} (${roundCarbs(itemCarbs(food))} ${tr('unit.grams')})`,
      )
      .join(' · ');
    detail.textContent = items;
    item.append(head, detail);
    if (meal.confidence !== null) {
      const conf = document.createElement('span');
      conf.className = 'muted';
      conf.textContent = ` · ${tr('confidence.label')}: ${Math.round(meal.confidence * 100)}%`;
      head.appendChild(conf);
    }
    list.appendChild(item);
  }
}

function renderInsulin(): void {
  const list = byId('insulin-list');
  const logs = vault.insulin.filter((log) => log.date === currentDate);
  if (logs.length === 0) {
    list.innerHTML = `<li class="muted">${tr('insulin.empty')}</li>`;
    return;
  }
  list.innerHTML = '';
  for (const log of logs) {
    const item = document.createElement('li');
    item.textContent = `${log.time} · ${log.units} ${tr('unit.units')} · ${tr(`kind.${log.kind}` as StringKey)}`;
    list.appendChild(item);
  }
}

function render(): void {
  applyI18n();
  localeSelect.value = locale;
  renderToday();
  renderPhoto();
  renderDraft();
  renderDetect();
  renderSearch();
  renderDiary();
  renderInsulin();
  relocalizeStatuses();
  insulin?.refresh();
}

async function refresh(): Promise<void> {
  vault = await loadVault();
  render();
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
  if (!onboarded) onboarding.hidden = false;
  byId('onboarding-start').addEventListener('click', () => {
    try {
      localStorage.setItem(ONBOARDED_KEY, '1');
    } catch {
      /* almacenamiento no disponible */
    }
    onboarding.hidden = true;
  });

  byId<HTMLInputElement>('date').value = currentDate;
  localeSelect.value = locale;

  localeSelect.addEventListener('change', () => {
    const value = localeSelect.value;
    if (isLocale(value)) {
      locale = value;
      storeLocale(locale);
      render();
      renderExportReminder();
    }
  });

  byId<HTMLInputElement>('date').addEventListener('change', () => {
    currentDate = byId<HTMLInputElement>('date').value || today();
    storeViewDate(currentDate);
    render();
  });

  const setDay = (isoDate: string): void => {
    currentDate = isoDate;
    storeViewDate(isoDate);
    byId<HTMLInputElement>('date').value = isoDate;
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
        /* imagen no legible: seguimos con la entrada manual */
      });
  };
  byId<HTMLInputElement>('camera-input').addEventListener('change', onFile);
  byId<HTMLInputElement>('file-input').addEventListener('change', onFile);

  byId<HTMLSelectElement>('draft-slot').addEventListener('change', () => {
    draft.slot = byId<HTMLSelectElement>('draft-slot').value as MealSlot;
  });

  let searchTimer: number | undefined;
  byId<HTMLInputElement>('food-search').addEventListener('input', () => {
    if (searchTimer !== undefined) window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(renderSearch, 120);
  });

  byId('register').addEventListener('click', () => {
    if (draft.items.length === 0) {
      setStatus('register-status', 'register.empty');
      return;
    }
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
    const meal: Meal = {
      id: uid(),
      date: currentDate,
      slot: draft.slot,
      items: draft.items.map((item) => ({ ...item })),
      confidence,
      origin: draft.origin,
      model:
        detectionMeta && topk.length > 0
          ? { detector: detectionMeta.detector, classifier: detectionMeta.classifier, topk }
          : undefined,
    };
    void putMeal(meal).then(() => {
      draft = { slot: draft.slot, origin: 'manual', items: [] };
      capture = null;
      detections = [];
      detectionDraftIds = [];
      detectionMeta = null;
      detectionEngine = '';
      photoStatusKey = null;
      setStatus('register-status', 'register.done');
      return refresh();
    });
  });

  byId('add-insulin').addEventListener('click', () => {
    const time = byId<HTMLInputElement>('ins-time').value || '00:00';
    const units = Number.parseFloat(byId<HTMLInputElement>('ins-units').value) || 0;
    const kind = byId<HTMLSelectElement>('ins-kind').value as InsulinKind;
    void putInsulin({ id: uid(), date: currentDate, time, units, kind }).then(refresh);
  });

  const LAST_EXPORT_KEY = 'carbos.lastExport';
  const renderExportReminder = (): void => {
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
  };
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
  renderExportReminder();
}

wire();
void refresh();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* PWA opcional: sin service worker la app sigue funcionando */
    });
  });
}
