# 26 - Diario: modo simplificado/completo

> [!abstract] TL;DR
> La app muestra **solo carbohidratos** en todas las superficies. Esta spec anade un
> **modo simplificado/completo**, global y persistente en `Ajustes`: **simplificado**
> (por defecto) es exactamente lo de hoy —los carbos como unico numero—; **completo**
> anade un **desglose de composicion**: **proteinas, grasas, kcal (energia), fibra y
> azucares**, por item, por comida y del dia (y en el borrador). El **total de carbos no
> cambia** entre modos. **Veredicto: la segregacion tiene sentido, pero acotada** — es
> _revelacion progresiva_ en torno a una metrica dominante (los carbos), **nunca** un
> calculo distinto: no toca el camino del calculo (D12) ni el de la dosis (D10). Se
> lleva a debate el contra-argumento (los macros, por diseno, no son accionables aqui).
> **Coste explicito:** exige **enriquecer el catalogo** con los macros de CIQUAL
> (`25000/40000/328/34100/32000`) —hoy el generador solo lee `31000`— mas el codigo de
> barras (Open Food Facts); los macros se **persisten como campos opcionales** en
> `FoodItem` (**SCHEMA_VERSION 3 -> 4**) y `CATALOG_VERSION 1 -> 2`. En completo, la
> cabecera anade **kcal** al total del dia (**amplia D40**). Sin backend, sin analitica,
> sin dependencias nuevas (D11).

## Contexto

SPEC 22-24 dejaron el Diario pulido, pero **solo con carbohidratos** (por item, por
comida, total del dia, reparto por momento). Es coherente con DM1 y con D10, pero quien
quiere mirar la comida mas alla de los carbos no tiene donde ver la composicion.

La investigacion de producto (2026-10-15; ver Referencias) muestra un patron asentado:
**modo simple por defecto** + **revelacion progresiva** de macros secundarios, **global
y persistente** (Cronometer _Display Settings_, MFP _Macros By Meal_, Lose It,
MacroFactor _Data Visibility_, MyNetDiary). En DM1 el dato primario **siguen siendo los
carbos**; la proteina/grasa entran como **informacion de composicion** (ISPAD 2022 grado
A; ADA 2025 rec. 14.5), y **solo** se vuelven dosis si se convierten en FPU/eCarbs
(regulado: dispositivo medico).

Este hueco **no** cambia el nucleo: no anade red, no toca la deteccion (D12) ni la
aritmetica de insulina (D10).

## Metodo

1. **Investigacion en internet (2026-10-15)** en dos angulos: (a) **modos**
   simplificado/completo y revelacion progresiva (NN/g, AndroidAPS, Cronometer, MFP,
   Lose It, MacroFactor, Loop, iAPS); (b) **macros en DM1** y linea regulatoria (ISPAD
   2022, ADA 2025, FPU/Pankowska, Herrmann 2021, FDA General Wellness, Tidepool Loop).
   Mas **auditoria offline del repo** (superficies y catalogo).
2. **Long-list** de candidatas (7) con el patron comun documentado.
3. **Filtro** por cuatro criterios (1-3): **Impacto**, **Frecuencia**, **Esfuerzo**
   (3 = menos esfuerzo -> mas puntua) y **Encaje** (D10, D12, D33, D36, D57, identidad
   calmada).
4. **Seleccion** de la mejor, descartando el resto.

## Candidatas y filtro

| #   | Candidata                                                      | Impacto | Frec. | Esfz. | Encaje | Total | ¿Elegida? | Motivo del descarte                                                                    |
| --- | -------------------------------------------------------------- | ------- | ----- | ----- | ------ | ----- | --------- | -------------------------------------------------------------------------------------- |
| C1  | **Modo simplificado/completo** (solo carbos / + macros y kcal) | 3       | 3     | 3     | 3      | 12    | **F1**    | —                                                                                      |
| C2  | Presets por objetivo (nutrient dashboard)                      | 2       | 2     | 2     | 3      | 9     | no        | Anade vocabulario y estados; el toggle binario basta; los presets implican objetivos   |
| C3  | Dashboard configurable de nutrientes                           | 2       | 2     | 1     | 3      | 8     | no        | Esfuerzo alto (configuracion fina); la revelacion binaria cubre el 90%                 |
| C4  | Macros siempre visibles (sin toggle)                           | 2       | 2     | 3     | 2      | 9     | no        | Rompe la jerarquia de carbos y la identidad calmada; el toggle lo resuelve como opt-in |
| C5  | Objetivos de macros (proteina/grasa)                           | 2       | 2     | 2     | 1      | 7     | no        | Objetivo dietetico = **recomendacion**; riesgo regulatorio (D10)                       |
| C6  | FPU / eCarbs (carbos extendidos)                               | 2       | 2     | 1     | 1      | 6     | no        | Existe **para calcular insulina**: cruza la linea de la dosis (D10)                    |
| C7  | Reparto por macros del dia como "grafico de anillo"            | 1       | 1     | 2     | 2      | 6     | no        | Presentacion con carga visual alta; el desglose en texto es suficiente                 |

