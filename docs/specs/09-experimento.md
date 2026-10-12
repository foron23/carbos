# SPEC 09 - Experimento: shortlist de modelos y error (D28)

> [!abstract] TL;DR
> Experimento para elegir el par **(detector, clasificador)** de la shortlist (D28) midiendo el
> **error de carbohidratos por plato** sobre el split de test de **Nutrition5k** (CC BY 4.0). La
> v1 estima carbohidratos como **porcion por defecto de la clase predicha** (no hay regresion de
> masa), asi que el experimento mide, sobre todo, **deteccion + clasificacion + porciones por
> defecto**. Mecanica del banco en [`05-benchmark.md`](05-benchmark.md).

## Pregunta

¿Que combinacion de detector y clasificador publicos da el **menor error de carbohidratos por
plato** en un presupuesto de tamano y latencia apto para movil, sin fine-tuning?

## Hipotesis

- **H1**: detector + clasificador (multi-item) bate a un clasificador de plato unico.
- **H2**: un clasificador afinado/muy alineado a clases de comida reduce el error frente a un
  clasificador generico, aun sin fine-tuning propio (D20/D31).
- **H3**: el error dominante es de **clase/porcion por defecto**, no de deteccion, en platos
  con un solo alimento.

## Que mide exactamente

La v1 **no** predice gramos desde la imagen: usa la **porcion por defecto del catalogo** por cada
item detectado, y el usuario la ajusta (E6, D31). Por tanto:

```
carb_plato_predicho = sum( defaultPortionGrams(clase) * carbsPer100g(clase) / 100 )
```

- **End-to-end (primaria)**: `carb_plato_predicho` vs `total_carb` real del plato.
- **Componente**: clase top-1/top-5 vs ingredientes reales, y porcion por defecto vs gramos reales
  (aisla donde falla).
- **Masa**: `sum(defaultPortionGrams)` vs `total_mass` (informativo; no es una prediccion real).

## Datos y splits

- **Nutrition5k** (`gs://nutrition5k_dataset`), CC BY 4.0. Split oficial de **test**
  (`dish_ids/splits/rgb_test_ids.txt`, 709 platos); los escaneos incrementales del mismo plato
  quedan juntos.
- **Imagen de entrada**: RGB cenital `imagery/realsense_overhead/<dish_id>/rgb.png`.
- **Ground truth**: `dish_metadata_cafe{1,2}.csv` (campos 3 y 5: `total_mass`, `total_carb`).
- **Sesgo declarado**: cafeterias de California; **no** representa cocina espanola. Es una cifra
  **comparable** (D3/D25), no el numero del usuario objetivo. Se publica con el aviso.

## Modelos candidatos (shortlist)

Familias a probar (ONNX, de Hugging Face Hub / releases publicas):

- **Detector**: YOLOv8/YOLO11-nano (o similar) de deteccion de comida; salida `[1, 4+nc, anchors]`.
- **Clasificador**: MobileNetV3 / EfficientNet-Lite / ViT-tiny de clasificacion de comida
  (Food-101 o similar); salida logits.
- **Baseline**: sin detector, clasificador de plato unico (una caja = imagen completa).

La shortlist concreta se rellena con `--manifest` por cada candidato (URL + sha256 + bytes +
classes). El clasificador debe declarar `classes` como **etiquetas del mapa de clases** (E2).

## Variables y protocolo

| Variable        | Valores                                         |
| --------------- | ----------------------------------------------- |
| Detector        | {YOLO-nano, otro} o ninguno (baseline)          |
| Clasificador    | {MobileNetV3, EfficientNet-Lite, ViT-tiny, ...} |
| Umbral de score | 0.25 (fijo)                                     |
| IoU NMS         | 0.45 (fijo)                                     |
| Max detecciones | 12 (fijo)                                       |
| Entrada         | detector 640, clasificador 224 (fijo)           |

- Fijar semilla y split; correr cada combinacion con el **mismo** arnes.
- Empezar con una **muestra** (`--limit N`, p.ej. 50 platos) para descartar rapido; el numero
  final se calcula sobre los 709 del test.
- Repetir con `--limit 0` (todos) para la cifra publicable (E14).

## Metricas y criterio de decision

- **Primaria**: MAE de carbohidratos (g) e IC 95% por bootstrap.
- **Secundarias**: %MAE carb, MAE masa (g), Top-1/Top-5 de clase, **cobertura** (% de items
  mapeables al catalogo).
