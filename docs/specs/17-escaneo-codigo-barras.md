# 17 - Escaneo de productos por codigo de barras

> [!abstract] TL;DR
> La app lee un codigo (EAN-13/UPC-A) **en el dispositivo** (BarcodeDetector nativo
> con respaldo JS puro, y **entrada manual del EAN** como salida) y resuelve el
> producto **primero en local** (store IndexedDB `products`, que el usuario rellena).
> **Solo si la persona lo activa**, consulta una resolucion **en linea** ("mejorar la
> deteccion"), avisando de que el codigo **deja el dispositivo**. El producto entra en
> el borrador existente y se registra igual que cualquier alimento. **Sin cambios de
> esquema**: la procedencia vive en `FoodItem.barcode?` (aditivo), siguiendo el
> precedente del chat (spec 14).

Esta spec nace de la investigacion (flota de agentes + verificacion adversarial) sobre
como anadir escaneo y engancharlo al flujo de logging. Fija dos fases: **A** (offline
puro, sin decisiones nuevas) y **B** (opt-in en linea). Ambas aprobadas.

## Contexto

- El diario ya funciona: la comida es un **borrador** (`draft`) que el usuario ajusta y
  **registra** (`putMeal`). Un producto escaneado solo tiene que entrar en ese borrador;
  el resto del camino no cambia.
- La promesa es "nada sale de tu dispositivo" (D11, README). Escanear un codigo no
  cambia eso **mientras la resolucion sea local**; una consulta en linea si lo hace, y
  por eso es **opt-in y avisada** (Fase B).
- La decodificacion es 100% local: leer un EAN no requiere red ni backend.
- La fuente natural de catalogo de productos es Open Food Facts (ODbL-1.0), **fuente
  nueva** no contemplada en D19 (que exige Ciqual/USDA). Introducirla requiere una
  decision explicita (**D47**, ver final).

## Alcance

**Entra (Fase A)**: captura por camara de fichero, decodificacion EAN-13/UPC-A,
resolucion local (cache), prellenado con el EAN cuando no hay datos, UI/estado, i18n,
tests.

**Entra (Fase B)**: opt-in "resolucion en linea" (mejor deteccion), cliente de consulta,
cache del resultado, atribucion ODbL, reescritura honesta de privacidad, manejo ml/g.

**No entra**: publicacion/redistribucion de un dataset ODbL desde este repo (requiere
D47); ningun camino del escaneo hacia unidades de insulina; analitica.

## Diseno

### 1. Captura y decodificacion (on-device)

Sin backend ni red. Reusar el patron de captura existente (input `type=file` con
`capture="environment"`, `src/main.ts:259-260`), que ya funciona sin `getUserMedia`.

| Paso           | Como                                                                                                                                                                                            |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Leer imagen    | `<input id="barcode-input" type="file" capture="environment" class="sr-only">` disparado por un boton visible                                                                                   |
| Decodificar    | `BarcodeDetector` nativo si existe (`getSupportedFormats()` incluye `ean_13`/`upc_a`); si no, **`import()` dinamico** de `@ericblade/quagga2` (MIT, JS puro, ~142 KB, offline por construccion) |
| Entrada manual | Campo numerico EAN-13/UPC-A (obligatorio: iOS/Safari y Firefox **no** traen `BarcodeDetector`; sin camara o con permiso denegado tambien hace falta)                                            |
| Normalizar     | UPC-A(12) = EAN-13 con `0` delante; validar digito de control; rechazar codigos que no sean de 13/12 digitos                                                                                    |

Puertas de calidad aprendidas en la investigacion (correcciones de la verificacion):

- `detect()` toma un `ImageBitmapSource` (**Blob/ImageBitmap/`<img>`**), **no** un
  `dataUrl` string.
- **No** decodificar sobre el JPEG reescalado a 1024 px de `prepareImage`
  (`src/capture/image.ts:8,50,58`): demasiado pequeno/perdido para un EAN. El escaneo
  necesita su **propia pasada a resolucion completa** (o `maxEdge >= 1280` solo para el
  decode).
- Cualquier wasm (si se eligiera `zxing-wasm`, no recomendado) se **auto-hospeda**
  (`locateFile`) o se salta offline-first; `quagga2` evita el problema.
- `isOperational()` es de Android Mobile Vision, **no** de la API web: no existe ahi.
- E2E corre en **Firefox**, que no tiene `BarcodeDetector` ni camara: hace falta un hook
  `__carbosBarcodeStub` (mismo patron que `__carbosDetectionStub`, `src/main.ts:156-166`).

Render de camara en vivo (`getUserMedia` + `<video playsinline muted>`) queda **fuera**
de la Fase A; se puede anadir despues sin cambiar el modelo.

### 2. Resolucion local-first

1. Normalizar el EAN.
2. Buscar en el store local `products` (IndexedDB, clave = EAN-13).
3. **Hit** -> mapear a `FoodItem` y anadir al borrador.
4. **Miss y online desactivado** -> prellenar el item con el propio codigo como nombre y
   **pedir** los carbohidratos/gramos al usuario (nunca inventar). Ofrecer guardar ese
   producto en el store para la proxima vez.
5. **Miss y online activado** (Fase B) -> consultar, cachear el resultado en `products`,
   anadir al borrador. Si falla (offline/404), cae al paso 4.

### 3. Modelo de datos (sin bump de esquema)

- **Overlay**, no catalogo: un tipo nuevo `ScannedProduct`
  `{ barcode, name:{es,en} | string, brand?, carbsPer100g, defaultPortionGrams?, source,
savedAt }` en `src/barcode/`. Los productos escaneados son runtime, ilimitados y de
  procedencia distinta al catalogo curado (D26/D19): **no entran en `catalog.ts`**.
- Persistencia: nuevo store IndexedDB `products` (`keyPath:'barcode'`) en
  `src/core/db.ts`; `DB_VERSION 2 -> 3` y creacion en `onupgradeneeded`
  (`src/core/db.ts:6,14-25`), reutilizando `tx<T>` (`src/core/db.ts:31-46`) y el patron de
  `src/contrib/queue.ts`. Ojo: subir `DB_VERSION` hace que un build antiguo abra con
  `VersionError`; documentar que el overlay es local y no se exporta.
- `FoodItem`: anadir **opcionales** `barcode?`, `brand?` (`src/core/types.ts:14-20`,
  `src/core/schema.ts:20-26`). Zod los omite si faltan, asi que los exports v3 actuales
  **siguen importando**.
- **NO subir `SCHEMA_VERSION`** (queda en 3). Motivo verificado: `src/core/migrate.ts:34`
  es `version===1 || version===2 || version===SCHEMA_VERSION`; si `SCHEMA_VERSION=4`, el
  conjunto aceptado pasa a `{1,2,4}` y **todo vault v3 deja de importar** (y cae
  `migrate.test.ts`). Ademas `loadVault` re-parsea **todas** las comidas al cargar
  (`src/core/db.ts:64-67`) y `refresh()` no captura errores (`src/main.ts:937`): un
  `origin` desconocido en un build antiguo **rompe el diario**. Por eso la procedencia va
  en `FoodItem.barcode`, no en un `MealOrigin` nuevo. (Precedente identico: el chat
  reuso `'manual'` para no tocar la union congelada, `docs/specs/14-chat.md`.)

### 4. Integracion en el flujo de logging

En `src/main.ts` (todo reutilizable; anclas verificadas):

| Punto                  | Ubicacion                                                | Cambio                                                                                                |
| ---------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Boton + input + estado | card "Anadir comida" `273-286`                           | boton "Escanear" + `#barcode-input` + `<p id="barcode-status" aria-live="polite">` (patron `259-260`) |
| Crear item             | `addFoodToDraft` `381-390` (o `pushFood` `674-684`)      | **reutilizar**: rellena `{id, name, grams, carbsPer100g, classId?}` + `renderDraft()`                 |
| Decodificar            | nuevo `scanBarcode(file)`, espejo de `onFile` `996-1011` | decodifica + resuelve + anade                                                                         |
| Cablear                | `1012-1013`                                              | listener `change` del input nuevo                                                                     |
| Registrar              | `1021-1072`                                              | **sin cambios**; `confidence` ya queda `null` sin detecciones (`1026-1029`)                           |
| Estado/errores         | `setStatus`/`statusKeys` `124-131`                       | usar `setStatus('barcode-status', ...)`; se retraduce solo (`render()` `931`)                         |

Correcciones que hay que respetar:

- **Resetear detecciones al escanear**: `onFile` pone `draft.origin='photo'` y arranca
  deteccion (`1003-1006`); un escaneo posterior con `detections` viejas dispara mal
  `confidence` y el auto-share de contribuciones (`1052`). Limpiar
  `detections`/`detectionDraftIds`/`detectionMeta` y dejar `origin='manual'`.
- **Botones de porcion**: `renderDraft` los resuelve con `foodById(item.classId)`
  (`464`), que solo busca en `CATALOG.foods` (`669-672`). Un item de overlay **no** los
  tendra (aceptable); no prometer que "funcionan". Si se quieren, extender `foodById`
  para consultar el overlay, **sin** tocar `catalog.ts`.
- **Modulo separable (D7)**: montar el modulo en un `barcode-host` como
  `insulin-host`/`chat-host` (`329-331`, `1193-1200`) para que sacarlo sea una linea, en
  vez de inlinear el control en la card.

### 5. Opt-in "mejorar la deteccion" (resolucion en linea)

Fase B. **Apagado por defecto**; al activarlo, **avisa de que pasa a ser en linea**.

- Flag `carbos.barcode.online` en `localStorage` (patron `src/chat/flag.ts`,
  `src/insulin/flag.ts`); defecto `false`; revocable.
- Aviso al activar (ES): _"Al activarlo, el **codigo escaneado sale de tu dispositivo**
  para consultarse en linea. El resto de tus datos sigue sin salir. Puedes desactivarlo
  cuando quieras."_ (EN equivalente). Se mantiene "estimacion"/"registro"; nunca
  "preciso/seguro/dosis".
- Con el flag **ON**, solo se consulta en **miss de cache**; una consulta por escaneo.
  Con el flag **OFF**, todo es local (cache + entrada manual).
- **Atribucion obligatoria** (ODbL-1.0) alli donde aparezca dato en linea: _"Datos de
  Open Food Facts (ODbL-1.0)"_.
- Texto de privacidad honesto: excepcionar el barcode en `app.tagline`,
  `onboarding.privacyBody` (`src/i18n/index.ts:99-100,249-250`), README `:4-7` y meta
  (`index.html`).

### 6. Opciones para montar el dataset en local

Pregunta: que hay para no depender de la API en vivo y servir el dataset desde lo
propio. **Clave de privacidad: montarlo "en local" (tu servidor/mirror) NO lo hace
privado** — un mirror sigue recibiendo el codigo escaneado + la IP del usuario. Solo
**D** y **E** mantienen "nada sale del dispositivo".

| Opcion                                  | Que es                                                                                    | Cobertura             | Tamano/ops                                                                        | Offline                 | Privacidad                                      |
| --------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------- | --------------------------------------------------------------------------------- | ----------------------- | ----------------------------------------------- |
| **A. Auto-hospedar Product Opener**     | stack completo de OFF (Docker: MongoDB + Perl + nginx + postgres/redis)                   | total                 | MongoDB ~14 GB sin comprimir; cache Mongo 8 GB; **RAM >= 4-8 GB**; operacion alta | sirve a la app (online) | no: tu servidor ve el codigo+IP                 |
| **B. Subconjunto estatico por barcode** | extraer del dump y servir JSON shardeado desde Pages/jsDelivr/R2                          | filtrable a ES        | decenas de MB (medir); CI de actualizacion                                        | online                  | no: el mirror ve codigo+IP                      |
| **C. Worker + KV/R2**                   | endpoint de lookup (patron ya en repo: `workers/contrib`)                                 | subconjunto           | KV free 1 GB / 100k lecturas-dia; R2 free 10 GB; coste ~0                         | online                  | no: el Worker ve codigo+IP                      |
| **D. Bundle en la app**                 | subset empaquetado en el build, carga con `import()` diferido                             | muy pequeno (top EAN) | acotado por presupuesto (D18/D24)                                                 | si                      | **si**                                          |
| **E. Pack descargable -> IndexedDB**    | copia filtrada (sqlite/JSONL + zstd) con manifest firmado (sha256), importada **una vez** | pais entero           | decenas de MB                                                                     | si, tras importar       | **si** (solo revela que pack, no que productos) |

**Precedente real de E**: hay proyectos que publican _product packs_ offline por pais
(`.sqlite.zst` con manifest `{id, version, key, url, bytes, sha256, raw_bytes,
sha256_raw, product_count, vacuumed}`), filtrados sobre la faceta `countries_tags` de
OFF. Es exactamente el patron que la PWA ya usa para los pesos (manifest + sha256,
D24), reutilizable tal cual.

**Receta de extraccion** (dev time, fuera del bundle; estilo `tools/`):

1. Descargar el dump (elegir uno): CSV `en.openfoodfacts.org.products.csv.gz` (~0.9 GB
   gz / ~9 GB) o JSONL `openfoodfacts-products.jsonl.gz` (~7 GB gz / ~43 GB). Se
   regeneran **cada noche** (~16:00 CET).
2. Filtrar con **DuckDB** (`read_ndjson`, recomendado por OFF) o `ijson` (streaming
   Python): `list_contains(countries_tags,'en:spain')` **y** `code` valido EAN-13 **y**
   `nutriments.carbohydrates_100g` presente.
3. Proyectar al minimo: `code, product_name_es, product_name_en, brands,
nutriments.carbohydrates_100g, serving_quantity, last_modified_t`.
4. Salida: JSONL ordenado por `code`, o **sqlite** (`code TEXT PRIMARY KEY`) + `zstd`.
5. **Medir** el tamano real (no fiarse de la estimacion); emitir manifest con sha256.

**Licencia (D47)**: redistribuir un derivado de OFF obliga a **ODbL-1.0** (Share-Alike
sobre la base de datos, no sobre tu codigo) + atribucion; los contenidos son DbCL y las
imagenes CC-BY-SA-3.0 (no empaquetar fotos). No hay declaracion oficial de
compatibilidad ODbL <-> AGPL-3.0: es analisis, no consejo legal.

**Recomendacion**: Fase A -> **D** (subset pequeno) o **E** (pack por pais) para
mantener la promesa y el offline. Fase B -> **C** (Worker + R2, patron del repo) como
resolucion en linea por defecto, con la API de OFF como respaldo; **A** solo si de
verdad se quiere control total y se asume el coste/ops. **B** es el punto medio si no se
quiere un Worker (estatico puro, pero sigue siendo online).

### 7. Resolucion en linea (Fase B): endpoint y datos

- Endpoint preferido: **v3** `GET https://world.openfoodfacts.org/api/v3/product/{ean}.json`
  (v2 esta **deprecado**; en v3 un producto inexistente devuelve **404**). Si se usa el
  mirror propio (**C**), misma forma de respuesta.
- Campos: `product_name_es/_en` (fallback `product_name`), `brands`, `serving_quantity`,
  `nutriments.carbohydrates_100g`, `nutrition_data_per`. CORS `*` confirmado.
- `X-User-Agent: Carbos/<ver> (contacto)` (el `User-Agent` no es seteable desde `fetch`;
  `X-User-Agent` si). Limite OFF: **15 req/min**; cachear y no buscar por tecleo.
- **Unidades**: `nutriments.carbohydrates_100g` puede ser por **100 ml** (bebidas):
  leer `nutrition_data_per` y **no** mapear 100 ml a gramos a ciegas. Usar
  `carbohydrates_100g`, nunca `sugars_100g`.
- Mapeo a `FoodItem`: `name`<-nombre (por locale), `carbsPer100g`<-carbs/100g,
  `grams`<-`serving_quantity` o 100 (clamp >= 1), `barcode`<-EAN, `classId`<-opcional.

### 8. i18n

Todas las cadenas en **ES y EN** (la union `StringKey` sale del bloque `es`;
`src/i18n/index.test.ts` exige paridad, no-vacios, no-identicos y acentos correctos):
`button.scanBarcode`, `field.barcode`, `barcode.detecting`, `barcode.decoded`,
`barcode.notFound`, `barcode.unsupported`, `barcode.offline`, `barcode.manualLabel`,
`barcode.saveToLocal`, `barcode.onlineTitle`, `barcode.onlineWarning`,
`barcode.onlineNote`, `barcode.attribution`, `settings.barcodeModule`. Anadir "codigo"
a la guarda de acentos del test. No renderizar `origin` si no se pinta en el diario
(hoy `renderDiary` `871-920` no muestra origen).

## Modulos y cambios

| Fichero                                    | Cambio                                                                                            |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `src/barcode/index.ts`                     | Barrel (patron `src/chat/index.ts`)                                                               |
| `src/barcode/types.ts`                     | `BarcodeType`, `ScannedProduct`, `BarcodeResolution`                                              |
| `src/barcode/decode.ts`                    | Validacion EAN-13/UPC-A + checksum; `BarcodeDetector` + `quagga2` dinamico; a resolucion completa |
| `src/barcode/store.ts`                     | Store IndexedDB `products` (get/put/list) sobre `tx`                                              |
| `src/barcode/lookup/schema.ts`             | Zod de la respuesta (patron `src/model/manifest.ts`)                                              |
| `src/barcode/lookup/client.ts`             | GET por EAN con `fetch` inyectable + `X-User-Agent` (patron `src/model/loader.ts`)                |
| `src/barcode/resolve.ts`                   | cache -> (online) -> `FoodItem`                                                                   |
| `src/barcode/flag.ts`                      | `carbos.barcode.online` (patron `src/chat/flag.ts`)                                               |
| `src/barcode/ui.ts`                        | Panel opt-in + flujo de escaneo (solo borrador, no escribe)                                       |
| `src/barcode/boundary.test.ts`             | Prohibir import de `src/insulin/arithmetic` (patron `src/chat/boundary.test.ts`)                  |
| `src/core/db.ts`                           | Store `products` + `DB_VERSION 2 -> 3`                                                            |
| `src/core/types.ts` / `src/core/schema.ts` | `FoodItem.barcode?`/`brand?` (**sin** bump)                                                       |
| `src/main.ts`                              | Host/modulo, boton, input, `scanBarcode`, reset de detecciones, i18n                              |
| `src/i18n/index.ts`                        | Cadenas ES/EN (seccion 8)                                                                         |
| `tools/barcode/build_pack.py`              | (**Fase B/E**) extraer subconjunto del dump + manifest (opcional)                                 |
| `workers/barcode/`                         | (**Fase B/C**) Worker + R2 de lookup (patron `workers/contrib`)                                   |

## Criterios de aceptacion

1. Con la resolucion en linea **apagada**, escanear un EAN conocido en local anade el
   item al borrador **sin ninguna peticion de red**.
2. Un EAN desconocido (offline) **no** bloquea: prellena con el codigo y pide gramos.
3. `BarcodeDetector` ausente (Firefox, iOS) -> entra el respaldo (`quagga2`) o, si no,
   la **entrada manual**; nunca un callejon sin salida.
4. Registrar una comida con item escaneado guarda `FoodItem.barcode` y **no** rompe el
   import/export (v3 sigue parseando; sin `SCHEMA_VERSION` nuevo).
5. Activar "mejorar la deteccion" muestra el aviso de que **sale a internet**; el flag
   es revocable y, apagado, no hay egress.
6. El dato en linea muestra la atribucion ODbL.
7. Los liquidos se tratan segun `nutrition_data_per` (no se mapea 100 ml a gramos).
8. Todas las cadenas en `es` y `en`; guardas de i18n verdes.
9. `make check` verde; la app sigue **offline-first**; `make verify-bundle` no se rompe.

## Tests

- **Unitarios**: `decode.ts` (checksum EAN-13/UPC-A, normalizacion 12->13, stub de
  `BarcodeDetector`), `store.ts` (get/put/list; `DB_VERSION`), `lookup/client.ts`
  (`fetch` inyectado; exito/404/`nutrition_data_per` ml), `flag.ts` (defecto off),
  `boundary.test.ts` (frontera con insulina).
- **E2E** (`e2e/scenarios.mjs`, Firefox): `__carbosBarcodeStub` que devuelve un EAN;
  escanear -> item en `#draft-items` -> registrar -> el diario lo muestra; con el flag
  off, **cero** peticiones externas (reusar la intercepcion existente).
- **Integracion opcional (Fase B/E)**: un pack de prueba pasa por el importador y una
  muestra de barcodes se lee de vuelta y se compara con la fuente.

## Fases

- **Fase A (offline puro)**: secciones 1-4, 8; overlay + `FoodItem.barcode?`; decodificar
  - cache + entrada manual. Sin decisiones nuevas.
- **Fase B (opt-in en linea)**: secciones 5-7; flag + aviso + atribucion + reescritura de
  privacidad; endpoint (API OFF v3 o Worker propio); pack opcional (E).
- Checkpoint por fase: `make check` + `make e2e` + `make verify-bundle` + `make build`.

## Referencias

- Investigacion de esta sesion (puntos de integracion, esquema, decodificacion,
  licencias, privacidad) y `docs/recetas`/`docs/decisiones.md` D11, D17, D18, D19, D24,
  D26, D39.
- BarcodeDetector: MDN y caniuse (Safari/iOS desactivado por defecto; Firefox no).
- OFF: `https://world.openfoodfacts.org/data` (dumps, nightly; CSV ~0.9 GB gz; JSONL
  ~7 GB gz / ~43 GB), API v3, ODbL-1.0, `countries_tags` = `en:spain`.
- Product Opener (auto-hospedaje Docker): guia oficial (MongoDB ~14 GB, RAM >= 4-8 GB).
- Cloudflare Workers/KV/R2 free tier (100k req/dia; KV 1 GB / 100k lecturas-dia; R2
  10 GB free, egress gratis).
- Precedente de packs offline por pais (sqlite.zst + manifest con sha256).

## Riesgos

- **Privacidad**: la tentacion de dejar la resolucion en linea "encendida por comodidad"
  rompe la promesa; el aviso y el defecto-off son la proteccion. Un mirror propio sigue
  siendo online.
- **Licencia**: ODbL derivada + AGPL-3.0 sin declaracion oficial (D47); empequetar datos
  de OFF es mas arriesgado que consultarlos en vivo.
- **Precision de unidades** (ml vs g) y **carbohidratos vs azucares**: fuente de totales
  erroneos; tratar explicitamente.
- **Tamano/actualizacion** de un pack o subset: medir, manifest+firma, y no engordar el
  artefacto (D18/D24). `make verify-bundle` no cubre `.wasm`/datos, no usarlo como unica
  guarda.
- **Decodificacion**: camara movil en envoltorios curvos/baja luz; por eso la entrada
  manual es obligatoria.

## Decisiones propuestas (D47-D49)

- **D47 - Fuente de productos y licencia**: introducir Open Food Facts (ODbL-1.0) como
  fuente de barcode, en modo **consulta** (no empaquetado) por defecto; si se empaqueta,
  asumir ODbL + atribucion. Alternativas: USDA FDC (CC0, sin lookup por UPC), Wikidata
  P3962 (CC0, empaquetable) o tabla propia.
- **D48 - Resolucion en linea opt-in**: la app resuelve en local por defecto; la
  resolucion en linea es un modulo opt-in, revocado, avisado ("el codigo sale a
  internet") y con atribucion; nunca silencioso.
- **D49 - Esquema estable**: la procedencia del escaneo va en `FoodItem.barcode?`
  (aditivo), sin subir `SCHEMA_VERSION`; se sigue el precedente del chat.

## Estado (implementado)

- **Fase A (offline, opcion E)**: modulo `src/barcode/` (ean, decode, scanner, pack,
  store, resolve, flag, ui), store IndexedDB `products`, `FoodItem.barcode?`/`brand?`
  (aditivo, `SCHEMA_VERSION` sin tocar), pestana **"Codigo"** en la entrada (visible
  por defecto, junto a Foto/Buscar; lo unico opt-in es la resolucion en linea), i18n ES/EN, tool
  `tools/barcode/build_pack.py`, E2E con `__carbosBarcodeStub`.
- **Escaneo en tiempo real y unificado** (`src/barcode/scanner.ts` + `decode.ts`): boton
  **"Escanear"** prominente que abre la camara (`getUserMedia`) y decodifica fotogramas
  en bucle; boton "Cancelar" para parar. `decodeFrame` prueba primero el
  `BarcodeDetector` **nativo** y, si no esta o no encuentra nada, cae a **quagga2**
  (MIT, JS puro, `import()` diferido → chunk aparte). Asi el escaneo funciona en
  **todos** los navegadores (iOS/Firefox incluidos) por el mismo camino; sin camara
  disponible, cae a la **foto** o a la entrada manual. Las opciones secundarias
  (escribir el EAN, foto, descargar/importar pack, consulta en linea) viven en
  **"Mas opciones"**.
- **Descarga automatizada**: manifest hospedado (`public/barcode-manifest.json`,
  mismo origen; URL relativa `./barcode/es.jsonl.gz`) que la app consulta al pulsar
  "Descargar pack"; descarga con progreso, **verifica sha256** e importa en IndexedDB.
  Despues, offline. `make barcode-pack` genera el pack + el manifest y el pack viaja en
  `dist/` junto con la app (mismo origen, sin CDN). El pack no se versiona
  (`public/barcode/` ignorado; ODbL-1.0).
- **Fase B (opt-in)**: `src/barcode/lookup/` (cliente Open Food Facts v3), flag
  `carbos.barcode.online` (por defecto **off**), y en la UI un checkbox con **aviso**
  de que el codigo sale del dispositivo. Con el flag apagado no hay ninguna peticion;
  con el activado, un miss consulta OFF v3 (cabecera `X-User-Agent`), cae a `null`
  ante 404/`status!=success`/sin carbohidratos/**100 ml** (no se mapea ml a gramos) y
  cachea el resultado. E2E con `__carbosBarcodeFetch` (sin red real).
- **Packs reales (multi-pais)**: `make barcode-pack` construye desde la API de busqueda
  de OFF (sin el dump de ~7 GB) **un pack por pais/idioma** para **ES, FR, PT e IT**,
  partidos en **principal** (con nutricion) y **resto** (solo identificacion, sin
  carbohidratos). **~1,5 M productos (~33 MB)** en `public/barcode/` (ES 282k, FR 976k,
  IT 231k, PT 13k), **versionados y servidos con la app** (mismo origen). `--partition` divide por prefijo de codigo para
  **superar el techo de 10.000** de una consulta; `--limit 0` recorre el pais casi entero
  y `--input dump.jsonl.gz` usa el dump completo. La app descarga los packs de su idioma
  y, en un hit sin carbohidratos, prellena nombre/marca y deja los gramos editables
  (clave `barcode.identified`). Pendiente: guardar-en-local tras un miss y streaming del
  JSONL grande.
- **Feedback del escaneo en vivo**: sobre el visor de camara, un marco/reticle con guia
  ("Apunta al codigo de barras") y estado en vivo (indicador de actividad → "Codigo leido.
  Buscando el producto..." → **"Anadido: <nombre>"** o fallo accionable). Sin camara, el
  fallback a foto/entrada manual no cambia.
- **Arreglo critico de la descarga de packs** (el pack **nunca** se importaba, asi que
  _todo_ escaneo era un miss, Lidl/Mercadona incluidos). Eran **tres** fallos encadenados:
  1. **Integridad/transporte**: el servidor sirve `*.jsonl.gz` con `Content-Encoding: gzip`
     y el navegador entrega el JSONL **ya descomprimido**; el sha256 calculado sobre esos
     bytes no coincidia con el del `.gz` del manifest → `downloadPack` fallaba. Los
     manifests ganan `sha256_raw`/`raw_bytes` (hash del JSONL decodificado) y la app
     verifica el contenido decodificado (y, si los bytes llegan comprimidos, tambien el
     `.gz`). `tools/barcode/build_pack.py` los emite.
  2. **Parseo tolerante**: `importPack` abortaba el pack entero en la primera linea
     invalida (p.ej. un `name.es` vacio; hay cientos en los packs reales). Ahora salta
     lineas invalidas y rellena el idioma vacio con el otro; el generador ya no emite
     nombres vacios.
  3. **Service worker**: `cacheFirst` cacheaba los packs (hasta ~47 MB descomprimidos) y
     `cache.put` fallaba con `NetworkError`, tumbando el `fetch` (`net::ERR_FAILED`). El SW
     hace _passthrough_ de `./barcode/*` y `barcode-manifest.json`, y un fallo de escritura
     en cache ya no rompe la respuesta.
     Verificado end-to-end con los packs reales (Chrome headless sobre `dist/`): ES importa
     ~282k productos y `8480000003089` (Mercadona/Hacendado) y `4056482891380` (Lidl)
     resuelven.
- **Pendiente (heredado)**: guardar-en-local tras un miss; `field.barcode` (clave muerta);
  streaming del JSONL; decidir la API de Mercadona (nombre/ingredientes/alergenos, sin
  carbs); CDN opcional con `--base-url`.
