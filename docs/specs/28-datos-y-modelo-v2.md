# SPEC 28 - Datos y modelo v2: como subir el techo

> [!abstract] TL;DR
> El techo del reconocimiento es **cobertura y calidad de datos**, no la arquitectura: hoy el
> clasificador es un MobileNetV3-Large con **backbone congelado + cabeza lineal** destilado de CLIP
> base, sobre un `data/images` solo de Wikimedia y ruidoso. Ligera y por orden de retorno: **F0** un
> hold-out **no filtrado** (hoy la eval se mide sobre las mismas imagenes del entrenamiento); **F1**
> mas datos y mas limpios (multi-fuente + active learning + el flywheel de contribuciones CC0); **F2**
> un teacher mejor (SigLIP2 / MobileCLIP2 + ensayo de prompts); **F3** descongelar el backbone, con
> puerta por volumen de datos; **F4** multi-item/platos. Nada de esto cambia el contrato: el modelo
> solo produce **clase + confianza**, nunca gramos ni unidades. Entrenar en **GPU** (el CPU local es
> insuficiente: medido). Decisiones candidatas D75-D79 (propuestas).

## Objetivo y criterio de exito

1. **Medir de verdad**: subir `top-1`/`top-3` de identificacion **y** cobertura sobre un hold-out
   **disjunto** del entrenamiento, **sin** empeorar el MAE de carbohidratos ([`05`](05-benchmark.md)).
2. **Datos suficientes**: llegar a **≥ 30-50 imagenes por clase confirmadas** ([`08`](08-linear-probe.md))
   en las clases del catalogo; hoy **58 de 190 clases tienen < 8** ([`docs/catalogo.md`](../catalogo.md)).

## Mecanica actual y sus limites

- **Modelo**: `training/distill_clip.py` — backbone congelado + cabeza lineal, teacher CLIP; export
  ONNX int8 ([`03`](03-despliegue.md), D24). Anadir clases sin regresion ya se puede con la
  **extension de cabeza** (`--init`, ver [`21`](21-expansion-catalogo.md)).
- **Eval filtrada**: el split de test de Nutrition5k (`eval/cache/images`, 507) es el **mismo** que se
  uso para entrenar al modelo publicado → las cifras actuales estan infladas.
- **Fuente unica**: `tools/data/fetch_images.py` solo consulta Wikimedia Commons; etiquetas sin
  confirmar (`data/proposed`) y ~72 % marcado para revision.

## Fases

### F0 - Puerto de medicion honesta (bloqueante)

- Construir un hold-out **disjunto**: split **oficial de test** de Nutrition5k + un **set español
  propio** (curado a mano o teacher-propuesto y revisado) + un corte retenido de `data/confirmed`.
- Metricas **por clase**: `top-1`/`top-3`, cobertura, matriz de confusion y MAE-carb; un **panel de
  huecos** (clases con pocas imagenes o peor recall).
- Es el **gate de publicacion**: no se publica un peso nuevo sin él (como en `weights-0.4.0`).

### F1 - Mas datos, y mas limpios

- **Multi-fuente** en `fetch_images.py` detras del mismo contrato ImageFolder: Open Food Facts
  (CC-BY-SA, atado al modulo de codigo de barras), Open Images, iNaturalist, y **recortes de
  ingrediente de Nutrition5k** (trae gramos y mascaras por ingrediente → etiquetas de region).
- **Active learning**: el teacher pseudo-etiqueta un corpus grande sin etiquetar (Food-2K y similares);
  a revision humana solo lo de **baja confianza / discrepancia**. Revision por **regiones**
  (`make data-label`, [`12`](12-feedback.md)).
- **Flywheel de contribuciones** ([`15`](15-subida-contribuciones.md), D38/D39): activar el export
  **opt-in CC0** en la app + receptor R2 (`workers/contrib`) → fotos reales en dominio, etiquetadas
  por la correccion del usuario. Es el dato de mas valor y ya esta construido casi entero.
- **Balanceo**: tope por clase y sobremuestreo de la cola larga.

### F2 - Teacher mejor

- Cambiar CLIP base por **SigLIP 2** o **MobileCLIP2** (o CLIP ViT-L/14, ya en cache) + **ensayo de
  prompts** y sinonimos en/es por clase. Es el salto mas barato: la destilacion no supera a su teacher.

### F3 - Modelo (con puerta por datos)

- **Descongelar el backbone** (`--train-backbone`) o linear probe sobre un backbone mejor
  (EfficientNet-B0/V2, ConvNeXt-T) con aumento, label smoothing y muestreo balanceado — solo cuando
  F1 haya madurado (SPEC [`07`](07-finetuning.md) opcion 2/5).
- **Calibracion/unknown**: temperature scaling, umbral de rechazo y ajuste de logits para la cola.
- **QAT** para que int8 deje de costar precision.

### F4 - Multi-item y platos ([`20`](20-platos-cocinados.md))

- Primero **C2** (descomposicion por top-k, sin modelos nuevos); la causa raiz es multi-etiqueta /
  segmentacion (FoodSeg103 + SegFormer), y un **detector de comida** en vez del COCO actual
  ([`18`](18-modelo-deteccion.md)).

## Datos y licencias

- Solo **CC0 / CC-BY / CC-BY-SA**; se registra `{source, license}` por imagen y no se redistribuyen
  tablas propiedad de nadie. Fuentes: Nutrition5k (**CC BY 4.0**), Open Food Facts (CC-BY-SA), Open
  Images, iNaturalist, Wikimedia (actual), y contribuciones **CC0** de usuarios.

## Infraestructura

- Entrenar en **GPU** (local o Colab): el encode del teacher en CPU tarda ~4x mas bajo carga y no es
  viable. El pipeline es portable (`make distill-clip`, `make train`, `make identify`).

## Riesgos

- **Hereda el sesgo del teacher** y su ruido de pseudo-etiquetas → medir con F0 y no fiarse del teacher.
- **Leakage**: cualquier set de train que toque la eval invalida las cifras (el error actual).
- **Licencias**: una fuente no comercial contamina el dataset AGPL.
- **Sobreajuste** con set pequeño; olvido catastrofico al descongelar sin datos.

## Decisiones abiertas (candidatas D75-D79, propuestas)

- Teacher por defecto: **SigLIP2 vs MobileCLIP2**.
- Umbral de datos para pasar de cabeza congelada a **fine-tune**.
- Si el **flywheel de contribuciones** se activa ya (tension con D11: "la foto nunca sale del
  dispositivo"; requiere consentimiento explicito revocable).
- Multi-etiqueta vs **segmentacion** (relacionado con SPEC [`20`](20-platos-cocinados.md)).
- Como se construye el **hold-out español** (manual vs teacher + revision).

## Reproducibilidad

```bash
# F0: hold-out y metricas por clase
make eval            # Nutrition5k (manifest de pesos real)
make identify CAND_CLASSIFIER=weights/classifier.int8.onnx CAND_CLASSES=public/model-manifest.json
# F1: datos
make data-images DATA_ARGS="--all --per-class 50" && make data-review && make data-label && make data-confirm
# F2/F3: teacher + modelo
make distill-clip DISTILL_CLIP_ARGS="--model <siglip2|mobileclip2> --train-backbone"
```
