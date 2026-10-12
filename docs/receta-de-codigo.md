# Receta de codigo de Carbos

Contrato de trabajo del repo. `make` es el **punto unico de entrada** al SDLC: no
se invocan herramientas sueltas (`npx`, `vitest`, `tsc`) si existe un target.

## Comandos

| Comando             | Que hace                                                                                                   |
| ------------------- | ---------------------------------------------------------------------------------------------------------- |
| `make setup`        | Instala dependencias (`npm install`)                                                                       |
| `make dev`          | Servidor de desarrollo de Vite                                                                             |
| `make build`        | Typecheck + build estatico (`tsc --noEmit && vite build`)                                                  |
| `make test`         | Vitest (`npm test`)                                                                                        |
| `make e2e`          | Prueba E2E real en Firefox headless sobre el build (`make build` + `npm run e2e`)                          |
| `make lint`         | ESLint                                                                                                     |
| `make format`       | Prettier                                                                                                   |
| `make format-check` | Prettier en modo verificacion                                                                              |
| `make check`        | `format-check` + `lint` + `test` — la puerta antes de commit                                               |
| `make train-setup`  | Instala dependencias de entrenamiento (Python; ver [`specs/08-linear-probe.md`](specs/08-linear-probe.md)) |
| `make train-smoke`  | Prueba el pipeline de entrenamiento sin datos (dry-run)                                                    |
| `make train`        | Entrena la cabeza nueva (linear probe) sobre el set propio                                                 |
| `make export-model` | Exporta a ONNX int8 y escribe el manifest del clasificador                                                 |
| `make clean`        | Borra `dist/` y caches                                                                                     |

> El entrenamiento es **dev time**: sus datos y pesos no entran al bundle ni al repo
> (`.gitignore` cubre `training/data/`, `training/out/`, `*.pt`, `*.onnx`).

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
training/      Entrenamiento (dev time): linear_probe.py, export_onnx.py, requirements.txt.
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
