# SPEC 18 - Modelo de deteccion: diagnostico, experimentos y opciones

> [!abstract] TL;DR
> Medimos, sobre Nutrition5k (507 platos), el techo de un clasificador **alineado al catalogo**
> (CLIP ViT-B/32 zero-shot, y su estudiante destilado) en el **mismo pipeline** que el baseline, y
> despues con un **oracle de localizacion** (una sola caja limpia, sin detector). Resultado: con el
> detector, la alineacion **sube la cobertura (34 % -> ~99 %)** y **mejora la identificacion**
> (~1,5-2x), pero **empeora el MAE** (15,2 g -> 29,2 g). **El oracle zanja la duda**: con una caja
> limpia, el student pasa a **16,4 g (casi el baseline)** y **duplica la identificacion**
> (caja top-1 15-18 % vs 6,7-9,3 %). Es decir, **el clasificador no es el problema: el MAE se
> destruye por la interaccion (student resuelve _todas_ las cajas) x (detector da 2,28 cajas/plato) x
> (se **suma la porcion por defecto por caja**)**. La via barata y de mayor valor es **una caja limpia
> por plato** (modo "un plato") y/o **arreglar la agregacion de porcion**; hay que medir
> identificacion ademas del MAE (herramienta añadida).
>
> **Aplicado:** con el arreglo de porcion (**D1**, reparto por area) el student pasa a **16,2 g con
> ~100 % de cobertura** (baseline: 15,1 g / 34 %) y **sin fuga** (**C1**, re-entrenado sobre
> `data/images`) se mantiene (**16,5 g**): el valor esta en la **cobertura** y el **top-3**, no en el
> top-1. Despliegue preparado (`weights-0.2.0`), pendiente commit + tag + push.

Mecanica del banco en [`05-benchmark.md`](05-benchmark.md); comparacion de modelos en
[`11-comparacion-modelos.md`](11-comparacion-modelos.md); pipeline de destilacion en
[`07-finetuning.md`](07-finetuning.md).

## La pregunta

La deteccion de alimentos es pobre en la app. ¿Subimos la **tasa de deteccion** (que encuentre
comida) o cambiamos la **forma de identificar**? Este spec documenta las opciones y las mide.

## Diagnostico revisado (con evidencia medida)

1. **El cuello de botella tiene dos capas, no una.** La SPEC 11 decia "taxonomia/cobertura". Los
   experimentos de aqui muestran que la taxonomia es **necesaria pero no suficiente**: alinearla
   sube la cobertura al ~99 % y la identificacion ~1,5x, pero el error de carbohidratos **empeora**.
2. **El MAE de carbohidratos esta confundido.** `eval/metrics.ts` calcula el MAE y la cobertura
   (`resueltas/cajas`), y `eval/infer.ts` (`predictedCarbs`) estima el carbohidrato sumando
   `defaultPortionGrams * carbsPer100g` **por caja resuelta** (sin deduplicar ni escalar). Un modelo
   con mas cobertura resuelve mas cajas y **sobrecuenta**: en el estudiante, `avgPredCarb = 36,3 g`
   contra `trueCarb = 19,7 g` (x1,85). Con el baseline (34 % de cobertura) `avgPredCarb = 10,2 g`
   (subcuenta). El MAE premia, en la practica, **resolver poco**.
3. **El detector es el cuello real de localizacion.** YOLO11n COCO encuentra ~2,3 cajas/plato y
   muchas estan mal ubicadas (cajas alargadas o desplazadas sobre el plato). Los recortes que
   alimentan al clasificador son, a menudo, fondo. La precision de identificacion por caja de
   **cualquier** clasificador queda atrapada por esto (7-11 % top-1 en nuestro mapeo de referencia, un
   limite inferior).

## Metodologia

- **Banco**: Nutrition5k, split `rgb_test_ids`, 507 platos con imagen cenital en `eval/cache/images`.
- **Metricas de banco** (`make eval`): MAE carb, %MAE, MAE masa, **cobertura**.
- **Metrica añadida de identificacion** (`make identify`, `training/eval_identify.py`): replica el
  pipeline on-device (detector 640 -> recorte +10 % -> clasificador 224 -> top-3 -> resolucion al
  catalogo) y, usando los **ingredientes reales** de Nutrition5k como referencia (mapeo
  ingrediente->catalogo, gramos > 5 g), mide **precision por caja (top-1/top-3)** y **recall de
  plato**. Es un limite inferior (mapeo parcial), valido para **comparar A/B**.
