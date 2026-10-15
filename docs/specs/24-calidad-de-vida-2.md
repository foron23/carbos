# 24 - Calidad de vida y experiencia de usuario (ronda 2): borrador persistente, busqueda por uso y explorar por categorias

> [!abstract] TL;DR
> **Segunda ronda QoL** sobre la UX ya cerrada por SPEC 22 y el primer pase de
> calidad de vida (SPEC 23). Parte de una **investigacion de apps reales** de
> conteo de carbohidratos/calorias y diabetes (2026-10-15, cuatro angulos), filtra
> las **3 mejores opciones** por impacto, frecuencia, esfuerzo y encaje, y las
> implementa: **(F1) borrador persistente** (el borrador sobrevive a la recarga),
> **(F2) busqueda que prioriza tu uso** (tus alimentos frecuentes primero) y
> **(F3) explorar el catalogo por categorias** (reconocer sin tener que recordar el
> nombre). Todo **sin backend, sin dependencias nuevas (D11) y sin bump de
> esquema**: el borrador vive en `localStorage` (ajuste de sesion), el uso se
> **deriva** del diario (patron D57) y las categorias son un modulo curado nuevo.
> No toca el camino de la estimacion a una dosis (linea regulatoria) ni reintroduce
> lo aparcado en D33.

## Contexto

SPEC 23 cerro el primer pase de calidad de vida (quick-add de recientes/favoritos,
objetivo diario con progreso, repetir una comida). El uso diario, sin embargo, deja
tres fricciones que no cubre:

- **Perder el trabajo a medio hacer.** El borrador vive **solo en memoria**
  (`main.ts`: `let draft`); recargar, cerrar la pestana o que el movil descargue la
  PWA pierde la comida a medio armar. Las resenas de usuario lo denuncian
  ("the meal is gone and I have to reconstruct it from scratch", Cal AI) y las
  guias de formularios lo tratan como una de las mayores causas de abandono
  ("Draft Persistence and Autosave"; WCAG 2.2 SC 3.3.7 Redundant Entry).
- **Encontrar tus alimentos.** La busqueda es **texto puro**: entre resultados con
  la misma relevancia no prioriza lo que la persona repite, aunque la literatura
  de producto (Cronometer "Most Frequent/Most Recent", Yazio por favoritos y hora)
  muestra que los usuarios registran siempre el mismo punado de alimentos.
- **Descubrir sin recordar.** La busqueda **exige >= 2 letras** (`main.ts`) y no hay
  forma de **explorar** el catalogo; obliga a recordar el nombre exacto para
  encontrar un alimento nuevo ("recognition over recall", NN/g; filtros por
  categoria en Cronometer y Carbs & Cals).

Estos tres huecos son **calidad de vida**, no funciones nuevas de dominio: no
cambian el modelo de datos, no anaden red ni tocan la deteccion ni la aritmetica de
insulina.

## Metodo

1. **Investigacion en internet (2026-10-15)** en cuatro angulos: (a) UX de
   registro de comida/calorias 2025-2026; (b) UX de conteo de carbohidratos y
   diabetes; (c) micro-UX de PWA movil; (d) accesibilidad y descubribilidad (ver
   Referencias).
2. **Long-list** de candidatas (14) con patron comun documentado.
3. **Filtro** por cuatro criterios con la misma escala (1-3): **Impacto** en QoL,
   **Frecuencia** de uso, **Esfuerzo** (3 = menos esfuerzo -> mas puntua) y
   **Encaje** con los guardarrailes (D11, D33, la identidad calmada de SPEC 16 y la
   linea regulatoria).
4. **Seleccion de las 3 mejores** (mayor total y encaje alto), descartando el resto
   con su motivo.

## Candidatas y filtro

