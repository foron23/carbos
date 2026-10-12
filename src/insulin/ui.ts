import { arithmeticTerms, insulinParamsSchema } from './arithmetic';
import { isInsulinEnabled, setInsulinEnabled } from './flag';

export interface InsulinStrings {
  title: string;
  disclaimer: string;
  ratio: string;
  correctionFactor: string;
  target: string;
  current: string;
  carbs: string;
  compute: string;
  incomplete: string;
  meal: string;
  correction: string;
  unit: string;
  gateTitle: string;
  gateBody: string;
  gateAccept: string;
  gateCancel: string;
}

function num(input: HTMLInputElement): number {
  const value = Number.parseFloat(input.value);
  return Number.isFinite(value) ? value : Number.NaN;
}

/**
 * Modulo opt-in de aritmetica. Activarlo exige confirmar un aviso no
 * descartable (spec 09, D7, D10): la casilla no enciende el panel sola.
 */
export function setupInsulin(
  host: HTMLElement,
  toggle: HTMLInputElement,
  strings: InsulinStrings,
): void {
  toggle.checked = isInsulinEnabled();

  const clear = (): void => {
    host.innerHTML = '';
    host.hidden = true;
  };

  const renderGate = (): void => {
    host.hidden = false;
    host.innerHTML = `
      <div class="notice" role="note">
        <strong>${strings.gateTitle}</strong>
        <p>${strings.gateBody}</p>
        <div class="row">
          <button id="ins-gate-accept" type="button" class="primary">${strings.gateAccept}</button>
          <button id="ins-gate-cancel" type="button">${strings.gateCancel}</button>
        </div>
      </div>
    `;
    host.querySelector('#ins-gate-accept')?.addEventListener('click', () => {
      setInsulinEnabled(true);
      toggle.checked = true;
      renderPanel();
    });
    host.querySelector('#ins-gate-cancel')?.addEventListener('click', () => {
      setInsulinEnabled(false);
      toggle.checked = false;
      clear();
    });
  };

  const renderPanel = (): void => {
    host.hidden = false;
    host.innerHTML = `
      <fieldset class="card inset">
        <legend>${strings.title}</legend>
        <p class="notice" role="note">${strings.disclaimer}</p>
        <div class="grid">
          <label>${strings.ratio}<input id="ins-ratio" type="number" inputmode="decimal" min="0" step="0.1" value="10" /></label>
          <label>${strings.correctionFactor}<input id="ins-cf" type="number" inputmode="numeric" min="0" step="1" value="50" /></label>
          <label>${strings.target}<input id="ins-target" type="number" inputmode="numeric" min="0" step="1" value="100" /></label>
          <label>${strings.current}<input id="ins-current" type="number" inputmode="numeric" min="0" step="1" value="100" /></label>
          <label>${strings.carbs}<input id="ins-carbs" type="number" inputmode="decimal" min="0" step="1" value="0" /></label>
        </div>
        <p id="ins-result" class="total" aria-live="polite">0 ${strings.unit}</p>
        <p id="ins-terms" class="muted"></p>
        <button id="ins-calc" type="button" class="primary">${strings.compute}</button>
      </fieldset>
    `;

    const result = host.querySelector<HTMLParagraphElement>('#ins-result');
    const terms = host.querySelector<HTMLParagraphElement>('#ins-terms');
    const button = host.querySelector<HTMLButtonElement>('#ins-calc');
    if (!result || !terms || !button) return;

    button.addEventListener('click', () => {
      const raw = {
        ratio: num(host.querySelector<HTMLInputElement>('#ins-ratio')!),
        correctionFactor: num(host.querySelector<HTMLInputElement>('#ins-cf')!),
        target: num(host.querySelector<HTMLInputElement>('#ins-target')!),
        current: num(host.querySelector<HTMLInputElement>('#ins-current')!),
        carbs: num(host.querySelector<HTMLInputElement>('#ins-carbs')!),
      };
      const parsed = insulinParamsSchema.safeParse(raw);
      if (!parsed.success) {
        result.textContent = strings.incomplete;
        terms.textContent = '';
        return;
      }
      const computed = arithmeticTerms(parsed.data);
      result.textContent = `${computed.total} ${strings.unit}`;
      terms.textContent = `${strings.meal}: ${computed.forMeal} ${strings.unit} · ${strings.correction}: ${computed.forCorrection} ${strings.unit}`;
    });
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
}
