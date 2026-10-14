// Escenarios del registro diario: editar y quitar una comida ya registrada.
// Van en su propio fichero para no tocar scenarios.mjs (spec 17 en curso).
import {
  assertEqual,
  clearDatabase,
  click,
  readStore,
  reload,
  setValue,
  unregisterServiceWorkers,
  waitFor,
} from './helpers.mjs';

async function openApp(page, base) {
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await unregisterServiceWorkers(page);
  await clearDatabase(page);
  await page.evaluate(() => {
    localStorage.setItem('carbos.locale', 'es');
    localStorage.setItem('carbos.onboarded', '1');
  });
  await reload(page);
  await waitFor(page, '#app header h1');
}

/** Anade el primer resultado del catalogo al borrador (modo Buscar). */
async function addFood(page, query) {
  await page.$eval('#entry-mode-search', (el) => {
    el.checked = true;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await setValue(page, '#food-search', query);
  await page.waitForSelector('#search-results button.result', { timeout: 8000 });
  await page.$eval('#search-results button.result', (el) => el.click());
  await page.waitForSelector('#draft-items .draft-row', { timeout: 8000 });
}

async function register(page) {
  await click(page, '#register');
  await page.waitForSelector('#diary .timeline-entry', { timeout: 8000 });
}

export const scenarios = [
  {
    name: 'edita una comida registrada sin duplicarla',
    async run(page, ctx) {
      await openApp(page, ctx.base);
      await addFood(page, 'pan');
      await register(page);

      // Las acciones viven en el detalle: hay que expandirlo antes (B5).
      await click(page, '#diary .timeline-entry--meal .timeline-toggle');
      await page.waitForFunction(
        () => {
          const detail = document.querySelector('#diary .timeline-entry--meal .timeline-detail');
          return Boolean(detail) && !detail.hidden;
        },
        { timeout: 8000 },
      );
      await click(page, '#diary .edit-entry');
      // El borrador se rellena y el boton pasa a Guardar.
      await page.waitForFunction(
        () => document.getElementById('register')?.textContent?.includes('Guardar'),
        { timeout: 8000 },
      );
      const draftRows = await page.$$eval('#draft-items .draft-row', (nodes) => nodes.length);
      assertEqual(draftRows, 1, 'el borrador carga los alimentos de la comida');

      // Ajusta los gramos y guarda.
      await page.$eval('#draft-items input[type="number"]', (el) => {
        el.value = '250';
        el.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await click(page, '#register');
      await page.waitForFunction(
        () => document.getElementById('register')?.textContent?.includes('Registrar'),
        { timeout: 8000 },
      );

      const meals = await readStore(page, 'meals');
      assertEqual(meals.length, 1, 'sigue habiendo exactamente una comida');
      assertEqual(meals[0].items[0].grams, 250, 'los gramos quedan actualizados');
    },
  },
  {
    name: 'quita una comida registrada del diario',
    async run(page, ctx) {
      await openApp(page, ctx.base);
      await addFood(page, 'pan');
      await register(page);

      // Las acciones viven en el detalle: hay que expandirlo antes (B5).
      await click(page, '#diary .timeline-entry--meal .timeline-toggle');
      await page.waitForFunction(
        () => {
          const detail = document.querySelector('#diary .timeline-entry--meal .timeline-detail');
          return Boolean(detail) && !detail.hidden;
        },
        { timeout: 8000 },
      );
      await click(page, '#diary .delete-entry');
      await page.waitForFunction(() => !document.querySelector('#diary .timeline-entry'), {
        timeout: 8000,
      });
      const meals = await readStore(page, 'meals');
      assertEqual(meals.length, 0, 'no queda ninguna comida');
    },
  },
];
