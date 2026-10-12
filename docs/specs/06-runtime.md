# SPEC 06 - Runtime de inferencia

> [!abstract] TL;DR
> `onnxruntime-web` (D22) en un **Web Worker**, WebGPU con fallback WASM. Pipeline:
> captura -> detector (**cajas**, D27) -> recorte por region -> clasificador -> top-k -> mapa de
> clases (E2). Los pesos llegan por **manifest con sha256** desde jsDelivr/Releases (D24) y se
> cachean. El runtime **nunca produce gramos ni unidades**: solo clase y confianza.

## Arquitectura

```
UI (main)  ──postMessage──►  Worker de inferencia
                              ├─ loader: manifest + sha256 + Cache Storage
                              ├─ session: onnxruntime-web (WebGPU | WASM)
                              ├─ detector: decode + NMS -> cajas
                              ├─ classifier: crops -> softmax -> top-k
                              └─ classmap: clase -> id del catalogo (E2)
UI  ◄──resultado────────────  [{ classId, p, box }, ...]
```

El worker aísla el hilo de UI: el frame no se congela durante la inferencia.

## Deteccion (D27)

- Salida tipo YOLO agnostica de framework: `boxes[x,y,w,h]`, `scores`, `class`.
- **NMS** (IoU configurable) para eliminar solapes.
- Umbral de confianza para descartar regiones; el usuario puede anadir/borrar items a mano.
- Entrada: imagen reescalada con **letterbox** (mantiene aspect ratio) a la resolucion del modelo.

## Clasificacion

- Recorte de cada caja (con algo de margen), redimensionado a la entrada del clasificador.
- Softmax -> **top-k** con probabilidades.
- `class-for-id` via el **mapa de clases** (E2): si la clase del modelo no esta en el catalogo,
  cae a "desconocido" y el usuario elige del catalogo (busqueda + sinonimos).

## Pre/post-proceso (compartido con el benchmark)

- Mismo codigo de normalizacion (media/desviacion, orden de canales, tipo de tensor) entre el
  runtime y `eval/` para que el numero medido corresponda a lo que corre el usuario.
- Manejo de **orientacion EXIF** antes de preprocesar.
- Descarte de imagenes enormes: reescalado en canvas antes de enviar al worker.

## Carga y cache de pesos (D24)

- `public/model-manifest.json` con `detector` y `classifier` (url, sha256, bytes, classes).
- Descarga **diferida** con **progreso y tamano** visibles; `crypto.subtle.digest('SHA-256')`
  verifica antes de usar.
- Cache en **Cache Storage** `carbos-models-vN`; segunda carga sin red.
- El **service worker no precachea** los pesos (solo el app shell, ver `03-despliegue.md`).
- Version del manifest permite invalidar y pedir pesos nuevos sin tocar el codigo.

## Capacidades y degradacion

- Deteccion de **WebGPU** (`navigator.gpu`): si existe, EP `webgpu`; si no, `wasm` (SIMD, threads).
- Si el dispositivo no aguanta (memoria/tiempo), se ofrece **entrada manual** del catalogo y el
  flujo sigue funcionando: la inferencia es una comodidad, no un requisito.
- `ort.env` configurado en el worker; hilos y proxy segun entorno.

## Presupuesto de bundle

- `onnxruntime-web` entra por **import dinamico** dentro del worker: no engorda el bundle inicial.
- La UI muestra "preparando el modelo" mientras carga; sin modelo, el registro manual funciona.

## Contrato con el dominio (reglas de Fase 1)

- El modelo devuelve **clase + confianza + caja**. Nunca gramos ni unidades.
- La porcion sale de la **porcion por defecto del catalogo** mas el **ajuste del usuario** (E6).
- Ningun camino de la inferencia a una dosis sin confirmacion explicita de los gramos.

## Estructura propuesta

```
src/model/
  manifest.ts     hecho: esquema del manifest
  loader.ts       descarga + sha256 + Cache Storage + progreso
  preprocess.ts   letterbox / normalizacion (compartido con eval/)
  detector.ts     decode + NMS
  classifier.ts   crops + softmax + top-k
  classmap.ts     (en src/catalog) clase -> id
  worker.ts       protocolo de mensajes UI <-> inferencia
  index.ts
```

## Aceptacion (E4)

- Una imagen de prueba detecta y clasifica en **WebGPU** y en **WASM**.
- Los pesos se cachean: la segunda carga funciona **sin red**.
- El sha256 descargado coincide con el manifest; un hash incorrecto aborta con aviso.
- `vite build` no incluye ORT en el chunk inicial.
