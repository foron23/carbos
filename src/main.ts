import './style.css';
import {
  dayCarbs,
  fromJson,
  itemCarbs,
  loadVault,
  mealCarbs,
  putMeal,
  replaceVault,
  roundCarbs,
  toJson,
} from './core';
import type { Meal, MealSlot } from './core';
import { setupInsulin } from './insulin';

const SLOTS: ReadonlyArray<{ value: MealSlot; label: string }> = [
  { value: 'breakfast', label: 'Desayuno' },
  { value: 'lunch', label: 'Comida' },
  { value: 'dinner', label: 'Cena' },
  { value: 'snack', label: 'Snack' },
];

function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Elemento no encontrado: #${id}`);
  return node as T;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function uid(): string {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
}

function slotLabel(slot: MealSlot): string {
  return SLOTS.find((s) => s.value === slot)?.label ?? slot;
}

const app = byId('app');
app.innerHTML = `
  <header>
    <h1>Carbos</h1>
    <p class="muted">Cuenta carbohidratos. En tu dispositivo, y solo en tu dispositivo.</p>
  </header>

  <fieldset>
    <legend>Hoy</legend>
    <label for="date">Fecha</label>
    <input id="date" type="date" />
    <p>Total: <span id="day-total" class="total">0 g</span></p>
  </fieldset>

  <fieldset>
    <legend>Anadir comida</legend>
    <form id="meal-form">
      <div class="grid">
        <label>Comida
          <select id="meal-slot">
            ${SLOTS.map((s) => `<option value="${s.value}">${s.label}</option>`).join('')}
          </select>
        </label>
        <label>Alimento
          <input id="meal-name" type="text" required placeholder="p. ej. tortilla" />
        </label>
        <label>Gramos
          <input id="meal-grams" type="number" min="0" step="1" value="100" required />
        </label>
        <label>Carbohidratos por 100 g
          <input id="meal-carbsp100" type="number" min="0" step="0.1" value="0" required />
        </label>
      </div>
      <p><button type="submit" class="primary">Registrar</button></p>
    </form>
    <p class="muted">Estimacion. Revisa y ajusta los gramos.</p>
  </fieldset>

  <fieldset>
    <legend>Registro</legend>
    <ul id="meals"></ul>
  </fieldset>

  <fieldset>
    <legend>Copia</legend>
    <p>
      <button id="export" type="button">Exportar JSON</button>
      <label for="import" class="muted" style="display:inline">Importar</label>
      <input id="import" type="file" accept="application/json" />
    </p>
    <p class="muted">El navegador puede borrar los datos sin avisar. Exporta a menudo.</p>
  </fieldset>

  <fieldset>
    <legend>Ajustes</legend>
    <label>
      <input id="insulin-toggle" type="checkbox" />
      Activar modulo de aritmetica de insulina (opt-in)
    </label>
    <div id="insulin-host" hidden></div>
  </fieldset>
`;

async function render(): Promise<void> {
  const vault = await loadVault();
  const date = byId<HTMLInputElement>('date').value || today();
  byId('day-total').textContent = `${roundCarbs(dayCarbs(vault.meals, date))} g`;

  const list = byId('meals');
  const meals = vault.meals.filter((meal) => meal.date === date);
  if (meals.length === 0) {
    list.innerHTML = '<li class="muted">Sin comidas registradas.</li>';
    return;
  }
  list.innerHTML = '';
  for (const meal of meals) {
    const item = document.createElement('li');
    const items = meal.items
      .map((food) => `${food.name} ${food.grams} g (${roundCarbs(itemCarbs(food))} g)`)
      .join(', ');
    item.textContent = `${slotLabel(meal.slot)}: ${items} — ${roundCarbs(mealCarbs(meal))} g`;
    list.appendChild(item);
  }
}

function wire(): void {
  const dateInput = byId<HTMLInputElement>('date');
  dateInput.value = today();
  dateInput.addEventListener('change', () => {
    void render();
  });

  byId<HTMLFormElement>('meal-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const meal: Meal = {
      id: uid(),
      date: dateInput.value || today(),
      slot: byId<HTMLSelectElement>('meal-slot').value as MealSlot,
      items: [
        {
          id: uid(),
          name: byId<HTMLInputElement>('meal-name').value.trim(),
          grams: Number.parseFloat(byId<HTMLInputElement>('meal-grams').value) || 0,
          carbsPer100g: Number.parseFloat(byId<HTMLInputElement>('meal-carbsp100').value) || 0,
        },
      ],
      confidence: null,
    };
    void putMeal(meal).then(render);
  });

  byId('export').addEventListener('click', () => {
    void loadVault().then((vault) => {
      const blob = new Blob([toJson(vault)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `carbos-${today()}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    });
  });

  byId<HTMLInputElement>('import').addEventListener('change', (event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    void file
      .text()
      .then((text) => replaceVault(fromJson(text)))
      .then(render)
      .catch(() => window.alert('No se pudo importar el fichero.'));
  });

  setupInsulin(byId('insulin-host'), byId<HTMLInputElement>('insulin-toggle'));
}

wire();
void render();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* PWA opcional: sin service worker la app sigue funcionando */
    });
  });
}
