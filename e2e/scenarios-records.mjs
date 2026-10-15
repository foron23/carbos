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

/**
 * Acopia la comida en la posicion `index` tocando el asa de arrastre
 * (re-consulta cada vez). El toque es el fallback accesible del gesto (WCAG 2.5.1).
 */
async function stageMealAt(page, index) {
  await page.evaluate((i) => {
    const handles = Array.from(
      document.querySelectorAll('#diary .timeline-entry--meal .drag-handle'),
    );
    const handle = handles[i];
    if (!handle) throw new Error(`no hay asa de arrastre en la posicion ${i}`);
    handle.click();
  }, index);
}

/**
 * Arrastra (con punteros reales) el asa `fromIndex` que case con `fromSelector`
 * hasta el centro de `toSelector`. Mide AMBAS posiciones tras un unico
 * `scrollIntoView` (hacerlo por separado invalida la primera).
 * Firefox emite `pointerdown/move/up` a partir de `page.mouse`.
 */
async function dragTo(page, fromSelector, fromIndex, toSelector) {
  const pos = await page.evaluate(
    (fSel, i, tSel) => {
      const f = document.querySelectorAll(fSel)[i];
      const t = document.querySelector(tSel);
      if (!f) throw new Error(`no existe ${fSel}[${i}]`);
      if (!t) throw new Error(`no existe ${tSel}`);
      // Centra el DESTINO (elemento inferior): asi el origen queda por encima y
      // ambos visibles con el contenido corto de la prueba.
      t.scrollIntoView({ block: 'center' });
      const fr = f.getBoundingClientRect();
      const tr = t.getBoundingClientRect();
      return {
        from: { x: Math.round(fr.left + fr.width / 2), y: Math.round(fr.top + fr.height / 2) },
        to: { x: Math.round(tr.left + tr.width / 2), y: Math.round(tr.top + tr.height / 2) },
      };
    },
    fromSelector,
    fromIndex,
    toSelector,
  );
  await page.mouse.move(pos.from.x, pos.from.y);
  await page.mouse.down();
  await page.mouse.move(
    Math.round((pos.from.x + pos.to.x) / 2),
    Math.round((pos.from.y + pos.to.y) / 2),
    { steps: 6 },
  );
  await page.mouse.move(pos.to.x, pos.to.y, { steps: 6 });
  await page.mouse.up();
}

/** Junta las dos primeras comidas del dia y espera la entrada de grupo. */
async function groupFirstTwo(page) {
  await stageMealAt(page, 0);
  await stageMealAt(page, 1);
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

      const disabled = () => page.$eval('#group-meals', (el) => el.disabled);
      assert(await disabled(), 'Juntar empieza deshabilitado con 0 acopiadas');
      await stageMealAt(page, 0);
      assert(await disabled(), 'Juntar sigue deshabilitado con 1 acopiada');
      await stageMealAt(page, 1);
      assert(!(await disabled()), 'Juntar se habilita con 2 acopiadas');
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
    name: 'el asa de arrastre mide al menos 44 px y acopia al tocarla',
    async run(page, ctx) {
      await openApp(page, ctx.base);
      await addMeals(page, 2);

      const handle = await page.$eval('#diary .timeline-entry--meal .drag-handle', (el) => {
        const rect = el.getBoundingClientRect();
        return {
          width: rect.width,
          height: rect.height,
          tag: el.tagName,
          type: el.getAttribute('type'),
          tabIndex: el.tabIndex,
          label: (el.getAttribute('aria-label') || '').trim(),
        };
      });
      assertEqual(handle.tag, 'BUTTON', 'el asa es un boton real');
      assertEqual(handle.type, 'button', 'el asa no envia formularios');
      assert(handle.tabIndex >= 0, 'el asa es enfocable por teclado');
      assert(handle.label.length > 0, 'el asa tiene nombre accesible');
      assert(
        handle.width >= 44 && handle.height >= 44,
        `el asa mide >= 44 px (${handle.width}x${handle.height})`,
      );

      await stageMealAt(page, 0);
      assertEqual(
        await page.$$eval('#group-staged .group-staged-chip', (nodes) => nodes.length),
        1,
        'tocar el asa acopia la comida en la bandeja',
      );
      assert(
        await page.$eval(
          '#diary .timeline-entry--meal .drag-handle',
          (el) => el.getAttribute('aria-pressed') === 'true',
        ),
        'el asa acopiada queda marcada (aria-pressed)',
      );
      await screenshot(page, 'grupo-accesibilidad');
    },
  },
  {
    name: 'arrastrar un asa a la bandeja acopia la comida',
    async run(page, ctx) {
      await openApp(page, ctx.base);
      await addMeals(page, 2);

      await dragTo(page, '#diary .timeline-entry--meal .drag-handle', 0, '#group-tray');
      await page.waitForFunction(
        () => document.querySelectorAll('#group-staged .group-staged-chip').length === 1,
        { timeout: 8000 },
      );
      assertEqual(
        await page.$$eval('#group-staged .group-staged-chip', (nodes) => nodes.length),
        1,
        'soltar el asa sobre la bandeja acopia esa comida',
      );
      await screenshot(page, 'grupo-arrastre');
    },
  },
  {
    name: 'arrastrar una hija fuera del grupo la separa (cascada)',
    async run(page, ctx) {
      await openApp(page, ctx.base);
      await addMeals(page, 2);
      await groupFirstTwo(page);
      await click(page, '#diary .timeline-entry--group .timeline-toggle');
      await page.waitForSelector('#diary .timeline-group-item .drag-handle', { timeout: 8000 });

      await dragTo(page, '#diary .timeline-group-item .drag-handle', 0, '#group-tray');

      await page.waitForFunction(
        () => document.querySelectorAll('#diary .timeline-entry--group').length === 0,
        { timeout: 8000 },
      );
      await page.waitForFunction(
        () => document.querySelectorAll('#diary .timeline-entry--meal').length === 2,
        { timeout: 8000 },
      );
      assertEqual(
        (await readStore(page, 'groups')).length,
        0,
        'el grupo se deshace al quedarse con <2 hijas (cascada)',
      );
      await screenshot(page, 'grupo-arrastre-hija');
    },
  },
];
