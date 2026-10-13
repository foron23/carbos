# Pack de codigos de barras (offline)

Herramienta de desarrollo (spec 17, opcion E) que convierte los datos de
[Open Food Facts](https://world.openfoodfacts.org/data) en un **pack descargable**:
JSONL gzip + manifest firmado (sha256). La app lo importa una sola vez en IndexedDB y
resuelve el EAN en local, sin red.

Dos fuentes:

- **`--from-api`** (por defecto en `make barcode-pack`): pagina la API de busqueda de
  OFF por faceta de pais, sin bajar el dump de ~7 GB. Con `--partition` divide por
  prefijo de codigo (`code:840*`) para **superar el techo de 10.000** de una sola
  consulta; asi saca decenas de miles de productos (`--limit 0` = pais casi entero).
- **`--input`**: el dump JSONL/JSONL.gz (local o URL) para el pack completo, en
  streaming.
- **`--per-country`**: un pack por pais (bajo `<out>/<locale>`); la app elige el de su
  idioma. **`--split`**: cada pais en dos packs: el **principal** (con nutricion, uso
  directo) y el **resto** (`-rest`, solo identificacion: EAN + nombre/marca, sin
  carbohidratos; la app prellena y el usuario pone los gramos).

## Como ejecutarlo

```bash
# Viaja JUNTO CON LA APP (mismo origen): escribe public/barcode/<locale>.jsonl.gz
# (+ -rest) y public/barcode-manifest.json con URLs relativas.
make barcode-pack                    # ES+FR+PT+IT, principal+resto (~1,5M, ~27 min)

make barcode-pack BARCODE_ARGS="--from-api --partition --per-country --split --limit 40000"
make barcode-pack BARCODE_ARGS="--from-api --limit 5000"            # sin particionar (max 10k)
make barcode-pack BARCODE_ARGS="--input dump.jsonl.gz --split"      # dump completo
python3 tools/barcode/build_pack.py --from-api --partition --per-country --split \
    --countries en:spain,en:france --out /tmp/es --limit 300 --packs-manifest /tmp/packs.json
```

- `--from-api`: pack desde la API de busqueda (sin el dump). Paginas de `--page-size`
  (1000) con `--api-delay` de cortesia; una pagina fallida no aborta el pack.
- `--partition`: divide por prefijo de codigo para pasar del techo de 10.000; un
  prefijo saturado se subdivide. Necesario para packs de decenas de miles.
- `--per-country` / `--split`: un pack por pais, y cada uno partido en principal/resto.
- `--input`: JSONL o JSONL.gz local, o URL (si se omite, modo dump usaria el oficial).
- `--countries`: facetas `countries_tags` separadas por comas (`en:spain,en:france`).
- `--out`: ruta base del pack (sin extension); con `--per-country` se usa su carpeta.
- `--limit`: maximo por pais (0 = sin limite; en modo API acota paginas/prefijos).
- `--locale` / `--url`: opcionales; el locale se deduce del pais y la URL del nombre del pack.
- `--packs-manifest`: escribe el manifest hospedado en esa ruta. **Sin fuente**
  (`--input`/`--from-api`) emite solo una lista `packs` vacia (bootstrap/ejemplo).
- `--base-url`: base publica de los packs; la URL de cada pack queda `<base-url>/<fichero>`.
- `--pack-id` / `--generated-at`: sobreescriben el id del pack y el timestamp.

Lee el dump en **streaming** (linea a linea) y solo conserva los productos filtrados,
asi que el dump completo nunca entra en memoria. Solo usa la biblioteca estandar.

## Manifest hospedado (descubrimiento de packs)

El mismo builder escribe el manifest que la app consulta para **descubrir** el pack:

```json
{
  "format": "carbos-barcode-packs",
  "version": 1,
  "packs": [
    {
      "id": "es",
      "locale": "es",
      "url": "https://cdn.example/barcode/es.jsonl.gz",
      "sha256": "<hex de los bytes del jsonl.gz>",
      "bytes": 12345,
      "product_count": 42,
      "generated_at": "2026-10-13T00:00:00Z"
    }
  ]
}
```

`public/barcode-manifest.example.json` es la forma valida pero vacia (los `packs` se
rellenan al publicar). El flujo en la app es **una sola vez**: al pulsar "descargar pack"
descarga el `.jsonl.gz`, **verifica el sha256**, importa los productos en IndexedDB
(store `products`) y a partir de ahi resuelve el EAN en local **sin red**. La URL de cada
pack se compone como `<base-url>/<fichero>`; el sha256 y `bytes` firman los bytes exactos
del pack. La importacion manual (fichero local) queda como respaldo.

Dentro de la app, la descarga ocurre **solo** al pulsar el boton: la app no descarga el
pack en segundo plano ni consulta el manifest sin accion del usuario.

## Publicar el pack junto con la app (mismo origen)

Los packs se generan en `public/barcode/` y el manifest usa URLs **relativas**
(`./barcode/es.jsonl.gz`), de modo que se sirven desde el **mismo origen** que la app
(GitHub Pages), sin depender de ningun CDN externo:

```bash
make barcode-pack     # -> public/barcode/{es,fr,pt,it}{,-rest}.jsonl.gz + barcode-manifest.json
make build            # Vite copia public/ a dist/: los packs viajan en el artefacto
```

Los packs (~1,5 M productos, ~33 MB para ES+FR+PT+IT) **se versionan** en `public/barcode/`, asi que
viajan con la app en cada despliegue sin ningun paso extra; tras la primera importacion,
el escaneo funciona **offline**. La app descarga los packs de **su idioma** (principal +
resto). Para ampliar cobertura, regenera con `--limit 0` (pais casi entero) o desde el
dump, y commitea; o publica los `.jsonl.gz` en un CDN con `--base-url https://...`. La
atribucion ODbL-1.0 se muestra en la UI.

## Formato del pack

`<out>.jsonl.gz`: una linea JSON por producto, ordenado por `barcode`:

```json
{
  "barcode": "8412345678905",
  "name": { "es": "Patatas fritas", "en": "Chips" },
  "brand": "Marca X",
  "carbsPer100g": 52.3,
  "defaultPortionGrams": 30,
  "source": "Open Food Facts (ODbL-1.0)",
  "savedAt": 1760356800000
}
```

`<out>.manifest.json`:

```json
{
  "format": "carbos-barcode-pack",
  "version": 1,
  "locale": "es",
  "url": "es.jsonl.gz",
  "bytes": 12345,
  "sha256": "<hex de los bytes del jsonl.gz>",
  "product_count": 42,
  "generated_at": "2026-10-13T00:00:00Z"
}
```

Filtro: `countries_tags` contiene el pais **y** `code` es un EAN-13 valido (UPC-A de 12
digitos se normaliza con un `0` delante) **y** `nutriments.carbohydrates_100g` existe.

## Licencia y atribucion (ODbL-1.0)

Los datos son de **Open Food Facts**, bajo **ODbL-1.0**. Un pack derivado sigue siendo
ODbL: si se redistribuye hay que mantener la atribucion (la app la muestra) y la
Share-Alike sobre la base de datos, y no se empaquetan imagenes (CC-BY-SA-3.0). Los packs
de `public/barcode/` **se versionan con la app** (~33 MB para ES+FR+PT+IT); `tools/barcode/out/`
es area de trabajo ignorada. Un pack mas grande por pais se puede publicar como artefacto
aparte (`--base-url`) para no engordar el repo.
