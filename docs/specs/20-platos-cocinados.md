# SPEC 20 - Platos cocinados y guisos: diagnostico y opciones

> [!abstract] TL;DR
> El usuario percibe un hueco: buen soporte de **ingredientes sueltos**, menos de **platos
> cocinados/guisos/combinados**. Causas: (a) el pipeline es **por caja** y un guiso es una **mezcla
> homogenea**; (b) el catalogo es **plano** (un `carbsPer100g` fijo por plato, sin receta); (c) los
> platos del grupo H tienen **poquisimas imagenes** (fabada 2, crema_verduras 3, paella 5). **Medido**:
> con el reparto de porcion por area (D1, SPEC 18), el **detector gana al modo "un plato"** en 1, 2 y
> 3+ ingredientes — incluidas las mezclas —, asi que **quitar el detector no ayuda a los guisos**; el
> arreglo real era D1. Las palancas son **catalogo (clases de guiso), datos y prompts**, no la
> localizacion. Lo mas barato y de mas valor: **anadir guisos al catalogo (Ciqual) + sinonimos** y
> **alimentarlos con datos**; el codigo de barras (spec 17) ya cubre el guiso **envasado**.

Tabla por grupos y huecos del catalogo en [`../catalogo.md`](../catalogo.md). Diagnostico de modelo y
detector en [`18-modelo-deteccion.md`](18-modelo-deteccion.md).

## Diagnostico

1. **Mezcla vs item.** El pipeline clasifica **caja por caja** (`src/model/worker.ts:239-269`) y el
   carbohidrato se reparte por area (`eval/infer.ts`). Un guiso es una mezcla homogenea: no se
   "detecta" como varios items. El detector COCO solo tiene ~10 clases de comida y ninguna de guiso.
2. **Catalogo plano.** Cada plato es una clase con `carbsPer100g` fijo (`src/catalog/schema.ts`), sin
   receta ni composicion. El grupo H (16 platos) va de **1,98 g/100 g** (`tortilla_francesa`) a
   **28,3 g/100 g** (`hamburguesa`) — ~14x: un solo numero describe realidades muy distintas.
3. **Datos finos.** En `data/images`: `fabada` 2, `crema_verduras` 3, `arroz_basmati` 4, `paella` 5,
   `espaguetis_bolonesa` 6; ~72 % marcadas para revision. 26 de 154 clases tienen <8 imagenes.
4. **Hueco de catalogo.** `tools/catalog/selection.csv` (154 filas) no trae albondigas, cocido,
   estofados, huevos rotos, salmorejo, patatas bravas, arroz a la cubana, sushi, kebab.

## Experimento: ¿ayuda el modo "un plato" a los guisos? (NO)

Se re-cortaron los resultados de identificacion por **numero de ingredientes del plato** (los CSV de
Nutrition5k traen el desglose por ingrediente), con el student **sin fuga** y agregacion por **area**
(`make identify --oracle detector|full|center`):

| Localizacion                      | 1 ingrediente (161 platos) | 2 (46)               | 3+ (300)             | Global (507) |
| --------------------------------- | -------------------------- | -------------------- | -------------------- | ------------ |
| **detector** (MAE / recall top-3) | **13,43 g / 32,8 %**       | **17,38 g / 16,7 %** | **18,48 g / 31,7 %** | **16,78 g**  |
| imagen completa (oracle)          | 16,66 g / 25,9 %           | 19,44 g / 11,9 %     | 19,78 g / 17,4 %     | 18,76 g      |
| recorte central (oracle)          | 17,58 g / 31,9 %           | 20,00 g / 14,3 %     | 19,81 g / 17,7 %     | 19,12 g      |

**Lectura (corrige la SPEC 18):** el "16,4 g con imagen completa" del oracle era un artefacto de la
**suma de porcion por caja**; una vez arreglada (D1, reparto por area), el **detector es mejor que
quitar el detector en todos los tramos**, y en **combinados (3+) el margen es grande** (recall top-3
31,7 % vs 17,4 %). Es decir: **el modo "un plato" NO rescata los guisos** — los perjudica. El cuello
no era la localizacion, era la agregacion de porcion (ya corregida).

## Opciones

### A. Catalogo y modelo de datos

- **A1. Ampliar el catalogo plano con guisos** (filas nuevas en `selection.csv` con `alim_code` de
  Ciqual + `make catalog`). Mecanismo listo (D2 dice "alimentos **y platos**"). Barato en codigo;
  solo cubre el **buscador** hasta tener imagenes.
- **A2. Plantilla de receta/composicion** (`composition: {ingredientId, fraction}[]`): derivar
  carbohidratos de ingredientes ya presentes. Modela la varianza intra-plato y es editable, pero **no
  hay fuente abierta de fracciones** (curacion propia) y toca schema/runtime/UI. Si se hace, la cifra
  debe salir como **rango** (regla de incertidumbre), no como valor puntual.
