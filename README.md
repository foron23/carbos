# Carbos

Contador de carbohidratos **on-device**. PWA estatica, sin backend, sin cuentas y
sin analitica: la foto estima, tu confirmas y ajustas, la app registra. Nada sale
de tu dispositivo.

> Cuenta carbohidratos. En tu dispositivo, y solo en tu dispositivo.

- Diseno y decisiones: [`docs/decisiones.md`](docs/decisiones.md)
- Plan por fases: [`docs/specs/01-roadmap.md`](docs/specs/01-roadmap.md)
- Contrato de trabajo: [`docs/receta-de-codigo.md`](docs/receta-de-codigo.md)

## Estado

Fase 0 (cimientos): esqueleto, dominio puro, esquema versionado con Zod, export
JSON y modulo de insulina opt-in y aislado. El clasificador de foto llega en Fase 1.

## Arranque

```bash
make setup    # npm install
make dev      # servidor de desarrollo
make check    # format + lint + tests
```

## Licencia

AGPL-3.0-or-later. Ver [`LICENSE`](LICENSE).
