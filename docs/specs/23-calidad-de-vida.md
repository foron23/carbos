# 23 - Calidad de vida y experiencia de usuario: quick-add, objetivo diario y repetir

> [!abstract] TL;DR
> Pase de **calidad de vida (QoL)** sobre la UX ya cerrada por SPEC 22. Parte de una
> **investigacion de apps reales** de conteo de carbohidratos/calorias, filtra las
> **3 mejores opciones** por impacto, frecuencia y encaje con los guardarrailes del
> proyecto, y las implementa: **(F1) recientes y favoritos de un toque**, **(F2) objetivo
> diario de carbohidratos con progreso** y **(F3) repetir una comida registrada**. Todo
> **sin backend, sin dependencias nuevas (D11) y sin bump de esquema**: los favoritos y el
> objetivo viven en `localStorage` (ajustes de usuario, como el idioma o el endpoint), los
> recientes se **derivan** del diario y "repetir" clona items ya existentes. No toca el
> camino de la estimacion a una dosis (linea regulatoria) ni reintroduce lo aparcado en
> D33 (no se aprende de las correcciones ni hay porcion habitual por alimento).

## Contexto

SPEC 22 cerro el problema reportado ("la interfaz es poco intuitiva") con navegacion
persistente y un Diario como linea de tiempo. Queda, sin embargo, la **friccion del uso
diario**, que no es de navegacion sino de **repeticion**:

