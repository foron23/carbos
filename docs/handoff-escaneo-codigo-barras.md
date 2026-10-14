# Handoff — Escaneo de productos por codigo de barras (spec 17)

Resumen del trabajo hecho para continuar en un contexto nuevo. El diseno completo
esta en [`specs/17-escaneo-codigo-barras.md`](specs/17-escaneo-codigo-barras.md).

## Estado: implementado, en `main` y desplegado

Commits (de mas antiguo a mas nuevo):

| Commit    | Que                                                                                      |
| --------- | ---------------------------------------------------------------------------------------- |
| `8a253ab` | feat(barcode): escaneo por codigo de barras (spec 17) — modulo + packs + integracion     |
| `3b7ad2a` | pestana "Codigo" en la entrada (visible por defecto; antes era opt-in oculto en Ajustes) |
| `4445cb7` | boton "Escanear" con escaneo en tiempo real (camara)                                     |
| `f4cb7df` | escaneo unificado: `BarcodeDetector` nativo + `@ericblade/quagga2` (MIT)                 |
| `7882227` | arreglo del bucle en vivo (visor visible, frames a 800 px, sin solape)                   |
| `45ca762` | aviso si el escaneo tarda (acercar camara / usar foto)                                   |
| `00b9fb3` | **fix**: la consulta en linea (OFF v3) rechazaba todo + el miss creaba fila              |
| `cecdcf8` | "escanear y ya": auto-descarga del pack + miss sin fila                                  |

## Como funciona (flujo actual)

- Pestana **Foto | Buscar | Codigo** en la tarjeta "Anadir comida". En **Codigo**, un boton
  **Escanear** (principal). Al abrirlo, el pack se **descarga solo** en segundo plano
  (manifest → sha256 → IndexedDB) y el escaneo **espera** a tenerlo.
- **Decodificacion unificada** (`decodeFrame`): `BarcodeDetector` nativo si existe
  (Chrome/Android) y, si no, **quagga2** (JS puro, `import()` diferido). Escaneo en vivo
  (bucle de fotogramas) y foto usan el mismo camino → funciona en todos los navegadores.
- **Resolucion**: local-first (store `products` en IndexedDB). Si no esta y el usuario
  activo **"Consultar en linea"** (opt-in, por defecto **off**), consulta Open Food Facts
  v3 y cachea. Con el flag off **no hay ninguna peticion de red**.
- **Un miss NO crea fila**: solo avisa ("No se encontro. Descarga el pack o activa la
  consulta en linea.").
- Marcas propias en "Mas opciones": escribir EAN a mano, escanear con foto, importar pack.

## Invariantes respetados

- `SCHEMA_VERSION` sigue en **3**; la procedencia va en `FoodItem.barcode?`/`brand?`
  (aditivo). Packs en IndexedDB `products` (`DB_VERSION 2 -> 3`).
- Frontera con la aritmetica de insulina intacta (`src/barcode/boundary.test.ts`).
- Sin backend; la unica red es (a) la descarga del pack y (b) la consulta en linea opt-in.

## Datos (packs)

- `make barcode-pack` construye packs desde la **API de busqueda de OFF** (search-a-licious),
  particionando por prefijo de codigo (`--partition`) para **superar el techo de 10.000** de
  una consulta; `--limit 0` = pais casi entero. Alternativa: `--input dump.jsonl.gz`.
- Un pack **por pais/idioma** (`--per-country`) y partido en **principal** (con nutricion) y
  **resto** (`-rest`, solo identificacion: EAN + nombre/marca, sin carbs).
- Versionados en `public/barcode/` (~**1,5 M productos, ~33 MB**): ES 282k, FR 976k, IT 231k,
  PT 13k. Viajan en `dist/` (mismo origen, sin CDN). Datos **ODbL-1.0** (atribucion en la UI).
- Herramienta: `tools/barcode/build_pack.py` (+ `test_build_pack.py`, 11/11).

## Bases de datos de Lidl/Mercadona (investigado)

- **Open Food Facts** (ODbL) es la practica para EAN→carbohidratos y **ya cubre** ambos:
  pack ES tiene **Mercadona** (`8480000…`) **5.026** y **Lidl** (`405648…`) **2.282**
  (Carrefour `356007…` ~2.600). El fallo del usuario era que no habia pack cargado /
  la consulta en linea estaba rota — ya corregido.
- **API (no oficial) de Mercadona** (`tienda.mercadona.es/api/products/<id>/`): devuelve
  **`ean`**, nombre, **ingredientes y alergenos**, pero **NO macros** (ni carbohidratos).
- **Lidl**: sin API oficial; solo scrapers de terceros (ReefAPI, Apify, everydata.io) con GTIN.
- **GS1 España / AECOC**: titularidad del codigo, sin nutricion.
- Comerciales (Nutritionix, Edamam, UPCitemdb, EAN-Search): de pago y cobertura ES floja.
- **BEDCA**: sin codigos de barras y licencia incompatible (D19/D30).
- Los codigos internos **`2…`** (Restricted Circulation Number, peso variable/marca blanca
  interna) **no tienen macros fiables en ninguna base publica** → entrada manual.

## Gate

`make check` (349 tests) · `make build` · `make verify-bundle` · `make e2e` (28 escenarios).
`make barcode-pack` (default `--limit 0`, ~27 min).

## Pendiente / siguientes pasos

1. **"Guardar en local"**: que lo que el usuario anada a mano para un EAN se recuerde y
   resuelva offline la proxima vez (cubre las marcas propias `2…`). _No implementado._
2. **Menores de Fase A**: `product_count` no se verifica; `field.barcode` clave muerta;
   `pack.ts` materializa el JSONL en memoria (streaming); el fallback de quagga2 podria usar
   su modo **LiveStream** (Web Workers + `frequency`) para ir mas fluido.
3. **Decidir** si se quiere la API de Mercadona como fuente extra (nombre/ingredientes/
   alergenos; no carbs).
4. **E2E flaky**: el escenario "captura una foto sin salir del dispositivo" descarga los pesos
   reales (16 MB) de jsDelivr y a veces agota los 10 s (red). Hacerlo determinista
   (interceptar/abortar esa descarga) queda pendiente.
5. **CDN opcional**: si se quiere no engordar git, publicar los `.jsonl.gz` con `--base-url`.
6. `docs/decisiones.md`: D40–D42 (fuente/licencia ODbL, resolucion en linea opt-in, esquema
   estable) estan propuestos en la spec pero **no** volcados al registro de decisiones.

## Nota de arbol de trabajo

Hay cambios de **otra sesion** en curso (no commiteados por mi): `Makefile`, `README.md`,
`eval/infer.ts`, `src/catalog/classmap*.ts`, `docs/specs/18-modelo-deteccion.md`,
`tools/eval/`, `training/eval_*.py`. Ignorar o coordinar.
