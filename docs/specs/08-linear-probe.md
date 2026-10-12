# SPEC 08 - Cabeza nueva (linear probe)

> [!abstract] TL;DR
> Proceso por defecto de fine-tuning (D32): se **congela un backbone preentrenado** y se entrena
> **solo la capa final** con las clases del catalogo. Se ejecuta desde la raiz con `make`
> (`train-setup`, `train`, `train-smoke`, `export-model`). Salida: `model.pt` + `classes.json` +
> `classifier.int8.onnx` + `classifier.manifest.json`. Los pesos **nunca** entran al repo.

## Cuando usarlo

- La v1 arranca con un **modelo publico + mapeo de clases** (D31): el linear probe **no** es
  requisito de la v1.
- Se usa si la shortlist (D28) queda corta o el mapeo genera demasiados "desconocido".
- Es el primer escalon de la escalera de [`07-finetuning.md`](07-finetuning.md); la destilacion
  queda fuera de la Fase 1.

## Prerequisitos

1. **Python 3.11 o 3.12** (torch tarda en publicar wheels para versiones muy nuevas).
2. **Catalogo (E1)** hecho: las clases del modelo **son** los `id` del catalogo.
3. **Imagenes etiquetadas**: la pieza que falta (set propio, D25). Sin datos no hay entrenamiento.

## Formato de datos

Estructura estilo `ImageFolder`, con el **id de catalogo** como nombre de carpeta:

```
training/data/
  tortilla/      img_0001.jpg  img_0002.jpg  ...
  paella/
  lentejas/
  ...
```

- Una carpeta por clase; el nombre **debe** ser un `id` del catalogo (E1).
- Minimo recomendado: **>= 30-50 imagenes por clase**; cuantas mas, mejor.
- El split train/val es **aleatorio y reproducible** por `--seed` (no se necesitan carpetas aparte).

## Como ejecutarlo

Todo desde la raiz del repo, con `make`:

```bash
make train-setup     # instala torch, torchvision, onnx, onnxruntime
make train-smoke     # prueba el pipeline sin datos (dry-run, sin red)
make train           # entrena sobre training/data
make export-model    # exporta a ONNX int8 + escribe el manifest
```

Variables (se pueden sobreescribir):

| Variable      | Por defecto     | Uso                                     |
| ------------- | --------------- | --------------------------------------- |
| `TRAIN_DATA`  | `training/data` | Raiz del set de imagenes                |
| `TRAIN_OUT`   | `training/out`  | Salida (modelo, clases, onnx, manifest) |
| `TRAIN_ARGS`  | vacio           | Args extra a `linear_probe.py`          |
| `EXPORT_ARGS` | vacio           | Args extra a `export_onnx.py`           |

Ejemplos:

```bash
make train TRAIN_ARGS="--backbone efficientnet_b0 --epochs 20 --lr 5e-4"
make export-model EXPORT_ARGS="--version 0.2.0 --url https://cdn.jsdelivr.net/gh/foron23/carbos-weights@0.2.0/classifier.int8.onnx"
```

`train-smoke` + `export-model` sirven para verificar la cadena completa **sin datos ni red**.

## El proceso, paso a paso

1. **Backbone**: se parte de uno preentrenado (`mobilenet_v3_small` por defecto; tambien
   `mobilenet_v3_large`, `efficientnet_b0`, `resnet18`).
2. **Congelar**: `requires_grad = False` en todo el backbone.
3. **Cabeza nueva**: se reemplaza la capa final por una `Linear(in_features, num_clases)` y se
   deja entrenable.
4. **Entrenar**: Adam sobre **solo la cabeza**; `CrossEntropyLoss`; aumento ligero
   (`RandomResizedCrop`, flip) y normalizacion ImageNet.
5. **Validar**: split aleatorio por `--seed`; se imprime `val_acc` por epoch.
6. **Guardar**: `model.pt` (modelo completo) y `classes.json` (orden de clases = orden de salida).
7. **Exportar**: `torch.onnx.export` (opset 17, batch dinamico) y **cuantizacion dinamica int8**
   (`onnxruntime.quantization`).
8. **Manifest**: `classifier.manifest.json` con `version`, `url`, `sha256`, `bytes` y `classes`
   (el mismo esquema de `src/model/manifest.ts`).
9. **Publicar**: subir `classifier.int8.onnx` a **jsDelivr/GitHub Releases** (D24), nunca al repo.
10. **Conectar**: copiar los campos al `classifier` de `public/model-manifest.json`.
11. **Verificar en el dispositivo**: cargar la app, descargar pesos, comprobar que el sha256
    coincide y que la clasificacion devuelve ids del catalogo.

## Argumentos utiles

`linear_probe.py`:

| Arg            | Por defecto          | Nota                            |
| -------------- | -------------------- | ------------------------------- |
| `--backbone`   | `mobilenet_v3_small` | Ver lista arriba                |
| `--epochs`     | 10                   | Subir si la val_acc no converge |
| `--batch-size` | 32                   | Bajar si falta memoria          |
| `--lr`         | 1e-3                 | Solo afecta a la cabeza         |
| `--val-split`  | 0.2                  | Fraccion de validacion          |
| `--image-size` | 224                  | Debe coincidir con el runtime   |
| `--seed`       | 0                    | Reproducibilidad                |
| `--dry-run`    | off                  | Prueba sin datos                |

`export_onnx.py`:

| Arg             | Por defecto             | Nota                            |
| --------------- | ----------------------- | ------------------------------- |
| `--model`       | `training/out/model.pt` | Salida de `make train`          |
| `--version`     | `0.1.0`                 | Va al manifest                  |
| `--url`         | vacio                   | URL publica de los pesos        |
| `--no-quantize` | off                     | Exporta sin int8 (solo depurar) |

## Aceptacion

- `make train-smoke` termina sin error (pipeline sano) sin datos ni red.
- `make train` produce `model.pt` y `classes.json`; las clases coinciden con el catalogo.
- `make export-model` produce `classifier.int8.onnx` y un manifest con sha256 y bytes correctos.
- El manifest valida contra `modelManifestSchema` (test).
- Ningun artefacto de entrenamiento entra al repo ni al bundle (`git status` limpio; `vite build` no los toca).

## Limitaciones

- **Techo medio**: el linear probe no arregla el salto de dominio; si no basta, subir a destilacion
  o fine-tune completo (`07-finetuning.md`).
- **Necesita datos**: hoy no existe el set propio (D25); el pipeline queda listo, no ejecutable aun.
- **Regla intacta**: el modelo solo produce **clase + confianza**; nunca gramos ni unidades.

## Fuera de alcance (Fase 1)

- **Destilacion** (teacher grande -> pseudo-etiquetas): siguiente paso, otra fase.
- **Fine-tune completo**: solo con set propio maduro.
