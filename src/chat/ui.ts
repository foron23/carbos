import { loadVault, putInsulin, putMeal } from '../core/db';
import { roundCarbs } from '../core/totals';
import { isStringKey, t } from '../i18n';
import type { Locale, StringKey } from '../i18n';
import { fetchJson } from '../model/loader';
import {
  detectHardwareCapabilities,
  detectStorageCapabilities,
  evaluateChatLoad,
} from './capability';
import { createChatClient } from './client';
import type { ChatClient } from './client';
import { isChatDisabled, isChatEnabled, setChatDisabled } from './flag';
import type { ChatIntent } from './intent';
import { chatManifestSchema } from './manifest';
import { parseModelOutput } from './parse';
import { buildChatPrompt } from './prompt';
import { proposalToInsulinLog, proposalToMeal, resolveIntent, totalsForDate } from './resolve';
import type { Proposal, ResolveDeps } from './resolve';

/**
 * Tarjeta de confirmacion del chat on-device (Fase 3 / v1.1).
 *
 * El chat **propone, nunca ejecuta**: interpretar y resolver construye una `Proposal` en
 * memoria, la tarjeta la muestra y solo el boton _Registrar_ escribe. Cero escrituras antes de
 * confirmar; al confirmar se **revalida** la propuesta (Zod + catalogo via `resolve.ts`) y solo
 * entonces se llama `putMeal`/`putInsulin` o el `setDate` inyectado. `query_totals` responde en
 * lectura y no lleva tarjeta.
 *
 * `setupChat` no renderiza **nada** (ni el host ni un boton) cuando el flag esta apagado, el
 * dispositivo no aguanta o falta el manifest; el chat desactivado no deja nodos.
 */

export const CHAT_CACHE = 'carbos-chat-v1';

/** Inyeccion de dependencias, espejo de `setupInsulin`. */
export interface ChatDeps {
  getLocale: () => Locale;
  getDate: () => string;
  setDate: (date: string) => void;
  refresh: () => void;
}

export interface ChatHandle {
  /** Retraduce la tarjeta y el estado sin perder lo escrito ni la propuesta. */
  refresh(): void;
  /** Reevalua flag y capacidad y monta/desmonta el chat (usado por el control opt-in). */
  reload(): void;
}

/**
 * Hook estrecho para el arnes E2E: si `globalThis.__carbosChatStub` esta definido, el chat usa
 * ese cliente en lugar del worker real y se considera disponible sin sondas de capacidad. Si no
 * esta definido, es completamente inerte.
 */
export interface ChatStub {
  client: ChatClient;
  available?: boolean;
}

function readStub(): ChatStub | null {
  const holder = globalThis as { __carbosChatStub?: ChatStub | null };
  return holder.__carbosChatStub ?? null;
}

function manifestUrl(): string {
  return new URL('chat-manifest.json', document.baseURI).href;
}

