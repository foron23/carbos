# SPEC 05 - Benchmark externo (Nutrition5k)

> [!abstract] TL;DR
> En la v1 el error se mide sobre **Nutrition5k** (D25), no sobre set propio. El dataset es
> **CC BY 4.0**, publico y descargable; el arnes corre **fuera del bundle** (dev time) con
> `onnxruntime-node` o Python, calcula **MAE de carbohidratos** y **MAE de gramos** por plato, y
> una **exactitud de clasificacion** sobre las clases del catalogo. Nada del dataset viaja al
> repo ni al artefacto.

## Acceso (verificado 2026-10-12)

| Canal                | Enlace                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------ |
| Repo oficial         | `https://github.com/google-research-datasets/Nutrition5k` (archivado 2026-04-19, solo lectura)               |
| Bucket GCS (publico) | `gs://nutrition5k_dataset` · consola: `https://console.cloud.google.com/storage/browser/nutrition5k_dataset` |
| Descarga directa     | `https://storage.cloud.google.com/nutrition5k_dataset/nutrition5k_dataset.tar.gz` (**181.4 GB**)             |
| gsutil por trozos    | `gsutil -m cp -r "gs://nutrition5k_dataset/nutrition5k_dataset/{RUTA}" .`                                    |
| Mirror ligero (HF)   | `https://huggingface.co/datasets/ai5labsOfficial/nutrition5k` (overhead RGB + etiquetas)                     |
| Mirror Kaggle        | `https://www.kaggle.com/datasets/siddhantrout/nutrition5k-dataset`                                           |

**Licencia**: Creative Commons **CC BY 4.0** (compartir y adaptar, incluso comercial). Compatible
con empaquetar derivados; el dataset **no** se empaqueta, solo el resultado agregado.

**Contenido** (~5.006 platos, cafeteria de Google en California):

- Overhead RGB-D por plato (`imagery/realsense_overhead/`).
- Videos en angulo (4 por plato) y frames.
- `metadata/dish_metadata_cafe{1,2}.csv`: por plato, `total_calories, total_mass, total_fat,
total_carb, total_protein, num_ingrs` + por ingrediente `grams, calories, fat, carb, protein`.
- `metadata/ingredient_metadata.csv`: ingredientes con nutricion **por gramo** (fuente USDA FND).
- `dish_ids/splits/`: split **oficial train/test** (los escaneos incrementales se mantienen juntos).
- `scripts/compute_eval_statistics.py`: calcula MAE y %MAE de un CSV de predicciones.

## Que medimos (dos niveles)

1. **Nivel plato (end-to-end)**: de la imagen overhead a **carbohidratos totales** del plato.
   Ground truth `total_carb`. Es la cifra comparable con el paper.
2. **Nivel componente**: sobre cada ingrediente (region): **clase** (top-1/top-5 contra el mapa de
   clases del catalogo, E2) y **gramos** (porcion estimada vs `ingr_N_grams`). Mide donde falla:
   deteccion, clasificacion o porcion.

## Metricas

| Metrica                 | Definicion                                                      | Para que                        |
| ----------------------- | --------------------------------------------------------------- | ------------------------------- |
| **MAE carb (g)**        | media de `abs(pred_carb - true_carb)`                           | cifra publica (E14)             |
| **%MAE carb**           | `MAE / media(true_carb)`                                        | comparable entre platos/tamano  |
| **MAE porcion (g)**     | media de `abs(pred_grams - true_grams)` sobre items emparejados | aisla el error de porcion       |
| **Top-1 / Top-5 clase** | exactitud sobre items con clase en el catalogo                  | mide el clasificador            |
| **Cobertura**           | fraccion de items mapeables al catalogo                         | honestidad del conjunto cerrado |

Regla: **se declara la incertidumbre**, no un unico numero. Un plato sin item mapeable cuenta
como cobertura, no como acierto.

## Arnes (dev time, fuera del bundle)

- **No** se importa en `src/` de la app; vive en `eval/` y corre en Node (`onnxruntime-node`) o
  Python. El navegador nunca carga Nutrition5k.
- **Entrada minima**: descargar solo `metadata/*.csv` + `dish_ids/splits/*` (KB) y, para imagen,
  usar el **mirror HF** (overhead RGB) en vez del tarball de 181 GB.
- **Pipeline**: leer split de test -> por plato, cargar overhead RGB -> preprocesar (igual que el
  runtime) -> detector + clasificador -> emparejar items con ground truth -> agregar metricas.
- **Emparejamiento de items**: greedy por IoU/similitud de nombre; los no emparejados penalizan.
- **Salida**: `eval/results/nutrition5k-<fecha>.json` + tabla en README. Formato estable para
  comparar entre versiones de modelo.
- **Target**: `make eval` (anadido en la O6).

## Sesgos y honestidad

- El dataset es de **cafeterias de California**; no cubre cocina espanola. El numero es
  **comparable**, no representativo del usuario objetivo. Se declara junto a la cifra (E14).
- El ground truth de carbohidratos viene de **USDA FND**, no de BEDCA: util como vara externa,
  distinto del catalogo.
- Nutrition5k **no trae clases cerradas**: los nombres de ingrediente son texto libre. El mapeo al
  catalogo es una pieza del arnes, no del dataset.

## Aceptacion (E13)

- `make eval` reproduce el numero del README sobre el split oficial de test.
- El JSON de resultados incluye version de modelo, fecha, numero de platos y cobertura.
- Ninguna dependencia del dataset en el build de la app (`vite build` no lo toca).
