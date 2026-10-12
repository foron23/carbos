# Carbos

Contador de carbohidratos **on-device**. PWA estatica, sin backend, sin cuentas y
sin analitica: la foto estima, tu confirmas y ajustas, la app registra. Nada sale
de tu dispositivo.

> Cuenta carbohidratos. En tu dispositivo, y solo en tu dispositivo.

- Diseno y decisiones: [`docs/decisiones.md`](docs/decisiones.md)
- Plan por fases: [`docs/specs/01-roadmap.md`](docs/specs/01-roadmap.md)
- Fase 1 (nucleo): [`docs/specs/02-fase1.md`](docs/specs/02-fase1.md)
- Despliegue (GitHub Pages): [`docs/specs/03-despliegue.md`](docs/specs/03-despliegue.md)
- Experimento (benchmark): [`docs/specs/09-experimento.md`](docs/specs/09-experimento.md)
- Contrato de trabajo: [`docs/receta-de-codigo.md`](docs/receta-de-codigo.md)

## Estado

Fase 1 (nucleo) en marcha. Ya estan: **catalogo curado** (154 alimentos, generado desde Ciqual
2020 con `make catalog`), diario con totales por dia/comida/semana, registro de insulina,
**captura de foto on-device**, export JSON y **export cifrado** (Argon2id + AES-GCM), **ES/EN**,
PWA offline e instalable y migracion de esquema. Ya esta el **runtime de inferencia** (ONNX en Web
Worker, WebGPU con fallback WASM, descarga diferida con sha256 y cache, manifest en
`public/model-manifest.example.json`) y el **banco de medida** sobre Nutrition5k (`make eval`).
**Pendiente**: elegir y publicar los **pesos reales** (D28; hoy no existe el repo de pesos, asi que
la deteccion degrada a entrada manual) y correr el banco con ellos. Para probar el flujo de foto en
local sin pesos: `make smoke-models`.

Detalle por entregable: [`docs/specs/02-fase1.md`](docs/specs/02-fase1.md).

## Arranque

```bash
make setup    # npm install
make dev      # servidor de desarrollo
make check    # format + lint + tests
```

## Licencia

AGPL-3.0-or-later. Ver [`LICENSE`](LICENSE).