- **Regla de honestidad**: un item no mapeable cuenta como cobertura, no como acierto; se declara
  la incertidumbre, no un unico numero.
- **Criterio**: elegir el par de **menor MAE carb** con **tamano <= ~25 MB** y **latencia objetivo
  <= 2 s** en movil medio. Si **ningun** candidato baja del umbral honesto, se activa el
  fine-tuning (D20/D32, cabeza nueva).

## Salidas

- `eval/results/nutrition5k-<fecha>.json` (por plato + resumen + versiones de modelo y sha256).
- Tabla resumen en `README`/`docs` con fecha, benchmark, cobertura y la **deuda del set propio**.
- **Nada** del dataset se commitea; se descarga bajo demanda (cache local gitignored).

## Riesgos

- **Dominio**: el sesgo de Nutrition5k puede favorecer modelos entrenados en comida occidental.
- **Clases**: si el clasificador publico no cubre el catalogo, la cobertura hunde la cifra; es
  una senal para fine-tuning, no un fracaso del banco.
- **Porcion por defecto**: al no predecir masa, el error de porcion aparece como error sistematico;
  el banco lo hace **visible** (componente) en lugar de esconderlo.
- **Descarga**: el tarball completo son 181 GB; el banco usa solo metadata + RGB cenital.

## Pipeline de shortlist

Los scripts viven en `tools/shortlist/` y dejan los pesos en `eval/cache/models/` (gitignored).

```bash
# 1. Clasificadores ONNX ya publicados (Swin Food-101 int8, 93 MB)
python3 tools/shortlist/fetch_classifiers.py

# 2. Detector: exporta YOLO11n COCO a ONNX (requiere el venv de la shortlist)
python3 -m venv tools/shortlist/.venv
tools/shortlist/.venv/bin/pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
tools/shortlist/.venv/bin/pip install ultralytics
tools/shortlist/.venv/bin/python tools/shortlist/export_yolo11n.py

# 3. Manifests por candidato y banco
python3 tools/shortlist/build_manifests.py
make eval EVAL_ARGS="--manifest eval/cache/manifest-swin_food101_int8.json --root eval/cache --limit 30"
```

`convert_classifier.py` (HF -> ONNX) existe pero **no se usa**: el exportador infla el grafo
(~255 MB para un EfficientNet-B0 de 19 MB de pesos).

## Primer barrido (2026-10-12)

- **Detector**: YOLO11n COCO (ONNX, 10.7 MB, AGPL-3.0) — funciona, salida `[1,84,8400]`.
- **Clasificador**: Swin Food-101 int8 (ONNX, 93 MB, Apache-2.0).
- **30 platos** con cenital: **MAE carbohidratos 17.25 g (86.7 %)**, IC95 [10.14, 25.42];
  MAE masa 186.5 g; **cobertura 27.8 %** (coincide con el 24 % de solape Food-101↔mapa).

Hallazgos:

- `AlexKoff88/mobilenet_v2_food101` (ONNX "listo") esta **muerto**: logits ~1e-9 con imagen real.
- `onnx-community/swin...q4f16` **no corre** en ORT CPU (fallo de canales en Conv); int8 y fp16 si.
- La conversion HF->ONNX infla el grafo; **falta un clasificador pequeno (<25 MB) fiable**.

Conclusion provisional: sin un clasificador alineado al catalogo, la **cobertura** (~28 %) y el
error de porcion mandan; es la senal para el **fine-tuning (D32)** o para un detector de comida
mejor. Pendiente: clasificador pequeno fiable y barrido completo (`--limit 0`).

### Segundo candidato: MobileNetV3-Large ImageNet

`tools/shortlist/export_torchvision.py` exporta backbones de torchvision (exportador **fiable**,
a diferencia del de transformers):

- **MobileNetV3-Large ImageNet int8**: **5.7 MB** (fp32 21.9 MB). 30 platos: **MAE 18.04 g
  (90.7 %)**, cobertura **11.1 %** (solape ImageNet↔mapa: 18 clases).
- Comparado con Swin Food-101 int8 (93 MB): MAE 17.25 g, cobertura 27.8 %. Food-101 alinea algo
  mejor que ImageNet, pero ninguno se acerca al catalogo.

Conclusion: la via fiable y pequena es **torchvision**; para alinear con el catalogo hay que
**entrenar/afinar** (o destilar), no basta un clasificador publico.
