import { arithmeticTerms, insulinParamsSchema } from './arithmetic';
import { isInsulinEnabled, setInsulinEnabled } from './flag';
import { STRINGS } from '../i18n';
import type { Locale, StringKey } from '../i18n';

export interface InsulinHandle {
  /** Retraduce el resultado y el desglose sin rehacer el panel. */
  refresh(): void;
}

function text(locale: Locale, key: StringKey): string {
  return STRINGS[locale][key];
}

function num(input: HTMLInputElement): number {
  const value = Number.parseFloat(input.value);
  return Number.isFinite(value) ? value : Number.NaN;
}

type Terms = ReturnType<typeof arithmeticTerms>;

/**
 * Modulo opt-in de aritmetica. Todo el texto sale del i18n y va marcado con
 * `data-i18n`, de modo que cambiar de idioma lo retraduce en el sitio sin
 * rehacer el panel ni perder lo que el usuario haya escrito.
 * Activarlo exige confirmar un aviso no descartable (spec 09, D7, D10).
 */
export function setupInsulin(
  host: HTMLElement,
  toggle: HTMLInputElement,
  getLocale: () => Locale,
): InsulinHandle {
  let terms: Terms | null = null;
  let incomplete = false;

  toggle.checked = isInsulinEnabled();

  const clear = (): void => {
    host.innerHTML = '';
    host.hidden = true;
    terms = null;
    incomplete = false;
  };

  const paintResult = (): void => {
    const result = host.querySelector<HTMLParagraphElement>('#ins-result');
    const breakdown = host.querySelector<HTMLParagraphElement>('#ins-terms');
    if (!result || !breakdown) return;
    const locale = getLocale();
    const unit = text(locale, 'unit.units');
    if (incomplete) {
      result.textContent = text(locale, 'ui.insulinIncomplete');
      breakdown.textContent = '';
      return;
    }
    if (!terms) {
      result.textContent = `0 ${unit}`;
      breakdown.textContent = '';
      return;
    }
    result.textContent = `${terms.total} ${unit}`;
    breakdown.textContent =
      `${text(locale, 'ui.insulinMeal')}: ${terms.forMeal} ${unit}` +
      ` · ${text(locale, 'ui.insulinCorrection')}: ${terms.forCorrection} ${unit}`;
  };

  const renderGate = (): void => {
    const locale = getLocale();
    host.hidden = false;
    host.innerHTML = `
      <div class="notice" role="alertdialog" aria-modal="true" aria-labelledby="ins-gate-title" aria-describedby="ins-gate-body" tabindex="-1">
        <strong id="ins-gate-title" data-i18n="insulin.gateTitle">${text(locale, 'insulin.gateTitle')}</strong>
        <p id="ins-gate-body" data-i18n="insulin.gateBody">${text(locale, 'insulin.gateBody')}</p>
        <div class="row">
          <button id="ins-gate-accept" type="button" class="primary" data-i18n="insulin.gateAccept">${text(locale, 'insulin.gateAccept')}</button>
          <button id="ins-gate-cancel" type="button" data-i18n="insulin.gateCancel">${text(locale, 'insulin.gateCancel')}</button>
        </div>
      </div>
    `;
    host.querySelector<HTMLElement>('[role="alertdialog"]')?.focus();
    host.querySelector('#ins-gate-accept')?.addEventListener('click', () => {
      setInsulinEnabled(true);
      toggle.checked = true;
      renderPanel();
    });
    host.querySelector('#ins-gate-cancel')?.addEventListener('click', () => {
      setInsulinEnabled(false);
      toggle.checked = false;
      clear();
      toggle.focus();
    });
  };

  const renderPanel = (): void => {
    const locale = getLocale();
    host.hidden = false;
    host.innerHTML = `
      <fieldset class="card inset">
        <legend data-i18n="ui.insulinTitle">${text(locale, 'ui.insulinTitle')}</legend>
        <p class="notice" role="note" data-i18n="ui.insulinDisclaimer">${text(locale, 'ui.insulinDisclaimer')}</p>
        <div class="grid">
          <label><span data-i18n="ui.insulinRatio">${text(locale, 'ui.insulinRatio')}</span><input id="ins-ratio" type="number" inputmode="decimal" min="0" step="0.1" value="10" /></label>
          <label><span data-i18n="ui.insulinCF">${text(locale, 'ui.insulinCF')}</span><input id="ins-cf" type="number" inputmode="numeric" min="0" step="1" value="50" /></label>
          <label><span data-i18n="ui.insulinTarget">${text(locale, 'ui.insulinTarget')}</span><input id="ins-target" type="number" inputmode="numeric" min="0" step="1" value="100" /></label>
          <label><span data-i18n="ui.insulinCurrent">${text(locale, 'ui.insulinCurrent')}</span><input id="ins-current" type="number" inputmode="numeric" min="0" step="1" value="100" /></label>
          <label><span data-i18n="ui.insulinCarbs">${text(locale, 'ui.insulinCarbs')}</span><input id="ins-carbs" type="number" inputmode="decimal" min="0" step="1" value="0" /></label>
        </div>
        <p id="ins-result" class="total" aria-live="polite"></p>
        <p id="ins-terms" class="muted"></p>
        <button id="ins-calc" type="button" class="primary" data-i18n="button.calc">${text(locale, 'button.calc')}</button>
      </fieldset>
    `;
    host.querySelector('#ins-calc')?.addEventListener('click', () => {
      const parsed = insulinParamsSchema.safeParse({
        ratio: num(host.querySelector<HTMLInputElement>('#ins-ratio')!),
        correctionFactor: num(host.querySelector<HTMLInputElement>('#ins-cf')!),
        target: num(host.querySelector<HTMLInputElement>('#ins-target')!),
        current: num(host.querySelector<HTMLInputElement>('#ins-current')!),
        carbs: num(host.querySelector<HTMLInputElement>('#ins-carbs')!),
      });
      incomplete = !parsed.success;
      terms = parsed.success ? arithmeticTerms(parsed.data) : null;
      paintResult();
    });
    paintResult();
  };

  toggle.addEventListener('change', () => {
    if (toggle.checked) {
      renderGate();
    } else {
      setInsulinEnabled(false);
      clear();
    }
  });

  if (toggle.checked) {
    renderPanel();
  } else {
    clear();
  }

  return { refresh: paintResult };
}
