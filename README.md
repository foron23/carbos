# Carbos

Contador de carbohidratos **on-device**. PWA estatica, sin backend, sin cuentas y
sin analitica: la foto estima, tu confirmas y ajustas, la app registra. Nada sale
de tu dispositivo.

> Cuenta carbohidratos. En tu dispositivo, y solo en tu dispositivo.

- Diseno y decisiones: [`docs/decisiones.md`](docs/decisiones.md)
- Plan por fases: [`docs/specs/01-roadmap.md`](docs/specs/01-roadmap.md)
- Fase 1 (nucleo): [`docs/specs/02-fase1.md`](docs/specs/02-fase1.md)
- Despliegue (GitHub Pages): [`docs/specs/03-despliegue.md`](docs/specs/03-despliegue.md)
- Contrato de trabajo: [`docs/receta-de-codigo.md`](docs/receta-de-codigo.md)

## Estado

Fase 1 (nucleo) en marcha. Ya estan: **catalogo curado** (154 alimentos, generado desde Ciqual
2020 con `make catalog`), diario con totales por dia/comida/semana, registro de insulina,
**captura de foto on-device**, export JSON y **export cifrado** (Argon2id + AES-GCM), **ES/EN**,
PWA offline e instalable y migracion de esquema. **Pendiente**: el clasificador de foto (runtime
ONNX con los pesos fuera del repo) y la medida del error sobre Nutrition5k.

Detalle por entregable: [`docs/specs/02-fase1.md`](docs/specs/02-fase1.md).

## Arranque

```bash
make setup    # npm install
make dev      # servidor de desarrollo
make check    # format + lint + tests
```

## Licencia

AGPL-3.0-or-later. Ver [`LICENSE`](LICENSE).
