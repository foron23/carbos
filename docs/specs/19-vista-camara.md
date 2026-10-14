# SPEC 19 - Vista de camara unificada (deteccion en vivo + escaner)

> [!abstract] TL;DR
> Hoy hay **dos camaras distintas** que no comparten nada: la **foto** usa un `<input
type=file capture>` que abre la camara **del sistema** (una sola foto, sin visor en la
> app), y el **codigo de barras** abre su propio `getUserMedia` con visor, bucle y feedback
> (`src/barcode/scanner.ts` + `#barcode-viewer`). Esta spec propone **una sola superficie de
> camara** (`CameraSurface`, modulo `src/camera/`) que: (a) pide el permiso **una vez**, (b)
> muestra el visor con overlay/reticle y **estados compartidos**, (c) en **modo codigo**
> corre el bucle de decodificacion ya existente, y (d) en **modo comida** hace
> **previsualizacion en vivo + captura de un fotograma limpio** que entra al pipeline de
> deteccion actual (worker YOLO+clasificador). Todo sigue **en el dispositivo** (sin red nueva)
> y con **fallback a foto de archivo**. El objetivo es de **interaccion**: que el usuario vea
> que "lo esta haciendo bien" y que enhance encuadre/orientacion, no rehacer el modelo (eso es
> SPEC 18).

Nace de la observacion de uso ("el escaner no da feedback / no es preciso") y de SPEC 18
(el cuello es la **localizacion/caja limpia**, no el visor): la vista de camara debe ayudar a
encuadrar **un plato** y confirmar la deteccion, sin inventar inferencia continua que dispare
detecciones multiples. Feedback del escaner ya aplicado: ver SPEC 17, "Feedback del escaneo".

## Contexto

- **Foto (deteccion)**: `#photo-panel` (`src/main.ts:281-305`) con dos `<input type=file>`:
  `#camera-input` (`capture="environment"`) y `#file-input` (`src/main.ts:288-289`). Al elegir
  fichero, `onFile` (`src/main.ts:1296-1316`) llama a `prepareImage` (`src/capture/image.ts`,
  `maxEdge 1024`) y luego `startDetection` (`src/main.ts:907-965`), que delega en el worker
  (`getDetectionClient`, `src/main.ts:175`; `src/model/client.ts`; `src/model/worker.ts`:
  detector 640 → recorte +10 % → clasificador 224 → top-3 → catalogo). Los pesos se cargan del
  manifest (`MODEL_MANIFEST_URL`, `MODEL_CACHE`, `src/main.ts:149-150`) verificado por sha256.
- **Codigo de barras**: modulo `src/barcode/` con su propia captura: boton **Escanear** →
  `startLiveScan` (`src/barcode/scanner.ts:28-100`): `getUserMedia({ facingMode:'environment' })`,
  `<video id="barcode-video" playsinline muted>`, bucle `setInterval` con `decodeFrame`
  (`src/barcode/decode.ts`: `BarcodeDetector` nativo + `quagga2` diferido), sin solapar
  fotogramas y con lado mayor **800** px. El visor, el reticle y los estados viven en
  `src/barcode/ui.ts` (`#barcode-viewer`) + `src/style.css`.
- **Problema de interaccion**: la camara del sistema (foto) no da visor ni guia dentro de la
  app; el escaner si, pero **duplica** `getUserMedia`, permisos, estado de camara y ciclo de
  vida. Dos implementaciones divergen (calidad de fotograma, facing mode, torch, parada al
  ocultar la pestana).
- **Restriccion de modelo (SPEC 18)**: la deteccion sufre con **varias cajas** por plato; la via
  de valor es **una caja limpia** ("un plato"). La vista de camara debe **ayudar a encuadrar**,
  no multiplicar detecciones.
- **Privacidad (D11)**: "nada sale de tu dispositivo". La camara no cambia esto: los
  fotogramas se procesan en local; no hay red nueva (los pesos ya se descargan una vez).

## Alcance

