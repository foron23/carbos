// Escenarios del registro diario: editar y quitar una comida ya registrada.
// Van en su propio fichero para no tocar scenarios.mjs (spec 17 en curso).
// `openApp` (helpers.mjs) aisla el estado entre escenarios, incluido el borrador
// persistente (D62).
import {
  assert,
  assertEqual,
  click,
  openApp,
  readStore,
  reload,
  screenshot,
  setValue,
  text,
} from './helpers.mjs';

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

/**
 * SPEC 25 (D65): registro de comidas y agrupacion. Helpers locales para no tocar
 * los escenarios existentes de este fichero.
 */

/** Registra y espera a que el diario tenga al menos `expected` comidas sueltas. */
async function registerMeals(page, expected) {
  await click(page, '#register');
  await page.waitForFunction(
    (n) => document.querySelectorAll('#diary .timeline-entry--meal').length >= n,
    { timeout: 8000 },
    expected,
  );
}

/** Crea `count` comidas en el dia en vista (mismo alimento, horas propias). */
async function addMeals(page, count, query = 'pan') {
  for (let i = 1; i <= count; i += 1) {
    await addFood(page, query);
    await registerMeals(page, i);
  }
}

const parseGrams = (value) => Number.parseFloat(String(value).replace(',', '.'));

/** Marca el checkbox de seleccion en la posicion `index` (re-consulta cada vez). */
async function selectMealAt(page, index) {
  await page.evaluate((i) => {
    const boxes = Array.from(
      document.querySelectorAll('#diary .select-meal input[type="checkbox"]'),
    );
    const box = boxes[i];
    if (!box) throw new Error(`no hay checkbox de seleccion en la posicion ${i}`);
    box.click();
  }, index);
}

/** Entra en modo seleccion (entrada visible `Seleccionar`). */
async function enterSelection(page) {
  await click(page, '#select-meals');
  await page.waitForSelector('#diary .select-meal input[type="checkbox"]', { timeout: 8000 });
}

/** Junta las dos primeras comidas del dia y espera la entrada de grupo. */
async function groupFirstTwo(page) {
  await enterSelection(page);
  await selectMealAt(page, 0);
  await selectMealAt(page, 1);
  await page.waitForFunction(() => document.getElementById('group-meals')?.disabled === false, {
    timeout: 8000,
  });
  await click(page, '#group-meals');
  await page.waitForSelector('#diary .timeline-entry--group', { timeout: 8000 });
  await page.waitForFunction(
    () => document.querySelectorAll('#diary .timeline-entry--meal').length === 0,
    { timeout: 8000 },
  );
}