function uid(): string {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function currentTime(): string {
  const date = new Date();
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Traduce los nodos estaticos de la tarjeta (el chat puede montarse despues del render). */
function localize(root: HTMLElement, locale: Locale): void {
  for (const node of root.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const key = node.dataset.i18n;
    if (key && isStringKey(key)) node.textContent = t(locale, key);
  }
  for (const node of root.querySelectorAll<HTMLInputElement>('[data-i18n-ph]')) {
    const key = node.dataset.i18nPh;
    if (key && isStringKey(key)) node.placeholder = t(locale, key);
  }
  for (const node of root.querySelectorAll<HTMLElement>('[data-i18n-aria]')) {
    const key = node.dataset.i18nAria;
    if (key && isStringKey(key)) node.setAttribute('aria-label', t(locale, key));
  }
}

export function setupChat(host: HTMLElement, deps: ChatDeps): ChatHandle {
  const stub = readStub();
  let root: HTMLElement | null = null;
  let input: HTMLInputElement | null = null;
  let statusEl: HTMLElement | null = null;
  let cardEl: HTMLElement | null = null;
  let client: ChatClient | null = null;
  let intent: ChatIntent | null = null;
  let proposal: Proposal | null = null;
  let statusKey: StringKey | null = null;
  let answer: string | null = null;

  const clear = (): void => {
    if (client && client !== stub?.client) client.dispose();
    client = null;
    root = null;
    input = null;
    statusEl = null;
    cardEl = null;
    intent = null;
    proposal = null;
    statusKey = null;
    answer = null;
    host.innerHTML = '';
    host.hidden = true;
  };

  function resolveDeps(): ResolveDeps {
    return { locale: deps.getLocale(), currentDate: deps.getDate(), nowTime: currentTime() };
  }

  function reset(): void {
    intent = null;
    proposal = null;
    statusKey = null;
    answer = null;
  }

  function renderCard(): void {
    if (!cardEl) return;
    cardEl.textContent = '';
    if (!proposal || proposal.kind === 'totals' || proposal.kind === 'unknown') {
      cardEl.hidden = true;
      return;
    }
    const locale = deps.getLocale();
    const titleKey: StringKey =
      proposal.kind === 'meal'
        ? 'chat.mealTitle'
        : proposal.kind === 'insulin'
          ? 'chat.insulinTitle'
          : 'chat.dateTitle';
    cardEl.hidden = false;
    cardEl.setAttribute('aria-label', t(locale, titleKey));
    const title = document.createElement('h3');
    title.textContent = t(locale, titleKey);
    cardEl.appendChild(title);

    if (proposal.kind === 'meal') {
      const meta = document.createElement('p');
      meta.className = 'muted';
      meta.textContent = `${proposal.date} · ${proposal.time}`;
      cardEl.appendChild(meta);
      const list = document.createElement('ul');
      list.className = 'chat-items';
      for (const item of proposal.items) {
        const li = document.createElement('li');
        const name = item.name ?? t(locale, 'chat.noMatch');
        li.textContent = `${name} · ${item.grams} ${t(locale, 'unit.grams')} · ${roundCarbs(item.carbs)} ${t(locale, 'unit.grams')}`;
        list.appendChild(li);
      }
      cardEl.appendChild(list);
      const total = document.createElement('p');
      total.className = 'total';
      total.textContent = `${t(locale, 'label.total')}: ${roundCarbs(proposal.carbs)} ${t(locale, 'unit.grams')}`;
      cardEl.appendChild(total);
    } else if (proposal.kind === 'insulin') {
      const meta = document.createElement('p');
      meta.className = 'muted';
      meta.textContent = `${proposal.date} · ${proposal.time}`;
      const body = document.createElement('p');
      body.textContent = `${proposal.units} ${t(locale, 'unit.units')} · ${t(locale, `kind.${proposal.insulinKind}` as StringKey)}`;
      const note = document.createElement('p');
      note.className = 'notice';
      note.setAttribute('role', 'note');
      note.textContent = t(locale, 'chat.insulinNote');
      cardEl.append(meta, body, note);
    } else {
      const body = document.createElement('p');
      body.textContent = proposal.date;
      cardEl.appendChild(body);
    }

    const row = document.createElement('div');
    row.className = 'row';
    if (proposal.kind === 'meal' && proposal.unresolved > 0) {
      const warn = document.createElement('p');
      warn.className = 'muted';
      warn.textContent = t(locale, 'chat.noMatch');
      cardEl.appendChild(warn);
    } else {
      const confirm = document.createElement('button');
      confirm.type = 'button';
      confirm.id = 'chat-confirm';
      confirm.className = 'primary';
      confirm.textContent = t(locale, 'button.register');
      confirm.addEventListener('click', () => void confirmProposal());
      row.appendChild(confirm);
    }
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.id = 'chat-cancel';
    cancel.textContent = t(locale, 'chat.cancel');
    cancel.addEventListener('click', cancelProposal);
    row.appendChild(cancel);
    cardEl.appendChild(row);
  }

  function paint(): void {
    if (!root) return;
    localize(root, deps.getLocale());
    if (statusEl) {
      const label = statusKey ? t(deps.getLocale(), statusKey) : '';
      statusEl.textContent = answer ? (label ? `${label}: ${answer}` : answer) : label;
    }
    renderCard();
  }

  function cancelProposal(): void {
    reset();
    paint();
    input?.focus();
  }

  async function confirmProposal(): Promise<void> {
    if (!intent) {
      cancelProposal();
      return;
    }
    const fresh = resolveIntent(intent, resolveDeps());
    try {
      if (fresh.kind === 'meal') {
        const meal = proposalToMeal(fresh, uid);
        if (!meal) {
          proposal = fresh;
          statusKey = 'chat.noMatch';
          answer = null;
          paint();
          return;
        }
        await putMeal(meal);
      } else if (fresh.kind === 'insulin') {
        const log = proposalToInsulinLog(fresh, uid);
        if (!log) {
          cancelProposal();
          return;
        }
        await putInsulin(log);
      } else if (fresh.kind === 'date') {
        deps.setDate(fresh.date);
      } else {
        cancelProposal();
        return;
      }
    } catch {
      setChatDisabled(true);
      clear();
      return;
    }
    if (input) input.value = '';
    reset();
    deps.refresh();
  }

  async function showIntent(next: ChatIntent): Promise<void> {
    intent = next;
    if (next.action === 'unknown') {
      proposal = null;
      answer = null;
      statusKey = 'chat.unknown';
      paint();
      return;
    }
    const resolved = resolveIntent(next, resolveDeps());
    if (resolved.kind === 'totals') {
      statusKey = 'chat.totalsTitle';
      proposal = null;
      intent = null;
      paint();
      try {
        const vault = await loadVault();
        answer = `${roundCarbs(totalsForDate(vault.meals, resolved.date))} ${t(deps.getLocale(), 'unit.grams')}`;
      } catch {
        answer = null;
      }
      paint();
      return;
    }
    proposal = resolved;
    statusKey = null;
    answer = null;
    paint();
    cardEl?.querySelector('button')?.focus();
  }

  async function send(): Promise<void> {
    if (!client || !input) return;
    const text = input.value.trim();
    if (!text) {
      statusKey = 'chat.emptyQuery';
      answer = null;
      paint();
      return;
    }
    statusKey = 'chat.thinking';
    answer = null;
    proposal = null;
    intent = null;
    paint();
    try {
      const prompt = buildChatPrompt({ locale: deps.getLocale(), text, today: deps.getDate() });
      const outcome = await client.chat(prompt.system, prompt.user, {
        manifestUrl: manifestUrl(),
        cacheName: CHAT_CACHE,
      });
      await showIntent(parseModelOutput(outcome.text, text));
    } catch {
      setChatDisabled(true);
      clear();
    }
  }

  function mount(activeClient: ChatClient): void {
    client = activeClient;
    host.hidden = false;
    host.innerHTML = `
      <fieldset class="chat-panel inset">
        <legend data-i18n="chat.title"></legend>
        <p class="notice" role="note" data-i18n="chat.disclaimer"></p>
        <div class="row">
          <input id="chat-input" type="text" autocomplete="off" data-i18n-aria="chat.inputPlaceholder" data-i18n-ph="chat.inputPlaceholder" />
          <button id="chat-send" type="button" class="primary" data-i18n="chat.send"></button>
        </div>
        <p id="chat-status" class="muted" aria-live="polite"></p>
        <div id="chat-card" class="chat-card" hidden role="group"></div>
      </fieldset>
    `;
    root = host.querySelector('fieldset.chat-panel');
    input = host.querySelector<HTMLInputElement>('#chat-input');
    statusEl = host.querySelector<HTMLElement>('#chat-status');
    cardEl = host.querySelector<HTMLElement>('#chat-card');
    host.querySelector('#chat-send')?.addEventListener('click', () => void send());
    localize(host, deps.getLocale());
    paint();
  }

  /**
   * Limpia y reevalua flag y capacidad. Un dispositivo no soportado hace **cero** peticiones:
   * las sondas de hardware van antes del manifest y la cuota se comprueba despues, ya con los
   * bytes del modelo.
   */
  async function load(): Promise<void> {
    clear();
    if (!isChatEnabled() || isChatDisabled()) return;

    if (stub && stub.available !== false) {
      mount(stub.client);
      return;
    }

    const decision = await evaluateChatLoad({
      detectHardware: () => detectHardwareCapabilities(),
      loadModelBytes: () => fetchJson(manifestUrl(), chatManifestSchema).then((m) => m.model.bytes),
      detectStorage: () => detectStorageCapabilities(),
    });
    if (decision.status === 'ready') mount(createChatClient());
  }

  void load();

  return { refresh: paint, reload: () => void load() };
}