**Entra**: una superficie de camara reutilizable (permiso, visor, overlay, lifecycle,
facingMode, torch opcional, parada al ocultar); **migracion del escaner** a esa superficie sin
cambio funcional; **modo comida en vivo**: previsualizacion + **captura de un fotograma**
limpio → pipeline de deteccion existente; estados/feedback compartidos; fallback a foto de
archivo; i18n ES/EN; tests y hooks E2E.

**No entra**: cambiar el modelo, el detector, el clasificador ni la agregacion de porcion
(SPEC 18); inferencia por fotograma que escriba en el borrador sola; subir fotogramas a la red;
grabacion de video; galeria/historial de capturas.

## Diseno

### 1. Componente `CameraSurface` (modulo `src/camera/`)

Un control montable (patron host/modulo, D7: `insulin-host`/`chat-host`/`barcode-host`) que
encapsula **toda** la camara:

| Pieza             | Contrato                                                                                                              |
| ----------------- | --------------------------------------------------------------------------------------------------------------------- |
| `start()`         | Pide `getUserMedia` (con `facingMode`) en gesto de usuario; resuelve a `'ready'` o a un error tipado                  |
| `stop()`          | Para **todas** las pistas (`track.stop()`), limpia `srcObject` y el intervalo; idempotente                            |
| `capture()`       | Devuelve un `ImageBitmapSource`/canvas del fotograma actual (para foto o para `decodeFrame`), a una resolucion pedida |
| `states`          | `idle` → `requesting` → `ready` → `error` (`denied`/`unsupported`/`unavailable`); notifica por callback               |
| `setFacingMode()` | Cambia frontal/trasera reabriendo el stream (best-effort)                                                             |
| `torch(on)`       | `track.applyConstraints({ advanced: [{ torch }] })` si el dispositivo lo expone; inerte si no                         |
| overlay           | Un `<div>` reservado sobre el `<video>` donde el consumidor pinta reticle/estados                                     |

- **Una sola peticion de permiso por modo**: el usuario concede la camara al entrar al modo; no
  se pide dos veces ni se deja encendida al salir.
- **Lifecycle ligado al modo**: `stop()` al ocultar el panel o de la pestana
  (`document.visibilityState === 'hidden'`); `start()` solo en modo activo.
- **Modular (D7)**: extraer `CameraSurface` debe permitir **borrar** un modo sin tocar el otro;
  el modulo no conoce ni el catalogo ni el modelo.

### 2. Dos consumidores, un visor

- **Modo codigo** (`src/barcode/`): reutiliza el bucle actual. `startLiveScan` pasa a usar
  `CameraSurface.capture()` en vez de crear su propio `getUserMedia`/`<video>`; el resto
  (`decodeFrame`, `resolveBarcode`, feedback) no cambia. **Sin regresion funcional**.