/** Borra una comida del store directamente (la UI no expone borrar una hija plegada). */
async function deleteMealFromStore(page, id) {
  await page.evaluate(
    (mealId) =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open('carbos');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('meals', 'readwrite');
          tx.objectStore('meals').delete(mealId);
          tx.oncomplete = () => {
            db.close();
            resolve(true);
          };
          tx.onerror = () => {
            db.close();
            reject(tx.error);
          };
        };
      }),
    id,
  );
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
      // Un borrador de EDICION no se persiste (recargar no debe duplicar; D62).
      assertEqual(
        await page.evaluate(() => localStorage.getItem('carbos.draft')),
        null,
        'el borrador de edicion no se persiste',
      );

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
  {
    name: 'junta dos comidas del dia en un grupo con total derivado',
    async run(page, ctx) {
      await openApp(page, ctx.base);
      await addMeals(page, 2);
      const stored = await readStore(page, 'meals');
      const raw = stored.reduce(
        (sum, meal) =>
          sum + meal.items.reduce((acc, item) => acc + (item.grams * item.carbsPer100g) / 100, 0),
        0,
      );
      const expected = Math.round(raw * 10) / 10;

      await groupFirstTwo(page);

      const groupCarbs = parseGrams(
        await text(page, '#diary .timeline-entry--group .timeline-carbs'),
      );
      assert(
        Math.abs(groupCarbs - expected) < 0.05,
        `el total del grupo (${groupCarbs}) = suma de las hijas (${expected})`,
      );
      assertEqual(
        await page.$$eval('#diary .timeline-entry--meal', (nodes) => nodes.length),
        0,
        'las dos comidas sueltas se pliegan bajo el grupo',
      );
      assertEqual(
        await page.$$eval('#diary .timeline-entry--group', (nodes) => nodes.length),
        1,
        'aparece una unica entrada de grupo',
      );
      await screenshot(page, 'grupo-juntar');
    },
  },
  {
    name: 'separar deja las comidas hijas intactas',
    async run(page, ctx) {
      await openApp(page, ctx.base);
      await addMeals(page, 2);
      const before = await readStore(page, 'meals');
      const shape = (list) =>
        list
          .map((meal) => ({ id: meal.id, time: meal.time, items: meal.items }))
          .sort((a, b) => (a.id < b.id ? -1 : 1))
          .map((meal) => JSON.stringify(meal));

      await groupFirstTwo(page);
      await click(page, '#diary .timeline-entry--group .timeline-toggle');
      await click(page, '#diary .ungroup-entry');
      await page.waitForFunction(
        () => document.querySelectorAll('#diary .timeline-entry--group').length === 0,
        { timeout: 8000 },
      );
      await page.waitForFunction(
        () => document.querySelectorAll('#diary .timeline-entry--meal').length === 2,
        { timeout: 8000 },
      );

      const after = await readStore(page, 'meals');
      assertEqual(after.length, 2, 'siguen las dos comidas hijas tras separar');
      assertEqual(
        JSON.stringify(shape(after)),
        JSON.stringify(shape(before)),
        'las hijas quedan intactas (mismos id, hora e items)',
      );
      assertEqual((await readStore(page, 'groups')).length, 0, 'el contenedor desaparece');
      await screenshot(page, 'grupo-separar');
    },
  },
  {
    name: 'el resumen del dia cuenta las comidas hijas y reparte por momento',
    async run(page, ctx) {
      await openApp(page, ctx.base);
      await addMeals(page, 2);
      await groupFirstTwo(page);

      assertEqual(
        await text(page, '#summary-meals'),
        '2',
        'el resumen cuenta las dos comidas hijas, no el grupo',
      );
      const total = parseGrams(await text(page, '#summary-carbs'));
      const moments = await page.$$eval('.moment-carbs', (nodes) =>
        nodes.map((node) => Number.parseFloat((node.textContent ?? '0').replace(',', '.'))),
      );
      assertEqual(moments.length, 3, 'hay tres momentos');
      const sum = moments.reduce((acc, value) => acc + value, 0);
      assert(
        Math.abs(sum - total) < 0.5,
        `los tres momentos suman el total del dia (${sum} vs ${total})`,
      );

      const groups = await readStore(page, 'groups');
      assert(!('slot' in groups[0]), 'el grupo no introduce slot');
      await screenshot(page, 'grupo-resumen');
    },
  },
  {
    name: 'no se puede juntar menos de dos comidas',
    async run(page, ctx) {
      await openApp(page, ctx.base);
      await addMeals(page, 2);
      await enterSelection(page);

      const disabled = () => page.$eval('#group-meals', (el) => el.disabled);
      assert(await disabled(), 'Juntar empieza deshabilitado con 0 seleccionadas');
      await selectMealAt(page, 0);
      assert(await disabled(), 'Juntar sigue deshabilitado con 1 seleccionada');
      await selectMealAt(page, 1);
      assert(!(await disabled()), 'Juntar se habilita con 2 seleccionadas');
      await screenshot(page, 'grupo-minimo');
    },
  },
  {
    name: 'la cascada deshace un grupo que se queda con una sola comida',
    async run(page, ctx) {
      await openApp(page, ctx.base);
      await addMeals(page, 2);
      await groupFirstTwo(page);

      const stored = await readStore(page, 'meals');
      await deleteMealFromStore(page, stored[0].id);

      await reload(page);
      await page.waitForSelector('#diary .timeline-entry', { timeout: 8000 });
      await page.waitForFunction(
        () => document.querySelectorAll('#diary .timeline-entry--group').length === 0,
        { timeout: 8000 },
      );
      assertEqual(
        await page.$$eval('#diary .timeline-entry--meal', (nodes) => nodes.length),
        1,
        'queda la comida hija superviviente',
      );
      assertEqual(
        (await readStore(page, 'groups')).length,
        0,
        'el grupo se deshace solo al quedar con <2 comidas (cascada)',
      );
      await screenshot(page, 'grupo-cascada');
    },
  },
  {
    name: 'el grupo sobrevive a la recarga sin hora ni slot',
    async run(page, ctx) {
      await openApp(page, ctx.base);
      await addMeals(page, 2);
      const mealIds = (await readStore(page, 'meals')).map((meal) => meal.id).sort();
      await groupFirstTwo(page);

      await reload(page);
      await page.waitForSelector('#diary .timeline-entry--group', { timeout: 8000 });
      assertEqual(
        await page.$$eval('#diary .timeline-entry--meal', (nodes) => nodes.length),
        0,
        'las hijas siguen plegadas tras recargar',
      );

      const groups = await readStore(page, 'groups');
      assertEqual(groups.length, 1, 'el grupo persiste tras la recarga');
      const group = groups[0];
      assert(typeof group.id === 'string' && group.id.length > 0, 'el grupo tiene id');
      assert(typeof group.date === 'string' && group.date.length > 0, 'el grupo tiene date');
      assertEqual(group.mealIds.length, 2, 'el grupo referencia dos comidas');
      assertEqual(
        [...group.mealIds].sort().join(','),
        mealIds.join(','),
        'referencia las dos hijas',
      );
      assert(!('slot' in group) && !('time' in group), 'el grupo no tiene slot ni hora');
      await screenshot(page, 'grupo-persistencia');
    },
  },
  {
    name: 'Seleccionar es visible y el checkbox mide al menos 44 px',
    async run(page, ctx) {
      await openApp(page, ctx.base);
      await addMeals(page, 2);

      const visible = await page.$eval('#select-meals', (el) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && getComputedStyle(el).visibility !== 'hidden';
      });
      assert(visible, 'existe una entrada visible Seleccionar');
      assertEqual(await text(page, '#select-meals'), 'Seleccionar', 'el boton dice Seleccionar');

      await enterSelection(page);
      const hit = await page.$eval('#diary label.select-meal', (el) => {
        const rect = el.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      });
      assert(
        hit.width >= 44 && hit.height >= 44,
        `el area del checkbox mide >= 44 px (${hit.width}x${hit.height})`,
      );
      const focusable = await page.$eval(
        '#diary .select-meal input[type="checkbox"]',
        (el) => el.tagName === 'INPUT' && el.type === 'checkbox' && el.tabIndex >= 0,
      );
      assert(focusable, 'el checkbox es enfocable por teclado');
      await screenshot(page, 'grupo-accesibilidad');
    },
  },
  {
    name: 'la pulsacion larga entra en modo seleccion',
    async run(page, ctx) {
      await openApp(page, ctx.base);
      await addMeals(page, 2);

      // Pulsacion larga sobre la tarjeta (no sobre un control): dispara el
      // temporizador (~500 ms) y entra en modo seleccion marcando esa comida.
      await page.$eval('#diary .timeline-entry--meal .timeline-card', (card) => {
        const rect = card.getBoundingClientRect();
        card.dispatchEvent(
          new window.PointerEvent('pointerdown', {
            bubbles: true,
            pointerType: 'touch',
            button: 0,
            clientX: rect.left + 20,
            clientY: rect.top + 20,
          }),
        );
      });
      await page.waitForSelector('#diary .select-meal input[type="checkbox"]', { timeout: 4000 });

      const checked = await page.$$eval(
        '#diary .select-meal input[type="checkbox"]',
        (boxes) => boxes.filter((box) => box.checked).length,
      );
      assert(checked === 1, 'la pulsacion larga marca exactamente la comida pulsada');

      // Levantar el puntero no tumba el modo seleccion ni la marca.
      await page.$eval('#diary .timeline-entry--meal .timeline-card', (card) => {
        card.dispatchEvent(
          new window.PointerEvent('pointerup', { bubbles: true, pointerType: 'touch', button: 0 }),
        );
      });
      assert(
        await page.$eval('#group-controls', (el) => !el.hidden),
        'el modo seleccion sigue activo tras levantar el puntero',
      );
      await screenshot(page, 'seleccion-larga');
    },
  },
];