- **Techo del teacher** (`make teacher-eval`, `training/eval_clip.py`): CLIP ViT-B/32 zero-shot
  sobre el catalogo, sin entrenar (sin fuga), imagen completa.
- **Artefactos**: `training/out/student_catalog.int8.onnx` (4,6 MB, 155 clases = 154 ids +
  `__unknown__`) y un manifest candidato `training/out/student_catalog.eval-manifest.json`.

## Resultados (507 platos, mismo pipeline)

| Config                                                      | MAE carb    | %MAE    | MAE masa | Cobertura  | Caja top-1 | Caja top-3 | Recall plato (top-1)  |
| ----------------------------------------------------------- | ----------- | ------- | -------- | ---------- | ---------- | ---------- | --------------------- |
| **A. ImageNet (baseline, shipped)** `make eval`             | **15,19 g** | 77,2 %  | 147,8 g  | 34,1 %     | 7,1 %      | 14,5 %     | 13,7 %                |
| B. ImageNet, clase del detector (`--source detector`)       | 19,84 g     | 100,8 % | 182,7 g  | 75,9 %     | —          | —          | —                     |
| **C. Teacher CLIP zero-shot al catalogo** (imagen completa) | 15,67 g     | 79,6 %  | 122,1 g  | **98,8 %** | —          | —          | 22,8 % (top-3 39,0 %) |
| D. Student alineado al catalogo (mapa identidad)            | 29,23 g     | 148,5 % | 192,3 g  | **100 %**  | **11,3 %** | **24,3 %** | **21,7 %**            |
| E. Student + gating por detector                            | 25,26 g     | 128,3 % | 198,1 g  | 99,9 %     | —          | —          | —                     |

> La fila A por `make eval` da 15,19 g / 34,1 %; el harness de identificacion (replica en Python)
> da 15,68 g / 33,2 %, practicamente el mismo numero. La fila D reproduce 29,78 g por `make eval`
> y 29,23 g por el harness. Todo consistente.

**Lectura honesta de la tabla:**

- **Cobertura vs MAE**: subir cobertura de 34 % a ~99 % **no baja el MAE** (lo sube). No es que la
  taxonomia "no sirva"; es que el MAE **no la recompensa** (hallazgo 2).
- **Identificacion**: con la metrica correcta, el modelo alineado al catalogo **si** es mejor que
  el baseline (caja top-1 11,3 % vs 7,1 %; top-3 24,3 % vs 14,5 %; recall de plato 21,7 % vs 13,7 %).
  El teacher whole-image coincide (22,8 % top-1 de plato).
- **Caveat de fuga**: el estudiante se destilo sobre `eval/cache/images` (= el propio test). Sus
  numeros son **optimistas**; aun asi, no baten el MAE. El baseline no tiene esa ventaja.

## Experimento oracle: ¿detector o clasificador?

Nutrition5k no trae cajas ni mascaras por ingrediente, pero si imagenes cenitales de **un plato en
cuadro**. Eso permite un **oracle de localizacion**: sustituir el detector por **una sola caja** —o
bien la imagen completa (`full`) o un recorte central (`center`) — y medir el clasificador **aislado
del detector**. Si el oracle mejora mucho, el detector es el cuello; si no, lo es el clasificador.

| Localizacion                 | Clasificador                          | MAE carb    | %MAE    | MAE masa | Cobertura | Caja top-1 | Caja top-3 | Plato top-1 | Plato top-3 |
| ---------------------------- | ------------------------------------- | ----------- | ------- | -------- | --------- | ---------- | ---------- | ----------- | ----------- |
| detector COCO                | ImageNet (shipped)                    | 15,68 g     | 79,7 %  | 148,6 g  | 33,2 %    | 7,1 %      | 14,5 %     | 13,7 %      | 23,3 %      |
| detector COCO                | student catalogo                      | **29,23 g** | 148,5 % | 192,3 g  | 100 %     | 11,3 %     | 24,3 %     | 21,7 %      | 35,5 %      |
| imagen completa (oracle)     | ImageNet                              | 15,48 g     | 78,7 %  | 152,2 g  | 43,0 %    | 6,7 %      | 13,6 %     | 7,5 %       | 15,3 %      |
| imagen completa (oracle)     | student catalogo                      | **16,43 g** | 83,5 %  | 122,8 g  | 99,0 %    | **15,2 %** | **29,0 %** | 17,1 %      | 32,6 %      |
| recorte central 0.7 (oracle) | ImageNet                              | 15,25 g     | 77,5 %  | 146,0 g  | 51,7 %    | 9,3 %      | 16,0 %     | 10,4 %      | 18,0 %      |
| recorte central 0.7 (oracle) | student catalogo                      | 16,96 g     | 86,2 %  | 120,0 g  | 99,4 %    | **17,9 %** | **30,8 %** | 20,2 %      | 34,6 %      |
| imagen completa              | teacher CLIP zero-shot (sin entrenar) | 15,67 g     | 79,6 %  | 122,1 g  | 98,8 %    | —          | —          | 22,8 %      | 39,0 %      |
| detector COCO + gating       | ImageNet                              | 19,84 g     | 100,8 % | 182,7 g  | 75,9 %    | —          | —          | —           | —           |
| detector COCO + gating       | student catalogo                      | 25,26 g     | 128,3 % | 198,1 g  | 99,9 %    | —          | —          | —           | —           |