**Elegida: C1.**

## La elegida: modo simplificado/completo

**Que.** Un **conmutador global y persistente** en `Ajustes`:

- **Simplificado (por defecto):** exactamente el estado actual — los carbohidratos son
  el **unico** numero (item, comida, total del dia, objetivo y reparto por momento).
- **Completo:** anade, como **composicion estimada**, **proteinas, grasas, kcal, fibra
  y azucares** por item, por comida y del dia. No cambia ningun gramo ni ningun
  carbohidrato; solo **revela** numeros secundarios. En **todo** el recorrido: borrador,
  comida y dia.

**Veredicto razonado sobre la segregacion.** **Si tiene sentido, pero acotada.** Para
una app de DM1 el dato primario **son los carbohidratos**; mostrar composicion es
_revelacion progresiva_ de una metrica secundaria, no un calculo distinto. La evidencia
DM1 (ISPAD 2022 grado A; ADA 2025 rec. 14.5) dice que grasa y proteina afectan la
glucemia, **pero** convertir eso en insulina (FPU, dual-wave) es una **decision de
dosis**: dispositivo medico en EEUU/UE (FDA General Wellness excluye explicitamente los
"outputs used to make treatment decisions").

| Modo             | QUE VA                                                                                    | QUE NO VA                                                                 |
| ---------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **Simplificado** | Carbos por item/comida/dia, objetivo, reparto por momento                                 | Macros, kcal, FPU, objetivos de macros                                    |
| **Completo**     | Lo anterior + **proteinas, grasas, kcal, fibra, azucares** (composicion, nota "estimado") | FPU/eCarbs, conversion macros->insulina, objetivos/recomendaciones, dosis |

> **Contra-argumento (debate abierto).** Como D10/D12 hacen los macros **no
> accionables** aqui, mostrar un numero que no se puede usar podria ser **decoracion**:
> ni ayuda a decidir ni a registrar con mas precision, y abre un pipeline de datos
> entero. Se acepta el coste a cambio de **utilidad informativa**, pero queda como
> decision viva: si no se demuestra uso, el modo completo se puede aplazar o recortar.

**Como se calcula cada dato.**

- **Proteina / grasa:** valor de la fuente (Ciqual `25000`/`40000`), 100 % de cobertura.
- **kcal:** valor de la fuente (Ciqual `328`) si existe; si no, **derivada**
  `4p + 4c + 9f` y **marcada** como derivada.
- **Fibra / azucares:** valor de la fuente (Ciqual `34100`/`32000`); lo que la fuente
  **no** trae, se **oculta** (no se deriva).
- Las **14 recetas propias** derivan de sus ingredientes, como hoy derivan sus carbos.

**Guardarrailes.** Es un ajuste de UI en `localStorage` (como favoritos D59 u objetivo
D60). Nunca toca el camino del calculo (D12) ni el de la dosis (D10). Los textos dicen
"estimacion de composicion", no "recomendacion". El **total de carbos es identico** en
ambos modos.

## Coste de datos (prerequisito)

CIQUAL 2020 ya trae los macros (`tools/catalog/.cache/xml/const_2020_07_07.xml`) pero
`tools/catalog/build_catalog.py:52` **solo lee `31000`** (`CARBS_CONST_CODE`). Auditoria
offline del repo (**186 alimentos = 172 Ciqual + 14 recetas propias; 0 USDA**; la cifra
"154" del README esta desactualizada):

| Nutriente      | const | Ciqual directo (/172) | Propias derivables (/14) | Tratamiento                                 |
| -------------- | ----- | --------------------- | ------------------------ | ------------------------------------------- |
| Proteina       | 25000 | 172                   | 14                       | completa                                    |
| Grasa          | 40000 | 172                   | 14                       | completa                                    |
| kcal (energia) | 328   | 126                   | 14                       | **falta en 46** -> derivar `4/4/9` y marcar |
| Fibra          | 34100 | 168                   | 14                       | falta en 4 -> **ocultar**                   |
| Azucares       | 32000 | 168                   | 14                       | falta en 4 -> **ocultar**                   |

