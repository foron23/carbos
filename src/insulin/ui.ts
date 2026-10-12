import { arithmeticTerms, insulinParamsSchema } from './arithmetic';
import { isInsulinEnabled, setInsulinEnabled } from './flag';

function num(input: HTMLInputElement): number {
  const value = Number.parseFloat(input.value);
  return Number.isFinite(value) ? value : Number.NaN;
}

export function setupInsulin(host: HTMLElement, toggle: HTMLInputElement): void {
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
        <legend>Calculadora (tus numeros)</legend>
        <p class="muted">
          Es la aritmetica que has pedido, con tus numeros. No es consejo medico ni un
          dispositivo medico. Revisa y ajusta con tu equipo medico.
        </p>
        <div class="grid">
          <label>Ratio (g por U)<input id="ins-ratio" type="number" min="0" step="0.1" value="10" /></label>
          <label>Factor correccion (mg/dL por U)<input id="ins-cf" type="number" min="0" step="1" value="50" /></label>
          <label>Objetivo (mg/dL)<input id="ins-target" type="number" min="0" step="1" value="100" /></label>
          <label>Glucosa actual (mg/dL)<input id="ins-current" type="number" min="0" step="1" value="100" /></label>
          <label>Carbohidratos (g)<input id="ins-carbs" type="number" min="0" step="1" value="0" /></label>
        </div>
        <p id="ins-result" class="total" aria-live="polite">0 U</p>
        <p id="ins-terms" class="muted"></p>
        <button id="ins-calc" type="button" class="primary">Calcular</button>
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
        result.textContent = 'Datos incompletos';
        terms.textContent = '';
        return;
      }
      const computed = arithmeticTerms(parsed.data);
      result.textContent = `${computed.total} U`;
      terms.textContent = `Comida: ${computed.forMeal} U · Correccion: ${computed.forCorrection} U`;
    });
  };

  toggle.addEventListener('change', () => {
    setInsulinEnabled(toggle.checked);
    renderTab();
  });

  renderTab();
}
