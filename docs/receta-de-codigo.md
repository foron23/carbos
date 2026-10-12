# Receta de codigo de Carbos

Contrato de trabajo del repo. `make` es el **punto unico de entrada** al SDLC: no
se invocan herramientas sueltas (`npx`, `vitest`, `tsc`) si existe un target.

## Comandos

| Comando             | Que hace                                                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `make setup`        | Instala dependencias (`npm install`)                                                                                           |
| `make dev`          | Servidor de desarrollo de Vite                                                                                                 |
| `make build`        | Typecheck + build estatico (`tsc --noEmit && vite build`)                                                                      |
| `make test`         | Vitest (`npm test`)                                                                                                            |
| `make e2e`          | Prueba E2E real en Firefox headless sobre el build (`make build` + `npm run e2e`)                                              |
| `make lint`         | ESLint                                                                                                                         |
| `make format`       | Prettier                                                                                                                       |
| `make format-check` | Prettier en modo verificacion                                                                                                  |
| `make check`        | `format-check` + `lint` + `test` — la puerta antes de commit                                                                   |
| `make train-setup`  | Instala dependencias de entrenamiento (Python; ver [`specs/08-linear-probe.md`](specs/08-linear-probe.md))                     |
| `make train-smoke`  | Prueba el pipeline de entrenamiento sin datos (dry-run)                                                                        |
| `make train`        | Entrena la cabeza nueva (linear probe) sobre el set propio                                                                     |
| `make export-model` | Exporta a ONNX int8 y escribe el manifest del clasificador                                                                     |
| `make catalog`      | Regenera `src/catalog/catalog.ts` desde Ciqual 2020 (`tools/catalog/build_catalog.py`)                                         |
| `make smoke-setup`  | Crea `tools/smoke/.venv` (onnx/numpy/onnxruntime) para el smoke test local                                                     |
| `make smoke-models` | Genera modelos ONNX **de prueba** + `public/model-manifest.json` (no se commitea)                                              |
| `make smoke-clean`  | Borra los modelos de prueba y el manifest local                                                                                |
| `make eval`         | Corre el banco de Nutrition5k sobre el manifest de modelos (`eval/`; ver [`specs/10-experimento.md`](specs/10-experimento.md)) |
| `make clean`        | Borra `dist/` y caches                                                                                                         |

> El entrenamiento es **dev time**: sus datos y pesos no entran al bundle ni al repo
> (`.gitignore` cubre `training/data/`, `training/out/`, `*.pt`, `*.onnx`).

## Smoke test local (modelos de prueba)

El reconocimiento de foto necesita pesos, que **aun no estan publicados** (D24); sin
`public/model-manifest.json` la app degrada a entrada manual. Para probar el flujo completo en
local sin publicar nada:

```bash
make smoke-setup     # crea el venv con onnx/numpy/onnxruntime
make smoke-models    # genera public/models/*.onnx + public/model-manifest.json
make dev             # o: npm run dev -- --host  para probar desde el movil
```

Los modelos son **placeholder** (detector de caja fija, clasificador de logits fijos): prueban
manifest -> descarga -> sha256 -> sesion -> deteccion -> clasificacion -> porcion, pero **no**
reconocen comida real. Viven en `public/models/` y estan **gitignored**: no viajan al repo ni al
artefacto de Pages. `make verify-bundle` los detecta y falla si intentas empaquetarlos; usa
`make smoke-clean` antes de un build de release.

Contrato que respetan (ver `src/model/worker.ts`):

| Modelo       | Entrada                          | Salida                        |
| ------------ | -------------------------------- | ----------------------------- |
| detector     | `[1,3,640,640]` float32 `/255`   | `[1, 4+nc, anchors]` (YOLOv8) |
| clasificador | `[1,3,224,224]` float32 ImageNet | logits `[1, C]`               |

## Estructura

```
src/
  core/        Dominio puro: tipos, esquema Zod, migracion, totales, export JSON, IndexedDB.
  catalog/     Datos curados (generados): types, esquema Zod, catalogo, busqueda y mapa de clases (modelo -> alimento).
  model/       Esquema del manifest de modelos (los pesos viven fuera del repo).
  insulin/     Modulo OPT-IN de aritmetica de insulina. Aislado.
  i18n/        Cadenas ES/EN y deteccion de idioma.
  capture/     Captura de imagen (fichero/camara), EXIF y reescalado en canvas.
  export/      Export cifrado (Argon2id + AES-GCM).
  main.ts      Bootstrap de la PWA: UI de registro, foto, diario, insulina y copia.
  style.css
e2e/           Arnés E2E (Puppeteer + Firefox headless) y escenarios.
eval/          Banco de evaluacion (Nutrition5k): descarga, inferencia ONNX y metricas.
training/      Entrenamiento (dev time): linear_probe.py, export_onnx.py, requirements.txt.
tools/catalog/ Generador del catalogo (selection.csv + build_catalog.py; cache en .cache/).
tools/smoke/   Modelos ONNX de prueba y manifest local para el smoke test (make smoke-models).
public/        manifest.webmanifest, sw.js, icon.svg (PWA minima)
docs/          specs/ (roadmap, fase 1, despliegue, spike BEDCA, benchmark, runtime, fine-tuning, linear probe), decisiones.md, esta receta.
```

## Reglas de arquitectura

- **El dominio no conoce la UI ni el navegador.** `src/core/totals.ts`, `schema.ts`
  y `export.ts` son funciones puras y se pueden testear en Node. `db.ts` es la
  unica pieza de `core/` que toca IndexedDB.
- **El modulo de insulina es separable.** `main.ts` importa `setupInsulin` de
  `./insulin` en **una sola linea**; quitar esa linea (y el `<div id="insulin-host">`)
  saca el modulo del build. No debe filtrarse a `src/core/`.
- **La foto nunca produce unidades.** Ningun camino de la estimacion a un numero
  de insulina sin confirmacion explicita de la persona sobre los gramos.
- **El numero de insulina sale siempre de la formula, nunca del modelo.** La
  aritmetica es funcion pura con tests; el LLM/VLM no esta en el camino del calculo.
- **Esquema versionado.** `SCHEMA_VERSION` en `src/core/types.ts`; todo import/export
  pasa por Zod (`src/core/schema.ts`) antes de tocar la base de datos.

## Textos

Toda cadena visible respeta las reglas de redaccion de `docs/decisiones.md`:
nunca "dosis", "recomendamos", "seguro", "preciso"; siempre "estimacion",
"registro", "aritmetica", "tus numeros", "revisa y ajusta", "tu equipo medico".

## CI

`.github/workflows/ci.yml` corre `make setup` y `make check` en cada push y PR.
`.github/workflows/deploy.yml` corre `make check` + `make build` en `main` y publica `dist/` en
GitHub Pages ([`specs/03-despliegue.md`](specs/03-despliegue.md)).