Cobertura de las recetas `own` **se confirma con un test** en
`test_build_catalog.py`. Ficheros: `tools/catalog/build_catalog.py` (mapa
`const_code` -> campo, `own`), `tools/catalog/test_build_catalog.py`,
`src/catalog/types.ts` (`Food += proteinPer100g/fatPer100g/kcalPer100g/fiberPer100g/sugarsPer100g`,
`CATALOG_VERSION 1 -> 2`), `src/catalog/schema.ts`, `catalog.ts` (regenerado con
`make catalog`). **Codigo de barras (Open Food Facts):** hoy solo se pide
`carbohydrates_100g`; hay que sumar `proteins_100g`, `fat_100g`, `energy-kcal_100g`
(fibra/azucares opcionales; fallback `4/4/9` para kcal). **Foto y manual** salen gratis:
quien los escribe ya guarda `classId` y se resuelve contra el catalogo.

## Decisiones nuevas (propuesta D67-D69)

| #   | Decision                                                                | Detalle                                                                                                                                                                                                                                                                              | Estado    |
| --- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| D67 | **Modo simplificado/completo, global y persistente**                    | Ajuste en `Ajustes` (`localStorage`), por defecto **simplificado**. Simplificado = solo carbos; completo = **proteinas, grasas, kcal, fibra y azucares como composicion**. Revelacion progresiva; no toca el calculo de carbos ni la dosis (D10/D12)                                 | propuesta |
| D68 | **Macros y energia en el catalogo, persistidos como campos opcionales** | El generador lee CIQUAL `25000/40000/328/34100/32000` (y `own` derivado); `CATALOG_VERSION 1 -> 2`; kcal sin `328` se deriva `4/4/9` y se marca; el codigo de barras anade los campos de OFF. En `FoodItem`, macros **opcionales** (patron D49) -> `SCHEMA_VERSION 3 -> 4` tolerante | propuesta |
| D69 | **En modo completo, la cabecera anade kcal**                            | El total del dia en la cabecera pegajosa anade **kcal** junto al total de carbos. **Amplia D40** (el chrome siempre visible gana la cifra de energia), como D60 anadio el progreso                                                                                                   | propuesta |

## Alcance

- **Datos:** `tools/catalog/build_catalog.py`, `tools/catalog/test_build_catalog.py`,
  `src/catalog/types.ts` (`CATALOG_VERSION 1 -> 2`), `src/catalog/schema.ts`,
  `src/catalog/catalog.ts` (regenerado).
- **Nucleo:** `src/core/types.ts` (`FoodItem` macros opcionales; `SCHEMA_VERSION 3 ->
4`), `src/core/schema.ts` (`foodItemSchema`), `src/core/migrate.ts` (v3 -> v4
  tolerante, aceptando `version === 3`), `src/core/totals.ts` (`itemMacros`/`dayMacros`
  analogos a `itemCarbs`; kcal derivada marcada), `src/core/export.ts` (tolerancia a
  campos nuevos).
- **UI:** `src/main.ts` (`renderToday` 1323 y `renderDiary` 1655 y `renderDraft` 805
  para el desglose; `Ajustes` 557 para el toggle; totbar `#day-total` para la kcal;
  construcciones de item en 624/643/1101/1124 con macros); `src/style.css` (fila de
  desglose, control segmentado del modo, tokens, reduced-motion).
- **Barcode:** `src/barcode/lookup/client.ts`, `lookup/schema.ts`, `barcode/types.ts`,
  `pack.ts` y `pushBarcodeItem`.
- **i18n:** `src/i18n/index.ts` (claves ES/EN, guarda de paridad).
- **E2E:** `e2e/scenarios.mjs`, `e2e/scenarios-records.mjs`, `e2e/helpers.mjs`.
- Sin dependencias nuevas; sin red en runtime; sin backend/analitica (D11).

### Detalle

- **F1a.** Control segmentado en `Ajustes` (`label.check`/segmented), persistido en
  `localStorage` (`carbos.mode`); por defecto **simplificado**.
- **F1b.** En **completo**, `renderToday`/`renderDiary`/`renderDraft` anaden proteina,
  grasa, kcal, fibra y azucares (por item/comida/dia) con la nota `macro.estimateNote`;
  los valores derivados 4/4/9 se marcan (`macro.derived`).