**Lecturas del oracle:**

1. **El clasificador NO es el problema principal.** El student, con **una sola caja limpia**, pasa de
   **29,23 g a 16,43 g** (imagen completa) — **casi el baseline (15,19 g)** — y **duplica la
   identificacion** (caja top-1 15-18 % vs 6,7-9,3 % de ImageNet; plato top-3 33-35 % vs 15-18 %).
   El teacher CLIP whole-image (15,67 g, 39,0 % top-3) confirma lo mismo.
2. **El MAE se destruia por una interaccion de tres piezas, no por la precision:** (el student
   resuelve _todas_ las cajas) x (el detector produce 2,28 cajas/plato) x (se **suma una porcion por
   defecto por caja**). Con una sola caja desaparece el sobreconteo. El baseline ImageNet, al resolver
   solo el 33 % de las cajas, **esquiva** el problema (detector 15,68 ≈ oracle 15,25).
3. **El detector degrada la precision del recorte pero aporta recall.** Caja top-1 del student: 11,3 %
   (detector) vs 17,9 % (recorte central); pero el plato top-1 apenas cambia (21,7 % vs 20,2 %) porque
   las 2,28 cajas compensan. Es decir: el detector **no es catastrofico**, pero sus recortes **si**
   cuestan precision y, con un modelo que resuelve todo, **disparan el MAE**.

**Implicacion**: la via barata y de mayor valor es **una caja limpia por plato** (modo "un plato") y/o
**arreglar la agregacion de porcion**; el clasificador alineado al catalogo ya esta a la altura del
baseline cuando la localizacion es decente. Caveat intacto: fuga del student (entrenado sobre el test).

> [!warning] Correccion posterior (D1)
> Este experimento se corrio **antes** de arreglar la agregacion de porcion. Bajo la suma por caja, el
> oracle parecia ganar; **una vez aplicado D1 (reparto por area), el detector gana al oracle en todos
> los tramos**, incluidos los combinados (verificado troceando por nº de ingredientes; ver
> [`20-platos-cocinados.md`](20-platos-cocinados.md)). Es decir: **el cuello era la agregacion de
> porcion (D1), no la localizacion**; el modo "un plato" (A2) queda **depriorizado**.

## Arreglo D1: agregacion de porcion (aplicado)

El banco sumaba una porcion por defecto **por caja**. Se probaron cuatro agregaciones en una sola
pasada (identify harness):

| Agregacion                       | MAE carb ImageNet | MAE carb student |
| -------------------------------- | ----------------- | ---------------- |
| suma por caja (antes)            | 15,68 g           | **29,23 g**      |
| dedupe por alimento              | 15,29 g           | 20,20 g          |
| una caja (mayor score)           | 15,51 g           | 16,45 g          |
| **ponderada por area (elegida)** | **15,24 g**       | **16,34 g**      |

Implementado en `eval/infer.ts` (`predictedCarbs` y `predictedCarbsDetector` via `splitPlate`): la
porcion de cada caja se reparte por **area** (`area_caja / area_total`) en vez de sumar una porcion
completa por caja. Con una sola caja no cambia.

`make eval` con D1 (agregacion por area):

| Config                      | MAE carb    | %MAE   | MAE masa | Cobertura |
| --------------------------- | ----------- | ------ | -------- | --------- |
| baseline ImageNet           | **15,06 g** | 76,5 % | 147,1 g  | 34,1 %    |
| student catalogo (sin fuga) | 16,51 g     | 83,9 % | 120,9 g  | 100 %     |
| student catalogo (con fuga) | 16,23 g     | 82,4 % | 130,1 g  | 99,9 %    |

> D1 **cambia la definicion** de la metrica: los numeros previos del spec (15,19 g / 29,78 g) son de
> la definicion antigua (suma por caja). Bajo la nueva, el student queda **a la par del baseline en
> MAE** y con **~3x la cobertura**.

