# Receta de codigo de Carbos

Contrato de trabajo del repo. `make` es el **punto unico de entrada** al SDLC: no
se invocan herramientas sueltas (`npx`, `vitest`, `tsc`) si existe un target.

## Comandos

| Comando | Que hace |
|---|---|
| `make setup` | Instala dependencias (`npm install`) |
| `make dev` | Servidor de desarrollo de Vite |
| `make build` | Typecheck + build estatico (`tsc --noEmit && vite build`) |
| `make test` | Vitest (`npm test`) |
| `make lint` | ESLint |
| `make format` | Prettier |
| `make format-check` | Prettier en modo verificacion |
| `make check` | `format-check` + `lint` + `test` — la puerta antes de commit |
| `make clean` | Borra `dist/` y caches |

## Estructura

```
src/
  core/        Dominio puro: tipos, esquema Zod, totales, export JSON, IndexedDB.
  insulin/     Modulo OPT-IN de aritmetica de insulina. Aislado.
  main.ts      Bootstrap de la PWA: monta el modulo de insulina y la UI.
  style.css
public/        manifest.webmanifest, sw.js, icon.svg (PWA minima)
docs/          specs/01-roadmap.md, decisiones.md, esta receta.
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
