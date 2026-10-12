# SPEC 03 - Despliegue en GitHub Pages

> [!abstract] TL;DR
> Build y publicacion por **GitHub Actions** al oficial de Pages: en cada push a `main` se corre
> `make check` + `make build` y se despliega `dist/` como artefacto. Sitio en
> `https://foron23.github.io/carbos/`. Los **pesos del modelo no entran** ni en el repo ni en el
> artefacto: viven en **jsDelivr / GitHub Releases** y se descargan una sola vez en el dispositivo
> (D18/D24).

## Contexto: D17 vs D18

D17 decia "la Pi solo publica el estatico"; D18 cerro "GitHub Pages". Se adopta **Pages como
unico canal** y la Pi queda como servidor local de desarrollo (`make dev` / `make preview`), no
como publicador. El repo es publico y sin backend, asi que Pages no anade superficie.

## Opciones y eleccion

|                    | A. GitHub Actions -> Pages (recomendada) | B. Rama `gh-pages`                  |
| ------------------ | ---------------------------------------- | ----------------------------------- |
| Quien construye    | Actions en cada push                     | La maquina de trabajo               |
| Publicacion        | Automatica (`deploy-pages`)              | `make deploy` manual + push de rama |
| Riesgo de olvido   | Nulo                                     | Alto (hay que recordar desplegar)   |
| Encaje con D17/D18 | D18 manda                                | Mezcla ambas                        |

**Se elige A.** Es reproducible, no commitea artefactos y no depende de la Pi.

## Configuracion

1. **Settings -> Pages -> Source: GitHub Actions** (paso manual, una sola vez, fuera del sandbox).
2. `vite.config.ts`: la clave `base` se **mantiene en `'./'`**. Las rutas relativas funcionan
   igual en `/carbos/`, en Pages y en un servidor local; el `manifest.webmanifest` ya usa
   `start_url`/`scope` relativos y el service worker se registra en `./sw.js` (scope `/carbos/`).
3. **Archivo nuevo** `.github/workflows/deploy.yml` (propuesto abajo).

### Workflow propuesto

```yaml
name: Deploy Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: make setup
      - run: make check
      - run: make build
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

El `ci.yml` actual se mantiene para PRs y ramas; en `main` este workflow repite `make check`
para no desplegar nunca un artefacto que no paso la puerta. Alternativa: disparar por
`workflow_run` sobre el CI verde (una sola ejecucion de checks, algo mas de latencia).

## Pesos fuera del repo (D18/D24)

Contrato: `public/model-manifest.json` (versionado en el repo, sin pesos) con una entrada por
modelo. Como la v1 es **multi-item** (D21), hay dos: **detector** y **clasificador**.

```json
{
  "detector": { "version": "...", "url": "...", "sha256": "...", "bytes": 0 },
  "classifier": { "version": "...", "url": "...", "sha256": "...", "bytes": 0, "classes": ["..."] }
}
```

- **Alojamiento**: **jsDelivr** (sobre una release o rama de pesos) o **GitHub Releases**. Ambos
  sirven con CORS permisivo (`Access-Control-Allow-Origin: *`).
- **Descarga diferida**: el usuario la pide; se muestra **tamano y progreso**; se guarda en
  Cache Storage `carbos-models-vN`.
- **Integridad**: tras descargar, `crypto.subtle.digest('SHA-256', ...)` debe coincidir con el manifest.
- **Service worker**: cachea **solo el app shell**; **excluye** las URLs de los pesos (esas las
  gestiona la app). Evita inflar el cache del SW y su reversion en cada build.
- **Cache-busting**: assets con hash (Vite ya lo hace) y el nombre del cache del SW atado a la
  version del build (inyectar `__BUILD__` o leer un `version.json` generado).
- **Repo de pesos**: si se usa jsDelivr, los binarios viven en un repo/release aparte del de la
  app; el codigo de Carbos solo referencia URL + sha256.

## Dominio personalizado (opcional)

Anadir `public/CNAME` con el dominio (p. ej. `carbos.app`), apuntar DNS a Pages y forzar HTTPS.
`base` se queda en `'./'`. No es necesario para la v1.

## Limitaciones y operacion

- **Limites de Pages**: ~1 GB de sitio y build acotado. Al mantener los pesos fuera, el
  artefacto son unos cientos de KB.
- **SPA**: hoy es una sola pagina; no hace falta `404.html`. Si en v1.1 entra routing, copiar
  `index.html` a `404.html` como fallback.
- **Rutas relativas**: cualquier futura ruta absoluta (`/foo`) rompe en un project site; usar
  relativas o `import.meta.env.BASE_URL`.
- **HTTPS**: lo da Pages y es requisito para camara, service worker y `storage.persist()`.
- **Rollback**: re-ejecutar un workflow anterior o revertir el commit en `main`.

## Checklist de despliegue

- [ ] Settings -> Pages -> Source = GitHub Actions
- [ ] Anadir `.github/workflows/deploy.yml`
- [ ] Verificar `base: './'`, `sw.js` y manifest relativos
- [ ] `https://foron23.github.io/carbos/` carga e instala como PWA
- [ ] El service worker no precachea los pesos
- [ ] (Cuando existan) publicar `model-manifest.json` con detector y clasificador (URL + sha256)