| #   | Candidata                                         | Impacto | Frec. | Esfz. | Encaje | Total | ¿Elegida? | Motivo del descarte                                                                             |
| --- | ------------------------------------------------- | ------- | ----- | ----- | ------ | ----- | --------- | ----------------------------------------------------------------------------------------------- |
| C1  | **Borrador persistente** (sobrevive a la recarga) | 3       | 3     | 3     | 3      | 12    | **F1**    | —                                                                                               |
| C2  | **Busqueda que prioriza tu uso** (frecuencia)     | 2       | 3     | 3     | 3      | 11    | **F2**    | —                                                                                               |
| C3  | **Explorar el catalogo por categorias**           | 3       | 2     | 2     | 3      | 10    | **F3**    | —                                                                                               |
| C4  | Deshacer no intrusivo (undo toast)                | 3       | 2     | 2     | 2      | 9     | no        | Choca con la confirmacion deliberada de borrado (registro de salud, SPEC 23 C4); mas superficie |
| C5  | Toggles de texto grande y alto contraste          | 2       | 2     | 3     | 2      | 9     | no        | Duplica `prefers-color-scheme`/`prefers-reduced-motion` ya soportados; valor marginal           |
| C6  | Dynamic type del sistema (texto escalable)        | 1       | 2     | 3     | 3      | 9     | no        | Los tokens ya usan `rem`: se respeta el tamano del navegador; sin accion que tomar              |
| C7  | Atajos de teclado de escritorio                   | 2       | 1     | 3     | 3      | 9     | no        | Movil primero; baja frecuencia; WCAG 2.1.4 se cubre no interceptando teclas sueltas             |
| C8  | Gestion de foco al cambiar de seccion/fecha       | 1       | 2     | 3     | 3      | 9     | no        | A11y fina; ya hay anclaje bajo la cabecera; impacto bajo                                        |
| C9  | Porcion visual S/M/L con referencia               | 3       | 3     | 1     | 2      | 9     | no        | Requiere assets/fotos de porcion; medio-alto esfuerzo (y el proyecto no empaqueta fotos)        |
| C10 | Etiquetas/notas contextuales por comida           | 2       | 2     | 2     | 3      | 9     | no        | Es contexto para el equipo, no QoL del ciclo diario; anade superficie                           |
| C11 | Recordatorios locales opt-in                      | 2       | 3     | 1     | 1      | 7     | no        | Necesita permiso de notificaciones; difumina la promesa "cero analitica"                        |
| C12 | Pre-registro / copiar un dia a otra fecha         | 3       | 2     | 1     | 3      | 9     | no        | Se solapa con Repetir (D61); el cambio de fecha ya existe; esfuerzo de "dia entero"             |
| C13 | Instalacion in-app (beforeinstallprompt)          | 2       | 1     | 2     | 3      | 8     | no        | El navegador ya ofrece instalar; la app es instalable; valor marginal                           |
| C14 | Feedback haptico                                  | 1       | 1     | 3     | 2      | 7     | no        | Soporte escaso (Safari nunca; Firefox retiro Vibration); "buzzy" sin beneficio real             |

**Elegidas: C1, C2 y C3** (totales 12, 11 y 10, con **encaje 3** las tres). El resto
se descarta por solaparse, por exigir assets/permiso o por chocar con la identidad
del producto.

## Las 3 elegidas

### F1. Borrador persistente

**Que.** El borrador en curso (los items y su origen) se guarda en `localStorage`
(`carbos.draft`) y se restaura al volver a abrir la app. Al **registrar**,
**cancelar** o quedar **vacio**, se descarta. Si algo no cuadra al leerlo, se ignora
y se empieza con un borrador vacio.

**Por que.** Perder una comida a medio armar (varios items, ajustes de gramos) es
friccion evitable que desmotiva; la persistencia de borradores es un patron estandar
de formularios moviles.

**Guardarrailes.** Es un ajuste de sesion en `localStorage` (como favoritos u
objetivo), **sin esquema**. No persiste la foto ni las detecciones (solo los items
ya en el borrador); no aprende nada del usuario mas alla de lo que ya hay en la
pantalla.

### F2. Busqueda que prioriza tu uso

