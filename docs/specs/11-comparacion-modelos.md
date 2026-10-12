# SPEC 11 - Writeup: comparacion de modelos (D28)

> [!abstract] TL;DR
> Comparacion de clasificadores publicos y uno propio (fine-tuned) con el **mismo detector**
> (YOLO11n COCO) sobre el **split de test de Nutrition5k** (507 platos con cenital). Gana un
> **clasificador general pequeno** (MobileNetV3-Large ImageNet int8, 5.7 MB): MAE 15.63 g y
> cobertura 28.4 %. Ninguno se acerca al catalogo: la **cobertura** es el cuello de botella y
> apunta al fine-tuning al catalogo o a la destilacion.

Mecanica del banco en [`05-benchmark.md`](05-benchmark.md); diseno en
[`10-experimento.md`](10-experimento.md).

## Metodologia

- **Benchmark**: Nutrition5k, split oficial de test (`rgb_test_ids`), imagen cenital.
- **Detector fijo**: YOLO11n COCO exportado a ONNX (10.7 MB, AGPL-3.0), salida `[1,84,8400]`.
- **Clasificador**: varia por candidato; se recorta cada caja y se clasifica (top-k).
- **Estimacion**: la v1 **no** predice gramos; `carb_plato = sum(porcion_por_defecto(clase) *
carb/100 g)`. El error mide, sobre todo, clasificacion + porciones por defecto.
- **Metricas**: MAE de carbohidratos (g) + IC95 bootstrap, %MAE, MAE masa, **cobertura** (% de
  detecciones mapeables al catalogo).
- **Evaluados**: **507 platos** (202 de 709 no tienen imagen cenital; se saltan).

## Resultados (507 platos)

| Candidato                                  | Tamano     | MAE carb    | %MAE    | IC95           | MAE masa | Cobertura  |
| ------------------------------------------ | ---------- | ----------- | ------- | -------------- | -------- | ---------- |
| **MobileNetV3-Large ImageNet int8**        | **5.7 MB** | **15.63 g** | 79.4 %  | [14.31, 16.73] | 154.6 g  | **28.4 %** |
| Swin Food-101 int8                         | 93 MB      | 22.63 g     | 115.0 % | [20.69, 25.49] | 172.6 g  | 25.5 %     |
| MobileNetV3-Large Food-101 subset (propio) | 3.2 MB     | 28.40 g     | 144.3 % | [25.85, 30.86] | 167.7 g  | 17.1 %     |

## Fichas de los candidatos

| Modelo                          | Origen / licencia          | Clases        | Tamano  | Notas                                           |
| ------------------------------- | -------------------------- | ------------- | ------- | ----------------------------------------------- |
| YOLO11n COCO (detector)         | Ultralytics, AGPL-3.0      | 80 COCO       | 10.7 MB | export propio; general, subconjunto comida      |
| MobileNetV3-Large ImageNet int8 | torchvision, BSD-3         | 1000 ImageNet | 5.7 MB  | export fiable; ~18 clases de comida solapan     |
| Swin Food-101 int8              | onnx-community, Apache-2.0 | 101 Food-101  | 93 MB   | ~95 % top-1; grande; q4f16 no corre en ORT CPU  |
| MobileNetV3 Food-101 subset     | propio (linear probe)      | 34 Food-101   | 3.2 MB  | top-1 74.4 %; valida el pipeline de `training/` |

Descartados: `AlexKoff88/mobilenet_v2_food101` (ONNX muerto, logits ~1e-9);
`paolopertino/mobilenet-finetuned-food101` (solo 7 clases); conversion HF transformers -> ONNX
(infla el grafo a ~255 MB para un EfficientNet-B0 de 19 MB).

## Analisis

- **Gana el general pequeno**: el catalogo es de **ingredientes** (fruta, verdura, pan, arroz),
  e ImageNet cubre fruta/verdura mejor que Food-101, que es de **platos** (pizza, paella...).
  Tener mas clases de platos no ayuda a un catalogo de ingredientes.
- **El tamano no es lo que decide**: Swin (93 MB) queda peor que MobileNetV3 (5.7 MB) en MAE y
  cobertura; mas capacidad no compensa una taxonomia desalineada.
- **El fine-tuned propio** valida el pipeline (entrenar -> exportar -> benchmark) pero solo conoce
  34 clases, asi que su cobertura cae. Con las 101 clases y datos alineados al catalogo subiria.
- **La cobertura manda**: ~28 % significa que ~7 de cada 10 items caen en "desconocido" y aportan
  0 g; el MAE lo refleja. No es un problema de precision del clasificador, es de **taxonomia**.

## Reproducibilidad

```bash
# modelos (pesos en eval/cache, gitignored)
python3 tools/shortlist/fetch_classifiers.py
tools/shortlist/.venv/bin/python tools/shortlist/export_yolo11n.py
tools/shortlist/.venv/bin/python tools/shortlist/export_torchvision.py --arch mobilenet_v3_large --name mobilenet_v3_large_imagenet
tools/shortlist/.venv/bin/python training/finetune_food101.py --data eval/cache/food101
python3 tools/shortlist/build_manifests.py

# barrido completo (cache de imagenes + concurrencia)
make eval EVAL_ARGS="--manifest eval/cache/manifest-mobilenet_v3_large_imagenet.json --root eval/cache --limit 0 --concurrency 6"
```

Resultados en `eval/results/nutrition5k-<candidato>-<fecha>.json` (gitignored).

## Conclusiones

1. **Para la v1**: MobileNetV3-Large ImageNet int8 (5.7 MB) es el mejor baseline: pequeno, fiable
   y con el mejor MAE/cobertura de la shortlist.
2. **Para subir de verdad**: hay que **alinear con el catalogo** — fine-tuning al catalogo (necesita
   datos, ver [`12-feedback.md`](12-feedback.md)) o **destilacion** del teacher sobre imagenes sin
   etiquetar.
3. **Honestidad**: el numero es **comparable**, no representativo (Nutrition5k es de California);
   se publica con ese aviso y con la deuda del set propio (D25).