- **F1c.** En **simplificado**, no se pinta ninguna fila de macros/kcal.
- **F1d.** El **total de carbos** y el objetivo **no cambian** entre modos.
- **F1e.** La cabecera (`#day-total`) anade kcal solo en **completo**.
- **F1f.** Catalogo: `build_catalog.py` lee los cinco `const_code` (y `own`); kcal sin
  `328` -> `4p+4c+9f` marcada; `test_build_catalog.py` comprueba cobertura (incluidas
  las 14 `own`) y `CATALOG_VERSION`. Barcode OFF anade los campos con fallback.
- **F1g.** Macros en `FoodItem` como **campos opcionales**: los items con `classId` se
  resuelven contra el catalogo; los de `barcode` los persisten. `SCHEMA_VERSION 3 -> 4`
  con migracion tolerante (`FoodItem` sin macros queda `undefined` y se resuelve por
  `classId`).

### i18n

| Clave                       | ES                                                          | EN                                                          |
| --------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------- |
| `settings.modeLabel`        | Modo de la pantalla                                         | Screen mode                                                 |
| `settings.modeSimple`       | Sencillo                                                    | Simple                                                      |
| `settings.modeComplete`     | Completo                                                    | Complete                                                    |
| `settings.modeSimpleHint`   | Solo carbohidratos                                          | Carbohydrates only                                          |
| `settings.modeCompleteHint` | Carbohidratos + macros y kcal                               | Carbs + macros and kcal                                     |
| `macro.breakdown`           | Desglose                                                    | Breakdown                                                   |
| `macro.protein`             | Proteinas                                                   | Protein                                                     |
| `macro.fat`                 | Grasas                                                      | Fat                                                         |
| `macro.kcal`                | kcal                                                        | kcal (ver nota)                                             |
| `macro.fiber`               | Fibra                                                       | Fiber                                                       |
| `macro.sugars`              | Azucares                                                    | Sugars                                                      |
| `macro.estimateNote`        | Composicion estimada del catalogo. No es consejo dietetico. | Estimated composition from the catalog. Not dietary advice. |
| `macro.derived`             | calculado                                                   | computed                                                    |

> **Nota i18n.** `macro.kcal` coincide en ES/EN ("kcal"): debe anadirse a
> `IGUALES_PERMITIDAS` en `src/i18n/index.test.ts:37` (como `unit.grams`) o el test
> `sinTraducir` (`:70`) lo marcara como no traducido.

## Criterios de aceptacion

Los criterios marcados _(m)_ se comprueban con una formula concreta (Tests).

1. Por defecto (simplificado) **no** existe ninguna fila de macros ni kcal; la vista
   coincide con la de hoy. _(m)_
2. En completo aparecen proteina, grasa, kcal, fibra y azucares por comida y del dia
   (y en el borrador); el **total de carbos no cambia** respecto a simplificado. _(m)_
3. El modo **persiste** entre recargas (`localStorage`) y es global. _(m)_
4. En completo, un alimento con kcal(328) se muestra con el valor de fuente; uno sin
   328 se muestra con `4p+4c+9f` **marcado** como derivado. _(m)_
5. Un alimento sin fibra/azucares en la fuente **oculta** ese dato (no lo deriva). _(m)_
6. Todo alimento del catalogo (186) expone proteina y grasa tras la regeneracion
   (incluidas las 14 `own` derivadas). _(m)_
7. En completo, la cabecera muestra **kcal** junto al total de carbos; en simplificado,
   solo carbos. _(m)_
8. Un `Vault` **v3** migra a **v4** sin perdida (se acepta `version === 3`); los items
   sin macros se resuelven por `classId`. _(m)_
9. **Sin cruce regulatorio** (estructural): ningun modulo de `core/insulin*` ni del
   camino de la dosis referencia macros ni kcal.
10. **i18n:** toda clave nueva existe en **es** y **en**; guarda de paridad intacta.
11. **Sin regresiones:** SPEC 22/23/24 (y SPEC 25, agrupar) siguen verdes.
12. `make check` (+ `make e2e` con los escenarios nuevos) en verde.

## Tests

