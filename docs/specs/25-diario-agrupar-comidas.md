# 25 - Diario: agrupar comidas

> [!abstract] TL;DR
> El Diario (linea de tiempo de SPEC 22) registra cada comida como una `Meal` suelta
> con su hora. Cuando lo que era **una sola comida** se registro en **momentos
> distintos** (la tostada a las 8:05, el cafe a las 8:20), hoy no hay forma de
> **reagruparlas**. Esta spec anade **juntar comidas** como un **contenedor nombrado,
> no destructivo y persistente**: la persona **arrastra** dos o mas comidas del dia a una
> **bandeja de grupo** y las pliega bajo una entrada con **total derivado**; **Separar**
> deshace el contenedor y deja las hijas **intactas**. El grupo **no tiene hora ni slot**
> (respeta **D36** y **D57**), es **reversible** (D33) y **no alimenta ninguna dosis**
> (D10/D12). El gesto principal es **arrastrar el asa de 6 puntos** (_drag handle_) a la
> bandeja; tocar el asa (o Enter/Espacio) es la **alternativa accesible** (D16/WCAG
> 2.5.1): **sin checkboxes ni modo seleccion**. Introduce `Vault.groups` ->
> **SCHEMA_VERSION 3 -> 4** con migracion tolerante. Sin backend, sin analitica, sin
> dependencias nuevas (D11).

## Contexto

SPEC 22 cerro el Diario como linea de tiempo; SPEC 23/24 lo pulieron con atajos,
objetivo, repetir y borrador persistente. Queda un hueco:

**El dia se registra en trozos que a veces son una sola cosa.** Cuando los alimentos
entran **juntos** en el borrador ya forman **una** `Meal` (`Meal.items`,
`src/core/types.ts:25-33`; el borrador es una lista plana que se registra como una
comida, D41). El problema aparece cuando lo que era una comida se registro **en
momentos distintos**: la tostada a las 8:05 y el cafe a las 8:20 quedan como dos
comidas; la fruta del postre unos minutos despues, como una tercera. Hoy no hay forma
de **reagrupar despues** comidas ya registradas.