## Arreglo C1: student sin fuga (aplicado, despliegue preparado)

El student original se destilo sobre `eval/cache/images` (= el test). Se re-entreno sin fuga con
`training/distill_clip.py --data data/images` (Wikimedia, 2.132 imagenes, 154 clases), teacher CLIP
ViT-B/32:

| Student                  | MAE carb | Cobertura | Caja top-1 | Caja top-3 | Plato top-1 | Plato top-3 |
| ------------------------ | -------- | --------- | ---------- | ---------- | ----------- | ----------- |
| con fuga (sobre el test) | 16,23 g  | 99,9 %    | 11,3 %     | 24,3 %     | 21,7 %      | 35,5 %      |
| **sin fuga (honesto)**   | 16,51 g  | 100 %     | 6,9 %      | **17,3 %** | 13,7 %      | **30,6 %**  |
| baseline ImageNet        | 15,06 g  | 34,1 %    | 7,1 %      | 14,5 %     | 13,7 %      | 23,3 %      |

**Lecturas:** (1) la fuga **no** inflaba el MAE (16,23 vs 16,51) pero **si** el top-1 de identificacion
(11,3 % vs 6,9 %); (2) el student honesto queda **a la par del baseline en MAE** con **100 % de
cobertura** y **mejor top-3** (caja 17,3 % vs 14,5 %; plato 30,6 % vs 23,3 %), aunque su **top-1 es
igual o peor** — el valor esta en "siempre propone algo (top-3)" y en eliminar el "desconocido".

**Despliegue preparado** (no aplicado a produccion): `training/out_noleak/model-manifest.json`
(version `weights-0.2.0`, classifier `distill-clip-clip-vit-base-patch32-v1`, 155 clases; detector
sin cambios). Publicar requiere commit + tag `weights-0.2.0` + push:

```bash
cp training/out_noleak/weights/classifier.int8.onnx weights/classifier.int8.onnx
cp training/out_noleak/model-manifest.json public/model-manifest.json
git add weights public/model-manifest.json && git commit -m "feat(model): clasificador alineado al catalogo (distill CLIP, sin fuga)"
git tag weights-0.2.0 && git push --follow-tags
```

## Opciones, con lo medido

### A. Detector y localizacion

- **A1. Fine-tune / sustituir el detector por uno de comida.** El oracle muestra que el clasificador
  ya rinde con una caja limpia; el detector COCO cuesta **precision de recorte** (caja top-1 11,3 % vs
  17,9 %) y, con un modelo que resuelve todo, **dispara el MAE**. Un detector de comida (o
  segmentacion) sube la calidad de los recortes. Esfuerzo alto (anotacion de cajas; `training/` no
  tiene aun entrenador de detector), riesgo con set pequeño.
- **A2. Evitar el detector en captura de un plato.** Para una foto cenital de un plato unico, usar
  el **clasificador sobre la imagen completa** (como el teacher: 15,67 g con **98,8 %** de cobertura)
  en vez de deteccion+dos recortes malos. Barato, mejora la UX en el caso comun; pierde el multi-item.
- **A3. Tuning de umbrales** (`worker.ts` 0,25/0,45/12): sube candidatas pero, por el hallazgo 2,
  empeora el MAE. Perseguir identificacion, no cobertura.

### B. Clasificador / taxonomia

- **B1. Desplegar el student alineado al catalogo.** Con D1 queda **a la par del baseline en MAE** y
  con **100 % de cobertura** y mejor top-3. Mapa identidad **hecho**, sin fuga **hecho** (C1);
  despliegue **preparado** (`weights-0.2.0`). Decision de producto pendiente (top-1 igual/peor).
- **B2. Linear probe (D32) / re-destilar (D32)** con el set propio o `data/images`, teacher mejor
  (SigLIP/MobileCLIP2-S0). Pipeline listo; falta **datos alineados y limpios**.
- **B3. Gating por clase del detector (hibrido).** Medido: mejora el MAE del student (29,8 -> 25,3
  bajo la agregacion antigua) pero **no** la identificacion y **no** bate el baseline. No se despliega.

### C. Datos y medicion

- **C1. Fuga del benchmark (HECHO).** Re-entrenado sobre `data/images` sin fuga: MAE 16,5 g / 100 %
  cobertura (la fuga no inflaba el MAE, si el top-1). Ver seccion C1.
- **C2. Metrica de identificacion en el banco.** Añadida (`make identify`). **El MAE solo induce a
  error**; el CI debe reportar las dos.