- **Modo comida** (`src/main.ts`, panel Foto): el `<input capture>` actual se **sustituye** por
  la superficie en vivo con un boton **Capturar** (mas "Elegir archivo" como fallback). Al
  capturar, se construye un `CapturedImage` (dataUrl + width/height, ver `src/capture/image.ts`)
  y se llama al `startDetection` existente. **No** hay inferencia continua que escriba en el
  borrador: la previsualizacion puede mostrar, como mucho, un **aviso de encuadre** ("centra el
  plato"), no resultados.
- El **segmented control** actual (Foto | Buscar | Codigo, `src/main.ts:271-280`) se mantiene;
  Foto y Codigo comparten ahora la misma superficie subyacente.

### 3. Estados y feedback (compartido)

Una maquina de estados unica, con la guia/estados que ya introdujo el escaner, reutilizada:

- `requesting`: "Pide permiso de camara".
- `ready` (encuadre): guia ("Apunta al codigo" / "Centra el plato") + reticle animado.
- `working`: indicador de actividad ("Leyendo el codigo…" / "Reconociendo…", fases del worker).
- `success`: confirmacion con dato ("Anadido: <producto>" / "N alimentos detectados").
- `error`: causa accionable (permiso denegado → escribir a mano/foto; sin camara → archivo).

Contrato con `main.ts`/`ui.ts`: `setStatus(host, key|text)`, `setViewState(state)`,
`setBusy(bool)` — los mismos helpers que `src/barcode/ui.ts` usa hoy.

### 4. Permisos y capacidades

- Pedir en gesto del usuario; estados `denied`/`unsupported` cubiertos (Firefox/iOS sin
  `BarcodeDetector`, sin `getUserMedia`).
- `facingMode` por defecto `'environment'`; selector frontal/trasera **opcional** (Fase C).
- `torch` **opcional** (Fase C): solo si `getCapabilities().torch`; inerte si no.
- Sin permiso de camara el flujo **nunca** queda sin salida: archivo o entrada manual.

### 5. Rendimiento

- **Codigo**: mantener el bucle actual (lado mayor ≤ 800 px, sin solapar `decodeFrame`); si se
  adopta `quagga2`, valorar su **LiveStream** (Web Workers) para quitar trabajo del hilo
  principal (pendiente heredado de SPEC 17).
- **Comida**: la vista en vivo **no** infiere por fotograma; solo dibuja el `<video>`. La
  inferencia ocurre **una vez** por captura (worker existente), asi que el coste no cambia.
- Parar captura/intervalos al ocultar; liberar canvas/video.

### 6. Integracion en el flujo de logging

- Captura de comida → `CapturedImage` → `startDetection` (sin cambios de contrato).
- La deteccion sigue empujando al **borrador** (`pushFood`/`applyDetections`) y respetando el
  reset de detecciones; SPEC 17 ya limpia detecciones al escanear y viceversa.
- Registrar/insulina sin cambios.

### 7. Accesibilidad y privacidad

- El `<video>` es decorativo (`aria-hidden`); los estados van por `aria-live="polite"` (como
  `#photo-status`/`#barcode-status`).
- El reticle lleva texto asociado (no solo color); respeta `prefers-reduced-motion`
  (animaciones off) como el resto del proyecto.
- Sin red nueva; atribucion ODbL vigente para datos de pack; sin EXIF (ya garantizado en
  captura/contrib, SPEC 12/15).

## Modulos y cambios

| Fichero                       | Cambio                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------- |
| `src/camera/index.ts`         | Barrel + `CameraSurface` (getUserMedia, video, overlay, estados, capture, torch/facingMode) |
| `src/camera/types.ts`         | `CameraState`, `CameraError`, `CaptureOptions`                                              |
| `src/barcode/scanner.ts`      | Usar `CameraSurface.capture()` en el bucle; borrar su `getUserMedia`/`<video>` propios      |
| `src/barcode/ui.ts`           | Montar el visor/reticle sobre el overlay de `CameraSurface`; mismos ids E2E                 |
| `src/main.ts`                 | Panel Foto: superficie en vivo + boton **Capturar** (+ archivo); `onFile`→`onCapture`       |
| `src/capture/image.ts`        | `prepareFromSource(source, maxEdge)` (reutilizar el recorte que hoy hace `prepareImage`)    |
| `src/style.css`               | `.camera-viewer`/reticle compartidos (mover lo de `#barcode-viewer` a clase comun)          |
| `src/i18n/index.ts`           | Keys nuevas ES/EN (permiso, encuadre de plato, capturar, overlay)                           |
| `e2e/scenarios.mjs` / helpers | Stub de camara para Firefox (`__carbosCameraStub`), encuadre y captura                      |

## Criterios de aceptacion

1. En **Codigo**, el escaneo funciona **igual que hoy** (mismos estados y resultado) usando
   `CameraSurface`; sin peticiones de red nuevas con la resolucion en linea apagada.
2. En **Foto**, hay **visor en vivo** con guia de encuadre y boton **Capturar**; al capturar,
   la deteccion corre **una vez** por captura y empuja al borrador como hoy.
3. **Un solo permiso** de camara por modo; al salir del modo/pestana la camara **se apaga**
   (pistas detenidas) y se reanuda al volver.
4. Sin camara o permiso denegado, ambos modos caen a **archivo/manual** con mensaje accionable.
5. **Fallback "Elegir archivo"** sigue disponible en Foto.
6. El visor y los estados son **accesibles** (aria-live, reticle con texto, reduced-motion).
7. i18n ES/EN con paridad y guardas verdes; **sin red nueva**; `make verify-bundle` no se rompe.
8. `make check` verde; `make e2e` sin regresiones (stub de camara en Firefox).

## Tests

- **Unitarios**: `CameraSurface` con `getUserMedia`/`MediaStreamTrack` **inyectables** (estados,
  `start`/`stop` idempotente, `stop` al ocultar, `capture` a resolucion pedida, `torch`
  best-effort); `prepareFromSource` (reusa el recorte); barcode sobre `capture()` (sin tocar
  `decodeFrame`).
- **E2E** (Firefox, sin camara): `__carbosCameraStub` que simula `getUserMedia` y frames; en
  Foto, capturar → mismo flujo de deteccion (stub `__carbosDetectionStub`); en Codigo, el
  escaner sigue resolviendo (stub `__carbosBarcodeStub`); comprobar que al cambiar de modo la
  camara se detiene (sin `track.stop` pendiente).
- **Manual** (movil): encuadre de plato y de codigo; facingMode; permiso denegado.

## Fases

- **Fase A - extraer `CameraSurface` + migrar el escaner**: sin cambio funcional; paridad de
  estados y tests. Cierra el "feel" del escaner sobre una base comun.
- **Fase B - modo comida en vivo**: visor + encuadre + **Capturar** → `startDetection`;
  fallback a archivo; i18n y E2E.
- **Fase C - extras**: cambiar de camara (frontal/trasera), **torch**, y (opcional) escaneo
  **continuo** de varios codigos; valorar `quagga2` LiveStream.
- Checkpoint por fase: `make check` + `make e2e` + `make build`/`verify-bundle`.

## Referencias

- SPEC 17 (escaneo de codigo de barras; feedback ya aplicado), SPEC 18 (modelo/deteccion y el
  valor de **una caja limpia**), SPEC 16 (UI/UX v2), SPEC 12/15 (recorte sin EXIF), D7
  (modulos separables), D11 (nada sale del dispositivo), D24 (pesos fuera del bundle).
- MDN: `getUserMedia`, `MediaStreamTrack.applyConstraints`/`getCapabilities` (torch), `ImageCapture`.

## Riesgos

- **Permiso/UX**: pedir la camara en el momento equivocado molesta; mitigar con gesto explicito
  y parada al salir.
- **Soporte de torch/facingMode**: irregular por navegador; tratarlos como **best-effort**.
- **Regresion del escaner**: migrar a `CameraSurface` debe ser **transparente**; cubrir con los
  escenarios E2E existentes.
- **Tentacion de inferencia continua**: dispara detecciones multiples (lo que SPEC 18 mide como
  danino); el diseno es **"captura un fotograma"**, no bucle de inferencia.
- **Bateria/CPU** en movil: visor en vivo con camara encendida; parar al ocultar y no inferir
  por fotograma.

## Decisiones propuestas (D43-D45)

- **D43 - Superficie de camara unica**: un modulo `src/camera/` (`CameraSurface`) compartido por
  los modos Foto y Codigo; encapsula permiso, visor, overlay, estados y lifecycle. Alternativa
  descartada: mantener dos implementaciones (divergen y duplican permisos/ciclo de vida).
- **D44 - Deteccion en vivo = previsualizar + capturar**: la vista en vivo **no** infiere por
  fotograma ni escribe en el borrador; se captura **un** fotograma limpio que entra al pipeline
  actual (alineado con el "una caja limpia" de SPEC 18). Alternativa descartada: inferencia
  continua (sobreconteo).
- **D45 - Permiso y ciclo de vida**: la camara vive **solo** mientras el modo esta activo; se
  pide en gesto del usuario y se detiene al ocultar el panel/pestana; `torch`/`facingMode`
  best-effort. Sin red nueva.