La investigacion de producto (2026-10-15; ver Referencias) lo confirma: Cronometer
("Diary Groups"), Carbs & Cals ("Group foods into a Meal") y MyFitnessPal ("Save as
Meal") ofrecen agrupar instancias **ya registradas**, y el patron dominante es **no
destructivo y reversible** ("Create Meal from Group ... will not change those items in
your diary"; "Explode" revierte). La operacion no crea ni reescribe comidas: es una
vista.

Esto **no** cambia el nucleo: no anade red, no toca la deteccion (D12) ni la aritmetica
de insulina (D10).

## Metodo

1. **Investigacion en internet (2026-10-15)** sobre agrupacion/merge de comidas (MFP,
   Cronometer, Carbs & Cals, Yazio, FoodNoms; merge destructivo vs contenedor
   reversible) y sobre patrones de interaccion movil (pulsacion larga vs modo
   seleccion).
2. **Long-list** de candidatas (7) con el patron comun documentado.
3. **Filtro** por cuatro criterios con la misma escala (1-3): **Impacto**,
   **Frecuencia**, **Esfuerzo** (3 = menos esfuerzo -> mas puntua) y **Encaje** con los
   guardarrailes (D10, D12, D33, D36, D57 y la identidad calmada de SPEC 16/22).
4. **Seleccion** de la mejor, descartando el resto.

## Candidatas y filtro

| #   | Candidata                                                       | Impacto | Frec. | Esfz. | Encaje | Total | ¿Elegida?  | Motivo del descarte                                                                    |
| --- | --------------------------------------------------------------- | ------- | ----- | ----- | ------ | ----- | ---------- | -------------------------------------------------------------------------------------- |
| C1  | **Juntar comidas en una sola** (fusion destructiva)             | 3       | 2     | 2     | 1      | 8     | no         | Irreversible: pierde IDs/horas hijas; choca con D33 y con el patron no destructivo     |
| C2  | **Agrupar comidas como contenedor reversible** (plegar/separar) | 3       | 2     | 2     | 3      | 10    | **F1**     | —                                                                                      |
| C3  | Guardar comida/plantilla re-registrable (saved meal)            | 2       | 3     | 3     | 3      | 11    | no         | Se solapa con D61 (Repetir) y es biblioteca de plantillas, no agrupacion de instancias |
| C4  | Recetas (plato compuesto reutilizable)                          | 3       | 2     | 1     | 2      | 8     | no         | Esfuerzo alto (editor de recetas); fuera del foco "reagrupar lo ya registrado"         |
| C5  | Nombrar/etiquetar comidas                                       | 2       | 2     | 3     | 3      | 10    | no         | **Absorbida por F1**: el grupo lleva nombre (no feature aparte)                        |
| C6  | Mover items entre comidas                                       | 2       | 1     | 2     | 2      | 7     | no         | Superficie de edicion de dominio; baja frecuencia; se cubre con Editar (borrador)      |
| C7  | Multi-seleccion en el Diario                                    | 2       | 2     | 3     | 3      | 10    | (parte F1) | Es el **gesto** de F1, no una feature suelta                                           |

**Elegida: C2 (contenedor reversible)**, tomando de C7 el gesto (**arrastrar a la
bandeja**, no multi-seleccion) y de C5 el nombre del grupo.

> **Cautela (deuda declarada).** Registrar varios alimentos **juntos** ya produce
> **una** `Meal`; "juntar" aporta cuando la misma comida se registro en momentos
> distintos. Si el uso real fuera bajo, la mitigacion es cobertura por el gesto de
> "Editar" existente. Se medira por uso; no bloquea el diseno.

## La elegida: contenedor reversible

**Que.** En el Diario, la persona **arrastra** dos o mas comidas del dia a la
**bandeja de grupo** (o toca sus asas de 6 puntos como alternativa accesible) y pulsa
**Juntar**. Las comidas se **pliegan bajo una entrada contenedora** con nombre
opcional (p. ej. "Desayuno", "Post-entreno"); el contenedor muestra el **total derivado**
(suma de los carbos de las hijas) y el recuento ("3 comidas"). **Separar** (_explode_)
deshace el contenedor y deja las comidas hijas **intactas**. No se registra ninguna
comida nueva ni se reescribe ninguna hija. **Sin checkboxes ni modo seleccion**: el
gesto es arrastrar-y-soltar (asa), con el toque/teclado sobre el asa como fallback
accesible (WCAG 2.5.1).

**Definicion.**

- El grupo es un **contenedor que referencia IDs de comidas** (`mealIds`), **no** una
  copia ni una fusion. Los items, la hora, el origen y la confianza de cada hija no se
  tocan.
- **El grupo no tiene hora propia ni slot.** Se **coloca** en la linea de tiempo en la
  hora de la hija **mas temprana** (presentacional).
- El **total del grupo se deriva** de las hijas en cada render; **no** se almacena.
- **Separar** elimina el contenedor; si una hija fue editada mientras estaba agrupada,
  sigue con su edicion.
- El **resumen del dia (D55)** y el **reparto por momento (D57)** siguen contando las
  **comidas hijas**: "comidas" = numero de `Meal`, y los carbos se reparten por la
  **hora de cada hija**. El grupo es solo un **pliegue visual**.
- **Cascada:** un grupo necesita **>= 2 comidas**; si editar o borrar deja una sola, el
  contenedor **se deshace solo** (las hijas quedan intactas).

**Por que.** Responder a "esto era una sola comida" sin obligar a reconstruirla, con el
patron asentado y **no destructivo**: la definicion de grupo **no** reescribe las
comidas; sus totales son **suma de hijos**, nunca almacenados.

**Guardarrailes.**

- **D36** — el contenedor **no tiene `slot`**: cada comida hija conserva **su hora**.
- **D57** — el agrupado es **presentacional**; el total se **deriva**; no se reintroduce
  ninguna franja.
- **D33** — **reversible y sin friccion**: _separar_ deshace el contenedor; no se aprende
  nada por alimento ni se toca la porcion.
- **D10/D12** — juntar **no** alimenta ninguna dosis y el modelo no interviene.
- **Arbitrario** — la frontera la impone el usuario al seleccionar; **no** se deriva del
  reloj.

## Decisiones nuevas (propuesta D65-D66)

| #   | Decision                                                       | Detalle                                                                                                                                                                                                                                                                                                                                                                            | Estado    |
| --- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| D65 | **Juntar comidas = contenedor reversible, persistido por IDs** | Arrastrar comidas registradas a una **bandeja** -> `MealGroup { id, date, name?, mealIds[] }` con nombre opcional; total **derivado**; **Separar** deshace el contenedor y deja las hijas intactas. Sin hora ni slot propios; el grupo se coloca en la hija mas temprana. **Amplia D36 y respeta D57**; reversible por D33. `SCHEMA_VERSION 3 -> 4` con migracion tolerante        | propuesta |
| D66 | **Gesto de agrupar: asa de arrastre con fallback accesible**   | El gesto primario es **arrastrar el asa de 6 puntos** de una comida a la **bandeja de grupo** (tactil y raton, punteros propios); arrastrar a un grupo existente anade la comida y arrastrar una hija fuera la separa. Tocar el asa (o Enter/Espacio) **acopia/desacopia** como alternativa accesible (D16/WCAG 2.5.1); el asa mide **>= 44 px**. Sin checkboxes ni modo seleccion | propuesta |

## Alcance

- **Nucleo:** nuevo `src/core/groups.ts` (puro: crear/separar grupo, hora del grupo,
  total derivado, cascada); `src/core/types.ts` (`Vault.groups?`, `MealGroup`);
  `src/core/schema.ts` (esquema del grupo); `src/core/migrate.ts` (v3 -> v4, tolerante
  y aceptando explicitamente `version === 3`); `src/core/timeline.ts` (plegado por
  grupo); `src/core/export.ts` (los grupos viajan en el export/import).
- **UI:** `src/main.ts` (`renderDiary`/`mealEntry` con el **asa de arrastre** y la
  **bandeja de grupo**; `groupEntry` con las asas de las hijas; `entryActions` para
  _Juntar/Separar_; DnD propio por punteros); `src/style.css` (bandeja, asa >= 44 px,
  fantasma de arrastre, `forced-colors`, reduced-motion).
- **i18n:** `src/i18n/index.ts` (claves ES/EN, guarda de paridad).
- **E2E:** `e2e/scenarios.mjs`, `e2e/scenarios-records.mjs`, `e2e/helpers.mjs`.
- Sin dependencias nuevas; sin red; sin backend/analitica (D11).

### Detalle

- **F1a.** `src/core/groups.ts` **puro**: `groupMeals(meals, mealIds, name)` (valida
  > =2 y pertenencia al dia), `groupCarbs(group, meals)` (derivado), `ungroup` ->
  > devuelve las comidas intactas, `pruneGroups(groups, meals)` -> deshace los grupos con
  > <2 hijas. Sin I/O.
- **F1b.** En el Diario, cada comida (y cada hija de un grupo) lleva un **asa de
  arrastre** de 6 puntos (>= 44 px, boton real). **Arrastrarla** a la **bandeja de
  grupo** la acopia; con >=2 acopiadas, _Juntar_ crea el contenedor y anuncia
  (`diary.grouped`). Arrastrarla sobre un grupo existente la anade; arrastrar una hija
  fuera de su grupo la separa (cascada si <2). Tocar el asa (o Enter/Espacio) es el
  fallback accesible: acopia/desacopia.
- **F1c.** El contenedor se muestra como una entrada con **nombre** (o "N comidas" si no
  se nombra) y **total derivado**; al expandir, lista las comidas hijas (mismo
  `createToggle`, SPEC 22 B5).
- **F1d.** _Separar_ deshace el contenedor y anuncia (`diary.ungrouped`); es
  **idempotente** sobre los datos (no toca las hijas).
- **F1e.** El grupo **no** participa en `carbsByMoment` ni en el conteo de comidas del
  resumen como unidad; ambos se calculan sobre las **comidas hijas**. No hay `slot`.
- **F1f.** **Cascada:** al borrar/editar una hija, `pruneGroups` deshace el grupo que
  quede con <2 comidas.
- **F1g.** **Migracion:** `migrateVault` acepta `1 | 2 | 3` y anade `groups: []` si
  falta; `SCHEMA_VERSION = 4`. Los vault v3 actuales migran sin perdida.

### i18n

| Clave                    | ES                                                           | EN                                                            |
| ------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------- |
| `button.group`           | Juntar                                                       | Group                                                         |
| `button.ungroup`         | Separar                                                      | Ungroup                                                       |
| `diary.group`            | Comida agrupada                                              | Grouped meal                                                  |
| `diary.groupName`        | Nombre del grupo (opcional)                                  | Group name (optional)                                         |
| `diary.groupCount`       | {n} comidas                                                  | {n} meals                                                     |
| `diary.groupTray`        | Grupo                                                        | Group                                                         |
| `diary.groupTrayHint`    | Arrastra comidas aquí para agruparlas.                       | Drag meals here to group them.                                |
| `diary.dragHandle`       | Mover comida                                                 | Move meal                                                     |
| `diary.dropHere`         | Suelta para agrupar                                          | Drop to group                                                 |
| `diary.staged`           | En el grupo                                                  | In the group                                                  |
| `diary.groupSelectHint`  | Toca el asa de una comida para ponerla o quitarla del grupo. | Tap a meal's handle to add it to or remove it from the group. |
| `diary.grouped` (aria)   | Comidas agrupadas.                                           | Meals grouped.                                                |
| `diary.ungrouped` (aria) | Comidas separadas.                                           | Meals split apart.                                            |

## Criterios de aceptacion

Los criterios marcados _(m)_ se comprueban con una formula concreta (Tests).

1. Con >=2 comidas en el dia, **arrastrar** dos asas a la **bandeja** y _Juntar_ las
   muestra como **una** entrada con el total = **suma** de los carbos de las hijas. _(m)_
2. _Separar_ deshace el contenedor y deja las comidas hijas **intactas** (mismos `id`,
   hora, items, origen, confianza); una hija editada conserva su edicion. _(m)_
3. El grupo **no** introduce `slot`; las hijas conservan su hora; el reparto por momento
   (D57) se calcula sobre las hijas, no sobre el grupo. _(m)_
4. Juntar/separar son **no destructivos e idempotentes** sobre los items (separar
   devuelve el mismo `Vault` salvo el contenedor). _(m)_
5. No se puede juntar <2 comidas ni comidas de dias distintos. _(m)_
6. **Cascada:** si editar/borrar deja el grupo con **<2 comidas**, el contenedor se
   deshace solo. _(m)_
7. **Persistencia:** un grupo sobrevive a la recarga; un `Vault` **v3** migra a **v4**
   sin perdida y sin romper (se acepta `version === 3`). _(m)_
8. **Accesibilidad:** el asa de arrastre es un **boton real** de **>= 44 px** con nombre
   accesible; tocarla (o Enter/Espacio) acopia/desacopia la comida (WCAG 2.5.1), sin
   checkboxes ni modo seleccion. _(m)_
9. **i18n:** toda clave nueva existe en **es** y **en**; guarda de paridad intacta.
10. **Sin regresiones:** SPEC 22 (nav, linea de tiempo, resumen), 23 (quick-add,
    objetivo, repetir) y 24 (borrador, busqueda, categorias) siguen verdes.
11. `make check` (+ `make e2e` con los escenarios nuevos) en verde.

## Tests

- **Unitarios** (vitest):
  - `src/core/groups.ts`: `groupMeals` valida >=2 y mismo dia; `groupCarbs` = suma de
    `mealCarbs`; ida y vuelta `group`/`ungroup` deja el `Vault` igual salvo el
    contenedor; la hora del grupo = minima de las hijas; `pruneGroups` deshace grupos
    con <2 hijas; no hay `slot`.
  - `src/core/migrate.ts`: v3 sin `groups` -> v4 con `groups: []`; se acepta `version
=== 3`; vault corrupto sigue tolerante.
- **E2E** (Firefox, `make e2e`): entrar en seleccion (boton `Seleccionar`), juntar dos
  comidas, verificar el total, recargar (el grupo persiste) y _separar_; la pulsacion
  larga se cubre de forma basica.
- **Auditoria** (`make audit-uiux`): checkbox de seleccion, botones Juntar/Separar y
  `Seleccionar` quedan cubiertos por la regla de objetivo tactil (MIN_HIT=44).
- **Gate**: `make check`.

## Fuera de alcance

- **Fusion destructiva** de comidas (C1): desaconsejada por D33.
- **Recetas / plantillas re-registrables** (C3/C4): se solapan con D61 (Repetir).
- **Mover items entre comidas** (C6) y **grupos anidados** (un solo nivel).
- **Agrupar registros de insulina**: el contenedor es solo de comidas.
- **Reintroducir franjas/slots** o agrupar por momento (D36/D57).
- **Cambios en la deteccion** (D12), en la aritmetica de insulina (D10) y en el
  export/import salvo incluir los grupos.
- **Backend, red, cuentas y sincronizacion** (D11) y **analitica**.

## Riesgos

- **Frecuencia baja** (registrar junto ya es una comida). Mitigacion: medir uso; el
  gesto de "Editar" sigue cubriendo el caso simple.
- **Contenedor percibido como perdida.** Mitigacion: **reversible** (D65) y _separar_
  idempotente; nada se borra.
- **Contenedor huerfano al editar/borrar una hija.** Mitigacion: cascada (criterio 6) y
  `pruneGroups` en cada render.
- **Contenedor persistido que apunta a IDs inexistentes** (import/borrado). Mitigacion:
  lectura tolerante (como el borrador D62); el contenedor se ignora si faltan hijas.
- **Bump de esquema mal hecho.** `migrateVault` (`src/core/migrate.ts:34`) solo acepta
  `1|2|3`; subir a 4 **exige** tolerar `version === 3` con test, o los vault actuales
  fallan. Incluido en criterios y tests.
- **Pulsacion larga poco descubrible.** Mitigacion: boton `Seleccionar` visible y hint
  (`diary.groupSelectHint`); teclado cubierto.

## Referencias

- MFP, _Create Meals and Recipes_; Cronometer, _Diary Groups_ y _Edit Diary Entries_
  (explode/multi-select); Carbs & Cals, _Create a custom meal (Group foods into Meal)_;
  Yazio, _What are meals_; FoodNoms, _Recipe vs meal_; Zero, _Saved Meals_. NN/g,
  _Progressive Disclosure_. W3C, WCAG 2.1 SC 2.5.1 (_Pointer Gestures_).
- `docs/specs/22-uiux-v3.md` (Diario, D54-D58), `docs/specs/23-calidad-de-vida.md`
  (D59-D61), `docs/specs/24-calidad-de-vida-2.md` (D62-D64), `docs/decisiones.md`
  (D10, D11, D12, D33, D36, D57).
- `src/main.ts` (`renderDiary` 1655, `mealEntry` 1520, `entryActions` 1437,
  `repeatMeal` 1487), `src/core/timeline.ts`, `src/core/moments.ts`,
  `src/core/migrate.ts:34`, `src/core/types.ts:25-33,45`.