- **Unitarios** (vitest):
  - `src/core/totals.ts`: `itemMacros`/`dayMacros`; kcal derivada `4/4/9` marcada;
    fibra/azucares ausentes se omiten (no se derivan).
  - `src/core/migrate.ts`: v3 sin macros -> v4 valido y tolerante; se acepta `version
=== 3`.
  - `src/catalog/`: cobertura `25000/40000/328/34100/32000` (incluidas las 14 `own`),
    `CATALOG_VERSION 1 -> 2` y paridad con el esquema zod.
  - `src/i18n/index.test.ts`: guarda de paridad cubre las claves nuevas y `macro.kcal`
    esta en `IGUALES_PERMITIDAS`.
- **E2E** (Firefox, `make e2e`): cambiar a completo y comprobar que aparecen macros y
  kcal (cabecera incluida) y que el total de carbos no cambia; recargar y comprobar que
  el modo persiste.
- **Auditoria** (`make audit-uiux`): el control segmentado del modo queda cubierto por
  la regla de objetivo tactil (MIN_HIT=44).
- **Gate**: `make check`.

## Fuera de alcance

- **FPU / eCarbs / carbos extendidos / dual-wave**: existe para calcular insulina;
  cruza D10 (C6).
- **Conversion macros -> insulina** y cualquier "output" usado para decidir dosis (FDA
  General Wellness).
- **Objetivos de macros** (proteina/grasa) y cualquier recomendacion dietetica (C5).
- **Dashboard configurable / presets de nutrientes** (C2/C3) y **graficos de reparto**
  (C7): la revelacion binaria basta.
- **Cambios en la deteccion** (D12), en la aritmetica de insulina (D10) y en el
  export/import salvo la tolerancia a campos nuevos.
- **Backend, red, cuentas y sincronizacion** (D11) y **analitica**.

## Riesgos

- **Macros leidos como consejo o como dosis.** Mitigacion: nota "estimacion de
  composicion, no consejo"; sin FPU, sin objetivos, sin unidades.
- **Bump de esquema mal hecho.** `migrateVault` (`src/core/migrate.ts:34`) solo acepta
  `1|2|3`; subir a 4 **exige** tolerar `version === 3` con test, o los vault actuales
  fallan. Incluido en criterios y tests.
- **kcal derivada menos exacta** (4/4/9 ignora alcohol/polioles; CIQUAL usa Jones):
  subestima cerveza/vino; se **marca** como derivada.
- **Cobertura irregular de Open Food Facts.** Mitigacion: fallback `4/4/9` para kcal y
  **ocultar** el macro ausente en vez de inventarlo.
- **Ruido visual.** Mitigacion: revelacion progresiva y una fila discreta de desglose;
  en simplificado, cero filas nuevas.
- **Coste del catalogo.** Mitigacion: tabla de cobertura y ficheros afectados
  explicitados; test de cobertura (incluidas `own`).
- **Utilidad no demostrada (decoracion).** Mitigacion: decision viva; medir uso y, si no
  aporta, aplazar o recortar el modo completo.

## Referencias

- **Modos:** NN/g, _Progressive Disclosure_; AndroidAPS, _Simple mode_; Cronometer,
  _Display Settings_; MyFitnessPal, _Macros By Meal_; Lose It!, _Tracking Nutrient
  Goals_; MacroFactor, _Data Visibility_; LoopDocs, _Meal Entries_; iAPS Docs,
  _Interface_.
- **DM1 y macros:** ISPAD 2022 (Nutricion); ADA 2025 (Ninos y Adolescentes, 14.5);
  Smith TA 2021; Herrmann E 2021 (ECA de FPU); FDA, _General Wellness: Policy for Low
  Risk Devices_ (2026); FDA 510(k) K203689 (Tidepool Loop).
- `docs/specs/22-uiux-v3.md` (Diario, D54-D58), `docs/specs/23-calidad-de-vida.md`
  (D59-D61), `docs/specs/24-calidad-de-vida-2.md` (D62-D64), `docs/specs/25-diario-agrupar-comidas.md`,
  `docs/decisiones.md` (D10, D11, D12, D33, D40, D49, D57).
- `tools/catalog/build_catalog.py:52` (`CARBS_CONST_CODE = "31000"`);
  `tools/catalog/.cache/xml/const_2020_07_07.xml`; `src/catalog/types.ts:16`
  (`CATALOG_VERSION=1`); `src/core/types.ts:45` (`SCHEMA_VERSION=3`);
  `src/core/migrate.ts:34`; `src/i18n/index.test.ts:37,70`; `src/main.ts`
  (`renderToday` 1323, `renderDiary` 1655, `renderDraft` 805, `Ajustes` 557).