**Que.** Entre resultados de busqueda **con la misma relevancia** (mismo texto),
primero los alimentos que la persona **usa mas** (frecuencia derivada del diario),
despues por nombre. Con poca historia, el orden es el de hoy.

**Por que.** La busqueda es el camino mas usado; ordenar por uso reduce tecleo y
scroll para quien repite los mismos alimentos. Lo hacen Cronometer ("Most
Frequent") y Yazio.

**Guardarrailes.** La frecuencia se **deriva** del `vault.meals` (patron D57), no se
almacena ni se envia; la relevancia del texto **manda** (el uso solo desempata). No
es D33: no guarda porcion ni aprende de correcciones.

### F3. Explorar el catalogo por categorias

**Que.** En la tarjeta de "Añadir comida" (modo Buscar), una fila de **chips de
categoria** (Cereales, Verduras, Frutas, Lacteos, Proteinas, Platos, Dulces, ...).
Al elegir una, se listan sus alimentos como resultados (mismo camino que la
busqueda); un toque los anade al borrador con su porcion por defecto. Con la
busqueda **vacia**, se ofrece explorar por categoria en lugar de no mostrar nada.

**Por que.** Sustituye "recordar" por "reconocer": permite encontrar un alimento
nuevo sin saber su nombre, en un catalogo de 186 entradas.

**Guardarrailes.** Categorias **curadas** en un modulo nuevo (`src/catalog/
categories.ts`); el catalogo generado **no se toca**. Offline (dato en bundle),
calmado (una fila de chips), sin red.

## Decisiones nuevas (D62-D64)

| #   | Decision                                | Detalle                                                                                                                                                                            | Estado    |
| --- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| D62 | **Borrador persistente**                | El borrador en curso se guarda en `localStorage` (`carbos.draft`, versionado y tolerante) y se restaura al abrir; se descarta al registrar/cancelar/vaciar. Sin foto, sin esquema. | propuesta |
| D63 | **Busqueda priorizada por uso**         | Entre resultados de igual relevancia, primero los alimentos mas usados; la frecuencia se **deriva** del diario (patron D57), no se almacena. Relevancia manda.                     | propuesta |
| D64 | **Explorar el catalogo por categorias** | Chips de categoria curada que listan alimentos sin exigir texto; con busqueda vacia se ofrece explorar. Catalogo generado intacto.                                                 | propuesta |

Estas decisiones quedan **propuestas** hasta implementarse SPEC 24.

## Alcance

Todo en `src/core/draft.ts` (nuevo), `src/catalog/categories.ts` (nuevo),
`src/catalog/search.ts`, `src/core/recents.ts` (helper de uso), `src/main.ts`,
`src/style.css`, `src/i18n/index.ts`, los escenarios E2E (`e2e/scenarios.mjs`) y las
aserciones del auditor si aplican. Sin dependencias nuevas y sin cambios de esquema.

### F1. Borrador persistente

- **F1a.** Modulo puro `src/core/draft.ts`: `serializeDraft(draft)`, `parseDraft(raw)`
  (tolerante: `null` si no cuadra) y una persistencia de bajo nivel
  (`saveDraft`/`loadDraft`/`clearDraft`) sobre `localStorage` (`carbos.draft`), con
  clave de version.
- **F1b.** En `main.ts`, cada mutacion del borrador (anadir/quitar item, ajustar
  gramos, atajos) persiste con **debounce**; al arrancar, se **restaura** el borrador
  (items + origen) y se pinta.
- **F1c.** `resetEdit()` (registrar y cancelar) **limpia** el borrador persistido.
  Un borrador vacio tambien lo limpia.
- **F1d.** No se persiste la foto ni las detecciones; solo `{ origin, items }`.
- **F1e.** La lectura tolera `localStorage` no disponible o JSON corrupto: borrador
  vacio, sin romper.

### F2. Busqueda que prioriza tu uso

- **F2a.** Helper puro `usageCounts(meals)` en `src/core/recents.ts`: cuenta las
  apariciones de cada `classId` en el diario (sin almacenar).
- **F2b.** `searchFoods(query, limit, catalog, usage?)` en `src/catalog/search.ts`:
  ordena por relevancia de texto y, **a igualdad**, por uso descendente y luego por
  nombre. Sin `usage`, el orden es el de hoy (sin regresion).
- **F2c.** `main.ts` calcula `usageCounts(vault.meals)` y lo pasa a `searchFoods`.
- **F2d.** La relevancia del texto **manda**: el uso nunca adelanta un resultado de
  menor relevancia.

### F3. Explorar el catalogo por categorias

- **F3a.** Modulo `src/catalog/categories.ts`: `Category` (union de claves),
  `CATEGORY_ORDER`, `categoryOf(id)`, `foodsByCategory(category, catalog)` y una
  **guarda de paridad**: todo id del catalogo tiene categoria (test).
- **F3b.** En el modo Buscar, una fila de chips (una por categoria) encima de los
  resultados; un toque filtra por esa categoria (resultados clicables, mismo
  `addFoodToDraft`).
- **F3c.** Con la busqueda **vacia**, se muestran las categorias para explorar
  (antes: nada).
- **F3d.** Los chips y resultados miden **>= 44 px** (objetivo tactil).
- **F3e.** Un chip activo se marca (`aria-pressed`); volver a pulsarlo (o teclear)
  sale del filtro.

### i18n (F1-F3)

Claves nuevas en **es** y **en** (el tipo `StringKey` y la guarda de paridad lo
imponen):

| Clave                         | ES                   | EN                |
| ----------------------------- | -------------------- | ----------------- |
| `search.explore`              | Explorar             | Explore           |
| `category.cereals`            | Cereales y pan       | Cereals & bread   |
| `category.potatoes`           | Patatas y tuberculos | Potatoes & tubers |
| `category.legumes`            | Legumbres            | Legumes           |
| `category.vegetables`         | Verduras             | Vegetables        |
| `category.fruits`             | Frutas               | Fruits            |
| `category.dairy`              | Lacteos y postres    | Dairy & desserts  |
| `category.protein`            | Proteinas            | Protein           |
| `category.dishes`             | Platos cocinados     | Cooked dishes     |
| `category.sweets`             | Dulces y reposteria  | Sweets & bakery   |
| `category.nuts`               | Frutos secos         | Nuts              |
| `category.sauces`             | Salsas y grasas      | Sauces & fats     |
| `category.drinks`             | Bebidas              | Drinks            |
| `search.draftRestored` (aria) | Borrador restaurado  | Draft restored    |

## Criterios de aceptacion

Los criterios marcados _(m)_ se comprueban con una formula concreta (Tests).

1. **(F1)** Con un borrador de varios items, **recargar** la app lo **restaura**
   (mismos items, mismos gramos y orden); registrar o cancelar lo **descartan**. _(m)_
2. **(F1)** Un `carbos.draft` corrupto o ausente no rompe: arranca con borrador
   vacio. _(m)_
3. **(F2)** Con un alimento frecuente y otro raro **igualmente relevantes** para una
   consulta, el frecuente aparece **antes**; con `usage` vacio, el orden es el de
   hoy. _(m)_
4. **(F2)** El uso **no** adelanta un resultado de **menor relevancia** de texto. _(m)_
5. **(F3)** Todo id del catalogo resuelve a **una** categoria (guarda de paridad). _(m)_
6. **(F3)** Pulsar una categoria lista **solo** alimentos de esa categoria; un toque
   anade al borrador con la porcion por defecto. _(m)_
7. **(F3)** Con la busqueda vacia, se ofrecen las categorias para explorar. _(m)_
8. **(F3)** Chips y resultados miden **>= 44 px**.
9. **Sin regresiones**: SPEC 22 y 23 siguen verdes (nav, linea de tiempo, resumen,
   quick-add, objetivo, repetir).
10. **i18n**: toda clave nueva existe en **es** y **en**; guarda de paridad intacta.
11. `make check` (+ `make e2e` con los escenarios nuevos) en verde.

## Tests

- **Unitarios** (vitest):
  - `src/core/draft.ts`: `parseDraft` tolerante (vacio/corrupto -> `null`), ida y
    vuelta `serialize`/`parse`; guarda de version.
  - `src/core/recents.ts`: `usageCounts` cuenta apariciones y ignora items sin
    `classId`.
  - `src/catalog/search.ts`: el uso desempata a igual relevancia y no adelanta
    relevancia menor; sin `usage` no cambia el orden.
  - `src/catalog/categories.ts`: paridad (todo id categorizado) y `foodsByCategory`
    no vacio.
  - `src/i18n/index.test.ts`: la guarda de paridad cubre las claves nuevas.
- **E2E** (Firefox, `make e2e`):
  - anadir un alimento al borrador, recargar y comprobar que **sigue** ahi; cancelar
    lo descarta;
  - explorar una categoria y anadir un alimento desde ella;
  - (la busqueda por uso se cubre en unitarios; el E2E del buscador ya existe).
- **Auditoria** (`make audit-uiux`): los chips y resultados quedan cubiertos por la
  regla de objetivo tactil (MIN_HIT=44) existente.
- **Gate**: `make check`.

## Fuera de alcance

- **Deshacer el borrado** (undo) y cualquier cambio a la confirmacion deliberada de
  borrado (SPEC 23 C4): sigue igual.
- **Aprender de las correcciones** y **porcion habitual por alimento** (D33): siguen
  aparcadas.
- **Persistir la foto o las detecciones** en el borrador.
- **Categorias en el catalogo generado**: el generador (`tools/catalog/`) no se toca;
  las categorias son curadas aparte.
- **Recordatorios, red, cuentas y sincronizacion** (D4): sin cambios.
- **Dosis**: nada de esto alimenta la aritmetica de insulina ni el camino a una dosis.
- **Cambios de esquema**: `Vault` no cambia.

## Riesgos

- **Borrador que resucita algo ya registrado.** Mitigacion: se limpia al registrar y
  al cancelar; solo se restaura si sigue habiendo items.
- **Borrador viejo (de otro dia).** Mitigacion: el borrador se registra en el dia en
  vista (comportamiento actual); restaurarlo no altera esa regla, y cualquier
  registro lo descarta.
- **Ranking que entierre un resultado relevante.** Mitigacion: la relevancia de
  texto manda; el uso solo desempata.
- **Categorias que se desincronicen del catalogo.** Mitigacion: guarda de paridad en
  test (todo id categorizado).
- **Ruido visual (identidad calmada).** Mitigacion: los chips son una fila discreta y
  solo aparecen en el modo Buscar.

## Referencias

- Internet (2026-10-15): Cal AI (resena de App Store sobre perder el borrador);
  client-side-form.com, _Draft Persistence and Autosave_; renderpx.dev (patron
  Autosave/Draft); W3C WCAG 2.2 (SC 3.3.7 Redundant Entry, SC 1.4.4); Cronometer
  ("Filter By Category"; "Tips & Tricks: Searching For A Food", 2024); Yazio
  (orden por favoritos y hora); NN/g ("Search Is Not Enough", 2014; "Empty States",
  2021); Carbs & Cals (ingredientes/platos comunes); JMIR (_Designing a Carbohydrate
  Counting App… Usability Testing_, 2026).
- `docs/specs/22-uiux-v3.md` (nav y Diario), `docs/specs/23-calidad-de-vida.md`
  (primer pase QoL), `docs/specs/16-uiux-v2.md` (identidad y tokens),
  `docs/decisiones.md` (D11, D33, D57 y las nuevas D62-D64).
- `src/main.ts` (`renderSearch`, `addFoodToDraft`, `renderDraft`, `resetEdit`,
  `wire`), `src/catalog/search.ts`, `src/catalog/catalog.ts`, `src/core/recents.ts`,
  `src/i18n/index.ts`.