- **Registrar la misma comida una y otra vez es lento.** En Carbos, "Añadir comida" es
  buscar (>= 2 letras), leer una lista y pulsar; hacerlo dos o tres veces al dia durante
  semanas es exactamente el "slow, repetitive and incomplete" que describen las apps del
  sector. La literatura de producto coincide: los **favoritos y recientes de un toque**
  son la palanca numero uno ("lightning-fast logging next time", Glooko; "re-log them in a
  tap", Calorie Calculator; "Favorite and recent food with search", Glycemic Index app).
- **El dia no tiene contexto.** `#day-total` da el total, pero sin una **referencia**
  (el objetivo que el propio usuario decide) no se sabe si se va bien o se ha pasado.
  "Rings fill as you eat" (GRAMS), "Set daily carb targets" (CarbCam) y las barras por
  objetivo de Calorie Calculator son el patron comun.
- **Repetir lo de ayer sigue costando lo mismo que lo nuevo.** "Copy to today to repeat a
  meal" (Calsa), "Eat it again? Re-log any meal in two taps" (GRAMS): duplicar una comida
  ya registrada es una de las acciones mas pedidas.

Estos tres huecos son **calidad de vida**, no funciones nuevas de dominio: no cambian el
modelo de datos, no anaden red y no tocan la deteccion ni la aritmetica de insulina.

## Metodo

1. **Investigacion en internet (2026-10-15)** sobre apps y guias de UX de conteo de
   carbohidratos/calorias y diabetes: Glooko (rediseno del food tracker, 2025), Carbs &
   Cals (case study de "Smart Suggestions" y UI breakdown), CarbCam, GRAMS, Calsa, Kexo,
   PlateLens, Calorie Calculator, Glycemic Index (ver Referencias).
2. **Long-list** de candidatas (14) con patron comun documentado.
3. **Filtro** por cuatro criterios con la misma escala (1-3): **Impacto** en QoL,
   **Frecuencia** de uso, **Esfuerzo** (3 = menos esfuerzo → mas puntua) y **Encaje** con
   los guardarrailes (D11, D33, D16/D42/D46, D15, linea regulatoria, identidad calmada).
4. **Seleccion de las 3 mejores** (las de mayor total y encaje alto), descartando el resto
   con su motivo.

## Candidatas y filtro

| #   | Candidata                                           | Impacto | Frec. | Esfz. | Encaje | Total | ¿Elegida? | Motivo del descarte                                                                 |
| --- | --------------------------------------------------- | ------- | ----- | ----- | ------ | ----- | --------- | ----------------------------------------------------------------------------------- |
| C1  | **Recientes y favoritos** (quick-add de un toque)   | 3       | 3     | 3     | 3      | 12    | **F1**    | —                                                                                   |
| C2  | **Objetivo diario de carbohidratos con progreso**   | 3       | 3     | 3     | 3      | 12    | **F2**    | —                                                                                   |
| C3  | **Repetir una comida registrada**                   | 3       | 2     | 3     | 3      | 11    | **F3**    | —                                                                                   |
| C4  | Deshacer el borrado (toast con Undo)                | 2       | 1     | 2     | 2      | 7     | no        | Choca con la confirmacion deliberada de borrado (registro de salud); mas superficie |
| C5  | Copiar el dia entero ("copiar ayer")                | 2       | 2     | 2     | 2      | 8     | no        | Se solapa con F3; "repetir" por comida es mas granular y mas barato                 |
| C6  | Editar items de una comida ya registrada (in-place) | 2       | 2     | 1     | 2      | 7     | no        | Esfuerzo alto (reabre edicion de dominio); ya existe Editar -> borrador             |
| C7  | Rachas / logros / insignias                         | 1       | 2     | 2     | 1      | 6     | no        | Gamificacion: choca con la identidad calmada (SPEC 16) y la rechaza Calsa           |
| C8  | Recordatorios / notificaciones diarias              | 1       | 2     | 1     | 1      | 5     | no        | Necesita permiso de notificaciones; difumina la promesa "cero analitica"            |
| C9  | Alternar tema oscuro a mano                         | 1       | 1     | 3     | 2      | 7     | no        | Ya hay pasada de dark por `prefers-color-scheme`; valor marginal                    |
| C10 | Notas/etiquetas por comida ("comi fuera")           | 2       | 1     | 2     | 2      | 7     | no        | Anade campo al esquema; no es QoL del ciclo diario, es contexto para el equipo      |
| C11 | Busqueda con ranking por frecuencia                 | 2       | 2     | 1     | 2      | 7     | no        | F1 ya cubre el atajo; el ranking fino es esfuerzo por poca ganancia visible         |
| C12 | Voz para anadir alimentos                           | 2       | 1     | 1     | 1      | 5     | no        | Requiere ASR (modelo/permiso); fuera del stack actual sin red                       |
| C13 | Filtro/paginado del historial (rango de fechas)     | 2       | 1     | 1     | 2      | 6     | no        | Esfuerzo alto (vistas), poco frecuente en el uso diario                             |
| C14 | Editor de recetas (combinar alimentos)              | 2       | 1     | 1     | 1      | 5     | no        | Funcion de dominio nueva (y de esquema); excede el pase QoL                         |

**Elegidas: C1, C2 y C3** (totales 12, 12 y 11, con **encaje 3** las tres). El resto se
descarta por solaparse, por exigir esquema/red/dependencias o por chocar con la identidad
del producto.

## Las 3 elegidas

### F1. Recientes y favoritos (un toque)

**Que.** Bajo la busqueda de "Añadir comida", una fila de **atajos** con los alimentos que
el usuario usa de verdad: primero sus **favoritos** (marcados a mano), despues sus
**recientes** (derivados del diario). Un toque anade el alimento al borrador con la
**porcion por defecto del catalogo**, igual que pulsar un resultado de busqueda.

**Por que.** Es la palanca de QoL mas citada por el sector y la de mayor frecuencia
(se usa en cada registro). No requiere teclear ni recordar nombres.

**Guardarrailes.**

- **No es D33.** No se aprende de las correcciones ni se guarda una "porcion habitual":
  los recientes son una **lista de ids de catalogo** que se anade a la porcion por defecto,
  y los favoritos son una marca explicita del usuario. Cero datos por alimento.
- **Derivado, no almacenado (patron D57).** Los recientes se calculan del `vault.meals`
  (los ultimos `classId` distintos, en orden cronologico inverso); no hay tabla nueva.
- Favoritos = lista de ids en `localStorage` (`carbos.favorites`), como el resto de ajustes.

### F2. Objetivo diario de carbohidratos con progreso

**Que.** Un ajuste **opt-in** donde el usuario escribe **su** objetivo diario de
carbohidratos (en gramos). Cuando existe, el total del dia (topbar) y el **resumen del
Diario** (D55) muestran el progreso: `consumido / objetivo` y **cuanto queda** (o cuanto se
ha pasado), con una barra fina y semantica `progressbar`. Sin objetivo, no cambia nada.

**Por que.** Da **contexto** al dato que el usuario ya tiene: convierte un numero suelto en
una referencia propia. Presente en la practica totalidad de las apps del sector.

**Guardarrailes.**

- Es **el numero del usuario**, no una recomendacion: texto siempre "tu objetivo", nunca
  "deberias". No produce dosis, ni entra en el camino de la estimacion (linea regulatoria).
- Opt-in y presentacional: `localStorage` (`carbos.dailyTarget`), sin esquema, sin red.

### F3. Repetir una comida registrada

**Que.** En el detalle de una comida del Diario, una accion **Repetir** que **copia sus
items al borrador** (con ids nuevos) para registrarlos otra vez —en el dia que se esta
viendo—. No crea ningun registro por si sola: la persona confirma con "Registrar".

**Por que.** "Lo mismo de ayer" es un caso diario; hoy cuesta lo mismo que registrar algo
nuevo. Repetir lo convierte en un toque.

**Guardarrailes.** Clona datos ya existentes; el borrador conserva los atajos (D34) y la
confirmacion previa al guardado. Sin esquema ni red.

## Decisiones nuevas (D59-D61)

| #   | Decision                                          | Detalle                                                                                                                                                                                                                                                          | Estado  |
| --- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| D59 | **Quick-add de recientes y favoritos**            | Atajos de un toque bajo la busqueda: **favoritos** (ids en `localStorage`) y **recientes** (ids derivados del diario, patron D57). Anaden a la **porcion por defecto del catalogo**; **no** aprenden correcciones ni guardan porcion por alimento (respeta D33). | cerrada |
| D60 | **Objetivo diario de carbohidratos, del usuario** | Objetivo opt-in en gramos, **puesto por la persona**, en `localStorage`; el topbar y el resumen del Diario muestran progreso y restante. Presentacional, sin dosis ni consejo (linea regulatoria).                                                               | cerrada |
| D61 | **Repetir comida**                                | Accion que **clona los items de una comida registrada al borrador** (ids nuevos, mismo dia en vista); nada se registra sin confirmar. Aditivo, sin esquema.                                                                                                      | cerrada |

Estas decisiones quedan **cerradas** con la implementacion de SPEC 23.

## Alcance

Todo en `src/main.ts`, `src/style.css`, `src/i18n/index.ts`, un modulo puro nuevo
`src/core/recents.ts` (+ test), `src/core/totals.ts` (helper de progreso), los
escenarios E2E (`e2e/scenarios*.mjs`) y las aserciones del auditor (`e2e/audit.mjs`) si
aplican. Sin dependencias nuevas y sin cambios de esquema.

### F1. Recientes y favoritos

- **F1a.** Bloque de atajos encima (o justo debajo) del campo de busqueda, en la tarjeta de
  "Añadir comida": dos grupos, _Favoritos_ y _Recientes_. Cada atajo es un `<button>` con
  el nombre del alimento.
- **F1b.** Un toque llama al mismo camino que un resultado de busqueda
  (`addFoodToDraft`); no limpia la busqueda necesariamente, pero mantiene el foco.
- **F1c.** En cada resultado de busqueda, un control **estrella** para marcar/desmarcar
  favorito (nombre accesible "Marcar como favorito / Quitar de favoritos"), con estado
  `aria-pressed`.
- **F1d.** **Recientes** = funcion pura `recentClassIds(meals, limit)` (modulo nuevo
  `src/core/recents.ts`): recorre las comidas de mas reciente a mas antigua y devuelve los
  `classId` distintos, en orden, limitados a `limit` (por defecto 8). Sin `classId` (item
  manual/escaneado sin catalogo) no entra. Sin duplicados; los que ya son favoritos pueden
  seguir apareciendo.
- **F1e.** **Favoritos** = `localStorage` `carbos.favorites` (array de ids de catalogo).
  Lectura tolerante a fallos (localStorage no disponible → lista vacia).
- **F1f.** El bloque se **oculta** si no hay ni favoritos ni recientes (identidad calmada:
  nada de contenedores vacios). No hay estado vacio con CTA aqui (D58 es del Diario).
- **F1g.** Los atajos respetan el **objetivo tactil >= 44 px**.

### F2. Objetivo diario de carbohidratos

- **F2a.** En _Ajustes_, un campo numerico `daily-target` (`settings.dailyTarget`) con la
  etiqueta del objetivo. Vacio = sin objetivo. Valor guardado en `localStorage`
  (`carbos.dailyTarget`); no negativo; `0` se trata como "sin objetivo".
- **F2b.** Con objetivo definido, el **topbar** muestra, junto al total, `consumido /
objetivo g` y el **restante** (o "por encima"); debajo, una **barra fina**
  (`role="progressbar"`, `aria-valuemin=0`, `aria-valuemax=objetivo`, `aria-valuenow=
consumido`, `aria-valuetext` con el restante). Sin objetivo, el topbar queda como hoy.
- **F2c.** El **resumen del Diario** anade una celda _Objetivo_ (`summary.target`) con
  `objetivo g` y el progreso, coherente con `F2b` (mismos numeros).
- **F2d.** Funcion pura `targetProgress(consumed, target)` en `src/core/totals.ts`:
  devuelve `{ target, consumed, remaining, ratio, over }` con `remaining = max(0, target -
consumed)` y `ratio` acotado a `[0, 1]` para la barra; `over` indica si se paso.
- **F2e.** El progreso **no** es un juicio: el texto es informativo ("Objetivo", "Restante"),
  nunca valorativo.

### F3. Repetir comida

- **F3a.** En `mealEntry`, dentro de las acciones reveladas (D56), un boton **Repetir**
  (`button.repeat`) junto a Editar/Quitar.
- **F3b.** `repeatMeal(meal)`: clona los items con **ids nuevos** al `draft`, fija
  `draft.origin` al de la comida, limpia detecciones y llama a `renderDraft()`. No registra
  nada; el usuario confirma con "Registrar" (que guarda en el dia en vista y la hora actual).
- **F3c.** El borrador resultante conserva los atajos por item (D34) y **Cancelar**.

### i18n (F1-F3)

Claves nuevas en **es** y **en** (el tipo `StringKey` y la guarda de paridad lo imponen):

| Clave                        | ES                                      | EN                         |
| ---------------------------- | --------------------------------------- | -------------------------- |
| `quickadd.favorites`         | Favoritos                               | Favorites                  |
| `quickadd.recents`           | Recientes                               | Recents                    |
| `quickadd.favorite` (aria)   | Marcar como favorito                    | Mark as favorite           |
| `quickadd.unfavorite` (aria) | Quitar de favoritos                     | Remove from favorites      |
| `settings.dailyTarget`       | Tu objetivo diario de carbohidratos (g) | Your daily carb target (g) |
| `summary.target`             | Tu objetivo                             | Your target                |
| `target.remaining`           | Restante                                | Remaining                  |
| `target.over`                | Por encima                              | Over                       |
| `target.progress` (aria)     | Progreso del objetivo                   | Target progress            |
| `button.repeat`              | Repetir                                 | Repeat                     |

## Criterios de aceptacion

Los criterios marcados _(m)_ se comprueban con una formula concreta (Tests).

1. **(F1)** Con historial previo, los **Recientes** muestran, en orden, los ultimos
   `classId` distintos del diario, sin duplicados, limitados a 8; un toque anade el
   alimento al borrador con la porcion por defecto. _(m)_
2. **(F1)** Marcar un resultado como favorito lo persiste en `localStorage` y aparece como
   atajo de _Favoritos_ tras `render()`; desmarcar lo quita. _(m)_
3. **(F1)** Sin favoritos ni recientes, el bloque de atajos **no** se renderiza (sin
   contenedor vacio). _(m)_
4. **(F1)** Los atajos y la estrella miden **>= 44 px** de alto.
5. **(F2)** Sin objetivo, topbar y resumen no muestran barra ni "objetivo" (estado actual).
6. **(F2)** Con objetivo `T`, el topbar muestra `consumido / T g`, el restante y una barra
   con `aria-valuenow = consumido`, `aria-valuemax = T`; el resumen del Diario cuadra con
   los mismos numeros. _(m)_
7. **(F2)** `targetProgress` acota `ratio` a `[0, 1]` y calcula `remaining = max(0, T - c)`
   y `over`; tests cubren bajo, igual y por encima del objetivo. _(m)_
8. **(F2)** El objetivo `0` (o no numerico) equivale a "sin objetivo".
9. **(F3)** Con una comida registrada, **Repetir** rellena el borrador con sus items (ids
   nuevos, mismos gramos y carbohidratos) sin registrar nada; guardar crea una **comida
   nueva** en el dia en vista. _(m)_
10. **(F3)** El borrador de una repeticion conserva los atajos por item (mitad/doble) y
    Cancelar.
11. **Sin regresiones**: SPEC 22 sigue verde (nav, linea de tiempo, resumen, estados
    vacios).
12. **i18n**: toda clave nueva existe en **es** y **en**; ningun `aria-label` queda sin
    cubrir; se mantiene la guarda de paridad.
13. `make check` (+ `make e2e` con los escenarios nuevos) en verde.

## Tests

- **Unitarios** (vitest):
  - `src/core/recents.ts`: `recentClassIds` ordena por fecha+hora desc, deduplica, ignora
    items sin `classId` y respeta el limite; cubre el caso vacio.
  - `src/core/totals.ts`: `targetProgress` bajo / igual / por encima y la cota de `ratio`;
    `target = 0` tratado como sin objetivo por el consumidor (helper devuelve `target: 0`).
  - `src/i18n/index.test.ts`: la guarda de paridad ES/EN cubre las claves nuevas.
- **E2E** (Firefox, `make e2e`):
  - tras registrar una comida, aparece en **Recientes** y un toque la reanade al borrador;
  - marcar/desmarcar favorito lo persiste y el atajo aparece/desaparece;
  - definir objetivo y comprobar `aria-valuenow`/`aria-valuemax` y el restante en el topbar
    y el resumen;
  - **Repetir** una comida rellena el borrador y registrar crea la segunda comida.
- **Auditoria** (`make audit-uiux`): se mantiene la matriz y las aserciones actuales; los
  controles nuevos (atajos, estrella, Repetir) quedan cubiertos por la regla de
  objetivo tactil (MIN_HIT=44) ya existente.
- **Gate**: `make check`.

## Fuera de alcance

- **Aprender de las correcciones** y **porcion habitual por alimento** (D33): siguen
  aparcadas; F1 solo reutiliza la porcion por defecto del catalogo.
- **Rachas, insignias, confeti** o cualquier gamificacion (identidad calmada, SPEC 16).
- **Recordatorios/notificaciones** y **cualquier red**: no hay backend ni analitica.
- **Sincronizacion** entre dispositivos (D4): el objetivo y los favoritos son locales.
- **Dosis**: el objetivo es de carbohidratos del usuario; nada alimenta la aritmetica de
  insulina ni el camino de la estimacion a una dosis.
- **Cambios de esquema**: `Vault` no cambia; favoritos y objetivo son ajustes de UI.

## Riesgos

- **Quick-add que "enseñe" una porcion equivocada.** Mitigacion: se anade con la porcion
  por defecto, la misma que la busqueda; el borrador permite ajustar (D34).
- **Recientes pobres al principio.** Con poco historial el bloque sale vacio; se oculta
  (criterio 3) y aparece solo cuando hay datos, sin ruido.
- **Objetivo que se lea como consejo medico.** Mitigacion: opt-in, texto "tu objetivo",
  informativo ("Restante"), nunca valorativo ni ligado a dosis.
- **Ruido visual (identidad calmada).** Los atajos son una fila discreta y el progreso solo
  existe si hay objetivo; sin objetivo la UI es la de SPEC 22.
- **Repetir duplicando por error.** Registra solo tras pulsar "Registrar"; Cancelar
  descarta el borrador (comportamiento ya existente).

## Referencias

- Internet (2026-10-15): Glooko, _Redesigned Food Tracker_ y _Food Logging_ (favoritos de un
  toque, re-log); Carbs & Cals, _case study_ (friccion de "recents" estatico; y rechazo de
  streaks) y _UI breakdown_ (portadas visuales, manejo de errores); CarbCam (_app tour_:
  objetivos diarios de carbohidratos, long-press para editar/borrar); GRAMS (anillos de
  progreso, "re-log any meal in two taps", "one tap to undo"); Calsa ("copy to today",
  "you can undo it", "no streaks"); Kexo (borrado con Undo); PlateLens (objetivos
  personalizados); Calorie Calculator (favoritos y re-log en un toque); Glycemic Index app
  (favoritos y recientes).
- `docs/specs/22-uiux-v3.md` (nav y Diario), `docs/specs/16-uiux-v2.md` (identidad y
  tokens), `docs/specs/13-atajos-y-dia.md` (atajos D34, hora D36), `docs/decisiones.md`
  (D11, D15, D16, D33, D42, D46, D55, D57 y las nuevas D59-D61).
- `src/main.ts` (`renderSearch`, `addFoodToDraft`, `renderToday`, `renderDiary`,
  `mealEntry`, `wire`), `src/core/totals.ts`, `src/core/moments.ts` (patron de funcion pura),
  `src/i18n/index.ts`.
