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
}

function num(input: HTMLInputElement): number {
  const value = Number.parseFloat(input.value);
  return Number.isFinite(value) ? value : Number.NaN;
}

export function setupInsulin(
  host: HTMLElement,
  toggle: HTMLInputElement,
  strings: InsulinStrings,
): void {
  toggle.checked = isInsulinEnabled();

  const renderTab = (): void => {
    if (!toggle.checked) {
      host.innerHTML = '';
      host.hidden = true;
      return;
    }
    host.hidden = false;
    host.innerHTML = `
      <fieldset>
        <legend>${strings.title}</legend>
        <p class="muted">${strings.disclaimer}</p>
        <div class="grid">
          <label>${strings.ratio}<input id="ins-ratio" type="number" min="0" step="0.1" value="10" /></label>
          <label>${strings.correctionFactor}<input id="ins-cf" type="number" min="0" step="1" value="50" /></label>
          <label>${strings.target}<input id="ins-target" type="number" min="0" step="1" value="100" /></label>
          <label>${strings.current}<input id="ins-current" type="number" min="0" step="1" value="100" /></label>
          <label>${strings.carbs}<input id="ins-carbs" type="number" min="0" step="1" value="0" /></label>
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
    setInsulinEnabled(toggle.checked);
    renderTab();
  });

  renderTab();
}
