# Carbos

Contador de carbohidratos **on-device**. PWA estatica, sin backend, sin cuentas y
sin analitica: la foto estima, tu confirmas y ajustas, la app registra. Nada sale
de tu dispositivo.

> Cuenta carbohidratos. En tu dispositivo, y solo en tu dispositivo.

- Diseno y decisiones: [`docs/decisiones.md`](docs/decisiones.md)
- Plan por fases: [`docs/specs/01-roadmap.md`](docs/specs/01-roadmap.md)
- Fase 1 (nucleo): [`docs/specs/02-fase1.md`](docs/specs/02-fase1.md)
- Despliegue (GitHub Pages): [`docs/specs/03-despliegue.md`](docs/specs/03-despliegue.md)
- Interfaz y accesibilidad (UX): [`docs/specs/09-ui-ux.md`](docs/specs/09-ui-ux.md)
- Experimento (benchmark): [`docs/specs/10-experimento.md`](docs/specs/10-experimento.md)
- Comparacion de modelos (writeup): [`docs/specs/11-comparacion-modelos.md`](docs/specs/11-comparacion-modelos.md)
- Feedback de usuarios (diferido): [`docs/specs/12-feedback.md`](docs/specs/12-feedback.md)
- Atajos de correccion y lectura del dia: [`docs/specs/13-atajos-y-dia.md`](docs/specs/13-atajos-y-dia.md)
- Chat on-device (v1.1): [`docs/specs/14-chat.md`](docs/specs/14-chat.md)
- Subida de contribuciones desde la app: [`docs/specs/15-subida-contribuciones.md`](docs/specs/15-subida-contribuciones.md)
- Escaneo de productos por código de barras: [`docs/specs/17-escaneo-codigo-barras.md`](docs/specs/17-escaneo-codigo-barras.md)
- Contrato de trabajo: [`docs/receta-de-codigo.md`](docs/receta-de-codigo.md)

## Estado

Fase 1 (nucleo) en marcha. Ya estan: **catalogo curado** (154 alimentos, generado desde Ciqual
2020 con `make catalog`), diario con totales por dia/semana y **linea temporal del dia** que mezcla
comidas e insulina, registro de insulina, **captura de foto on-device**, export JSON y **export
cifrado** (Argon2id + AES-GCM), **ES/EN**, PWA offline e instalable y migracion de esquema. Ya estan
los **atajos de correccion y la lectura del dia** (SPEC 13/D33-D37: mitad/doble/cambiar/quitar sin
teclear, porciones tipicas, la comida gana **hora** y pierde la franja, y barras de la semana). Ya
esta el **runtime de inferencia** (ONNX en Web
Worker, WebGPU con fallback WASM, descarga diferida con sha256 y cache) y el **banco de medida**
sobre Nutrition5k (`make eval`). El modelo elegido (D28) es **YOLO11n COCO + MobileNetV3-Large
ImageNet int8**; los pesos viven en `weights/` (5.7 MB + 10.7 MB) y se publican desde este mismo
repo por jsDelivr (`weights-0.1.0`, D24), con el manifest en `public/model-manifest.json`. Para
probar el flujo de foto en local sin red: `make smoke-models`.

**Benchmark (Nutrition5k, 507 platos, 2026-10-12):** el mejor candidato es **MobileNetV3-Large
ImageNet int8** (5.7 MB; etiquetas ImageNet normalizadas y mapeadas al catalogo, D31): **MAE
15.19 g, cobertura 34.1 %** (IC95 [14.10, 16.27]). Ningun modelo publico se acerca al catalogo: el
siguiente paso es **fine-tuning al catalogo** o **destilacion** (D32). Aviso: Nutrition5k son
cafeterias de California, asi que la cifra es **comparable**, no representativa de cocina espanola;
el set propio pesado sigue como **deuda declarada** (D25). Detalle en
[`docs/specs/11-comparacion-modelos.md`](docs/specs/11-comparacion-modelos.md).

**v1.1 (Fase 3, chat on-device):** diseno en [`docs/specs/14-chat.md`](docs/specs/14-chat.md) e
implementada la **fundacion**: esquema cerrado de intenciones con Zod validado antes de ejecutar,
tarjeta de confirmacion (**propone, no ejecuta**), carga diferida con degradacion (iPhone incluido)
y frontera regulatoria que impide que el chat entre en el camino del calculo. El chat es **opt-in**
y sigue **oculto** hasta publicar los pesos y `public/chat-manifest.json`; la precision de
intenciones queda como **gate con pesos** (D8/D12).

Detalle por entregable: [`docs/specs/02-fase1.md`](docs/specs/02-fase1.md).

## Arranque

```bash
make setup    # npm install
make dev      # servidor de desarrollo
make check    # format + lint + tests
```

## Licencia

AGPL-3.0-or-later. Ver [`LICENSE`](LICENSE).
