# SPEC 01 - Roadmap de Carbos

> [!abstract] TL;DR
> Cuatro tramos, cada uno cierra con un criterio verificable. **Fase 0** cimientos (tabla curada, set de medida con bascula, esqueleto, CI). **Fase 1** nucleo limpio (foto a carbohidratos, diario, registro de insulina, export). **Fase 2** modulo de dosis opt-in y aislado. **Fase 3** chat, en la v1.1. Parametros cerrados el 2026-10-11: **AGPL-3.0**, clasificador pequeno con **descarga diferida**, **ES y EN**, **accesibilidad** en la v1, build en la maquina de trabajo y **hosting en GitHub Pages** con los pesos fuera del repo.

## Parametros cerrados (D13-D18)

| #   | Decision          | Detalle                                                                                                                               |
| --- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| D13 | **Licencia**      | AGPL-3.0 (copyleft fuerte; evita forks propietarios, sobre todo del modulo de dosis)                                                  |
| D14 | **Modelo**        | Clasificador pequeno (MobileNetV4 / EfficientNet-Lite0) + tabla local, con los pesos en **descarga diferida** (10-25 MB una sola vez) |
| D15 | **Idiomas**       | ES y EN desde el inicio                                                                                                               |
| D16 | **Accesibilidad** | Requisito de la v1: texto escalable, contraste alto, uso a una mano                                                                   |
| D17 | **Construccion**  | Maquina de trabajo (Vite en local); prueba en el movil; la Pi solo publica el estatico                                                |
| D18 | **Hosting**       | GitHub Pages (repo publico, sin backend) y los **pesos fuera del repo** (Hugging Face Hub o jsDelivr)                                 |

## Fase 0 - Cimientos

Lo que desbloquea todo lo demas.

- **Tabla curada**: 150-300 alimentos y platos con carbohidratos por 100 g y porcion por defecto. Fuente por **plan B abierto** (USDA FDC CC0 + CIQUAL Licence Ouverte + curacion propia, D19); BEDCA solo como referencia.
- **Set de medida**: 30-60 platos fotografiados y pesados con bascula, con su esquema de etiquetas (plato, items, gramos, carbohidratos). Es lo que permite publicar un MAE honesto.
- **Esqueleto**: Vite + TypeScript estricto, lint, Vitest, PWA minima, IndexedDB con **esquema versionado** y Zod para import/export, export JSON.
- **CI**: build y `make check` en GitHub Actions, publicacion a Pages desde el repo (los pesos, aparte).

_Criterio de done:_ `make check` verde y una app vacia que guarda una entrada y la exporta en JSON.

## Fase 1 - Nucleo (v1, lado limpio)

Desglose en entregables, olas y criterios de aceptacion: [`02-fase1.md`](02-fase1.md).
Modo de publicacion: [`03-despliegue.md`](03-despliegue.md).

_Estado (2026-10-12):_ catalogo, diario, registro de insulina, captura, export JSON y cifrado,
i18n ES/EN y PWA offline ya implementados. Pendiente: el clasificador de foto (O2) y la medida
del error (O6).

- **Captura**: camara o fichero; la imagen va al detector + clasificador local; la salida de cada region cae dentro del conjunto cerrado de clases (**multi-item**, D21).
- **Porciones**: porcion por defecto por clase mas ajuste del usuario, con la confianza a la vista y el texto "revisa y ajusta los gramos".
- **Diario**: Hoy, historico, totales por dia, comida y semana.
- **Registro de insulina**: lo que ya se ha puesto, nunca calculado.
- **Export**: JSON legible y export cifrado con contrasena.
- **PWA**: offline, instalable, aviso de almacenamiento del navegador y empujon a exportar.
- **Textos y avisos**: los ya redactados, en ES y EN.
- **Accesibilidad desde el inicio** (texto escalable, contraste, una mano).

_Criterio de done:_ error medido sobre el **benchmark externo** (Nutrition5k) y **publicado** (el set propio pesado queda como deuda, D25); la app funciona entera sin el modulo de dosis.

## Fase 2 - Modulo de dosis (opt-in, separado)

- **Aritmetica como funcion pura** con vectores fijos y tests golden de los casos limite (ratio, correccion, objetivo, IOB si algun dia entra).
- **UI**: tus numeros (los pone el usuario, vienen de su equipo medico), formula visible, avisos no descartables, guardar en el registro.
- **Aislamiento real**: modulo desacoplado y flag opt-in, para que sacarlo del build sea un cambio de una linea.

_Criterio de done:_ el build limpio no expone el modulo y los tests de la formula cubren los limites.

## Fase 3 - Chat (v1.1)

- **Esquema de intenciones** con Zod y validacion antes de ejecutar; tarjetas de confirmacion (propone, no ejecuta).
- **LLM on-device** (Qwen2.5-1.5B-Instruct o el nivel ligero) con carga diferida y descarga de pesos.
- **Degradacion**: se oculta si el dispositivo no aguanta (iPhone incluido).

_Criterio de done:_ intenciones correctas en ES y EN por encima del umbral que fije Foron, y el chat nunca en el camino del calculo.

## Transversal

- **Metrica honesta antes que feature**: si un numero no se puede medir, no se afirma.
- El numero de insulina sale siempre de la formula, **nunca del modelo**.
- CI con verificacion y revision de textos contra las reglas de redaccion en cada pantalla.

## Riesgos

- **Precision en el mundo real**: el error de porcion es el riesgo principal; mitigado con la porcion por defecto mas el ajuste del usuario.
- **iOS**: sin Health, WebGPU inestable y almacenamiento que se borra a los 7 dias; mitigado con instalacion como PWA, aviso y export.
- **El modulo de dosis viaja en el mismo artefacto** (flag, no build aparte): el argumento limpio lo sostienen el desacoplamiento y los textos.
- **Ancho de banda de Pages** si el proyecto crece: mitigado llevando los pesos a CDN (Hugging Face o jsDelivr).