- **A3. Banda de incertidumbre por clase** (`carbsRange`): barato, honesto; exige fuente min/max.

### B. Datos

- **B1. Ampliar `data/images` con guisos** (`tools/data/fetch_images.py`). Cuota baja por clase y
  ruido (Commons devuelve guisos extranjeros) → revision obligatoria.
- **B2. Contribuciones opt-in** (D38/D39): receptor listo; export en app diferido.
- **B3. Datasets para _teacher_ offline**: FoodSeg103 (**Apache-2.0**, usable); UECFood/Recipe1M/
  MM-Food-100K **no comerciales** → solo teacher offline, **nunca** para entrenar los pesos servidos
  (AGPL/jsDelivr). FoodNExTDB (UAM) es del dominio espanol pero **research-only**: sirve para
  **evaluar**, no para entrenar el producto.
- **B4. Aumento sintetico**: no aporta carbohidratos; depriorizar.

### C. Modelo e inferencia

- **C1. Prompts del teacher + sinonimos regionales** (`training/distill_clip.py:prompts_for`): barato,
  preexistente; mejora las soft-labels de las clases de guiso que ya existen.
- **C2. Multi-etiqueta "barato" sobre el top-k**: el worker ya emite `topk` por caja; ofrecer que el
  usuario marque 2-4 ingredientes candidatos descompone el guiso **sin mascaras ni modelos nuevos**.
- **C3. Multi-etiqueta / segmentacion** (head sigmoide o FoodSeg103+SegFormer): ataca la causa raiz,
  pero exige etiquetas de ingrediente/mascaras que hoy no existen y anotacion por pixel. Largo plazo;
  tensiona D27 (cajas, no mascaras).

### D. UX, captura, porcion y vias alternativas

- **D1. Clases + sinonimos de guisos en el buscador** (`src/catalog/search.ts`): el arreglo mas barato
  (`fabada` solo tiene "potaje de alubias"). Cubre la ausencia inmediata.
- **D2. Plantillas/recetas guardadas** (IndexedDB estilo barcode): "cocido de casa" = composicion fija
  reutilizable de un toque. Cubre el guiso **sin depender del modelo**. Cuidado con `DB_VERSION`
  (no tocar `SCHEMA_VERSION`); no es "aprender de correcciones" (D33).
- **D3. Porcion de guiso** (racion/cazo/cucharon, o area): hoy la caja grande fuerza x1.4
  (`src/model/portion.ts`). Ataca el mayor confusor del MAE sin tabla nueva (deuda D25 sigue).
- **D4. Codigo de barras (ya existe).** Tarrinas, latas y guisos **envasados** se resuelven por EAN +
  Open Food Facts **sin vision** (spec 17; OFF es ODbL-1.0, requiere D47). Es la via natural para
  buena parte del "guiso" real (de bote/lata).

## Escalera de recomendacion

1. **D1 + A1**: anadir guisos al catalogo (Ciqual) con sinonimos. Barato; mejora el buscador ya.
2. **D3 + C1**: porcion de guiso y re-destilado con prompts de plato.
3. **B1 + B2**: alimentar las clases nuevas (imagenes/revision, contribuciones).
4. **C2**: descomposicion suave por top-k (sin modelos nuevos).
5. **D4**: empujar el codigo de barras para envasados (spec 17).
6. **A2/D2 y C3**: receta/plantillas y multi-etiqueta/segmentacion (largo plazo).

**NO hacer**: modo "un plato" por defecto (perjudica los combinados, medido arriba; ademas rompe D21
multi-item); entrenar los pesos servidos con datos no comerciales.

## Como medir (y limites)

- `make identify --oracle detector` con el troceo por ingredientes (`by_ingredients`) para ver el
  efecto en mezclas; `make eval` para MAE/cobertura.
- **LIMITES**: Nutrition5k son platos de cafeteria (Google), **no guisos espanoles**, y su GT es el
  carbohidrato **total** del plato. No desglosa grupo H ni un "cocido" real. Sin imagenes por guiso no
  se puede medir ni entrenar recall especifico. La medicion representativa requiere el set propio
  pesado (D25), hoy diferido.

## Incognitas

- Cuantos platos compuestos ofrece Ciqual por `alim_code` (albondigas, cocido, salmorejo…) sin listar.
- Licencias de datasets externos para AGPL (solo teacher) y de FoodSeg103 (Apache-2.0 declarado).
- Cuota real de imagenes libres por guiso concreto en Wikimedia.
- Si conviene modelar el guiso como **clase-plato** o como **composicion** (no medido).