- **C3. Set propio pesado (D25).** La deuda que impide medir de verdad (dominio español + porciones
  reales). Contribuciones opt-in (D38/D39) ya tienen receptor y toggle en la app.

### D. Porcion y agregacion

- **D1. Agregacion de porcion (HECHO).** Reparto por area en `eval/infer.ts`. Antes, sumar una
  porcion por caja era el mayor confusor del MAE. Pendiente: portar el criterio a la **propuesta**
  de la app (hoy por item, `suggestPortion`) y revisar `suggestPortion` a la luz del oracle.

## Arreglos aplicados en esta iteracion

1. **Mapa identidad** (`src/catalog/classmap.ts`): `resolveClass` ahora resuelve por **id** de
   catalogo ademas del mapa D31, para que un modelo alineado al catalogo (student) no caiga entero
   en "desconocido". Con test en `classmap.test.ts`.
2. **Agregacion de porcion por area (D1)** (`eval/infer.ts:predictedCarbs`/`predictedCarbsDetector`):
   reparte la porcion del plato entre las cajas por area, en vez de sumar una porcion completa por
   caja. Arregla el MAE del student (29,2 g -> 16,3 g).
3. **Student sin fuga (C1)**: re-entrenado sobre `data/images`; MAE 16,5 g / 100 % cobertura.
   Despliegue preparado en `training/out_noleak/model-manifest.json` (`weights-0.2.0`).
4. **Herramientas de experimento**: `training/eval_clip.py` (techo del teacher y recall),
   `training/eval_identify.py` (identificacion por caja + oracles + variantes de agregacion),
   `tools/eval/make_candidate_manifest.py`. Targets: `make teacher-eval`, `make identify`,
   `make candidate-manifest`.

Gating por detector **no** se despliega: se evalua via `make eval --source detector`.

## Escalera recomendada

1. **Medir con las dos metricas** (`make eval` + `make identify`). El MAE solo no decide. **(hecho)**
2. **Agregacion de porcion (D1)**: reparto por area. **(hecho)**. Sin esto el MAE no era interpretable.
3. **Student sin fuga (C1)** y **decidir el despliegue** (`weights-0.2.0`): gana en cobertura/top-3,
   empata en MAE. **(preparado, decision pendiente)**
4. **Modo "un plato"** (A2): **depriorizado** — medido que con D1 el detector **gana** al modo
   imagen-completa, tambien en combinados (ver `20-platos-cocinados.md`).
5. **Fine-tune del detector** (A1) para subir la **precision de recorte** (caja top-1), ahora que
   sabemos que el clasificador no es el cuello.
6. **Set propio (D25/C3)** para sustituir el numero "comparable" por uno representativo.

## Reproducibilidad

```bash
# baseline (shipped)
make eval EVAL_ARGS="--concurrency 6"
# techo del teacher CLIP zero-shot (sin fuga)
make teacher-eval
# manifest del candidato + identificacion por caja
make candidate-manifest CAND_CLASSIFIER=training/out/student_catalog.int8.onnx \
  CAND_CLASSES=training/out/student_catalog.manifest.json CAND_OUT=training/out/student_catalog.eval-manifest.json
make eval EVAL_ARGS="--manifest training/out/student_catalog.eval-manifest.json --root . --concurrency 6"
make identify CAND_CLASSIFIER=training/out/student_catalog.int8.onnx \
  CAND_CLASSES=training/out/student_catalog.eval-manifest.json CAND_TAG=student_catalog
```

Informes: `training/out/teacher_eval.report.json`, `training/out/identify-<tag>.json`,
`eval/results/nutrition5k-<candidato>-<source>-<fecha>.json`.

## Incognitas

- **Despliegue**: el artefacto `weights-0.2.0` esta preparado pero **no publicado** (requiere commit +
  tag + push). La decision de producto (top-1 igual/peor, cobertura mucho mayor) queda abierta.
- **Cuanto de la identificacion es detector vs clasificador**: el oracle de imagen completa/centro
  aisla la localizacion pero no es por-ingrediente (Nutrition5k no trae cajas/mascaras). Un oracle de
  cajas por ingrediente (anotacion propia) seria el siguiente experimento decisivo.
- **Calidad de `data/images`**: 72 % flagged para revision; el student sin fuga puede mejorar con
  etiquetado limpio o el set propio (D25).
- Licencias de modelos open-vocab modernos (MobileCLIP2-S0, SigLIP) y su tamano/latencia real en
  `onnxruntime-web`.
