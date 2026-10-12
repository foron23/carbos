# SPEC 02 - Fase 1: nucleo (v1, lado limpio)

> [!abstract] TL;DR
> La v1 lleva de **foto a carbohidratos registrados** sin backend: captura, **detector +
> clasificador locales multi-item** sobre un **conjunto cerrado de clases** atado a una tabla
> curada, porcion por defecto mas ajuste, diario, registro de insulina (solo registro), export
> JSON y **cifrado con Argon2**, PWA offline, ES/EN y accesibilidad. **Cierra** con el error
> medido sobre un **benchmark externo** y publicado, dejando el set propio como deuda declarada,
> y con la app entera funcionando **sin** el modulo de dosis ([`01-roadmap.md`](01-roadmap.md)).

Fase 0 dejo el esqueleto, el dominio puro, el esquema Zod versionado, el export JSON y el
modulo de insulina opt-in. Fase 1 pone el nucleo que da sentido al producto.

Parametros de Fase 1 cerrados el 2026-10-12 (D19-D32), ver [`../decisiones.md`](../decisiones.md).

## Estado (2026-10-12)

Hecho: **E1** catalogo (154 alimentos, `make catalog`), **E2** mapa de clases (`classmap.ts`),
**E5** captura, **E7** diario (dia/comida/semana), **E8** registro de insulina, **E9** export JSON
y cifrado (Argon2id + AES-GCM), **E10** PWA offline, **E11** i18n ES/EN, **E4** runtime de
inferencia (ONNX en Web Worker, WebGPU/WASM, descarga con sha256 y cache) y la migracion de esquema
1->2. Pendiente: **E3** pesos publicados (sin ellos la deteccion degrada a entrada manual), **E6**
porciones guiadas por la foto, **E12** auditoria de accesibilidad, **E13/E14** banco y publicacion
del error (Nutrition5k). Ver [`05-benchmark.md`](05-benchmark.md), [`06-runtime.md`](06-runtime.md).

## Herencia de Fase 0 (deuda declarada)

El roadmap situa en Fase 0 la **tabla BEDCA curada** y el **set de medida con bascula**. En el
repo desplegado no estan: son datos, no codigo.

- **Tabla curada**: Fase 1 la produce como E1. El spike de BEDCA se cerro el 2026-10-12 en
  **plan B abierto** (D19/D30, [`04-bedca-spike.md`](04-bedca-spike.md)): no se usan valores
  BEDCA por incompatibilidad con AGPL; se cura con **USDA FDC (CC0) + CIQUAL (Licence Ouverte)**.
- **Set propio**: no existe. Por D25 la v1 mide sobre **benchmark externo (Nutrition5k)** y el set
  propio con bascula queda como **deuda declarada** de una fase posterior.

## Decisiones de Fase 1 (D19-D32)

| #   | Decision                    | Detalle                                                                                                                                                                                                  |
| --- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D19 | **Datos**                   | **Plan B abierto**: BEDCA es incompatible con AGPL-3.0; catalogo curado con **USDA FDC (CC0)** y **CIQUAL (Licence Ouverte)**, citando BEDCA solo como referencia                                        |
| D20 | **Modelo**                  | Partir de un **modelo publico correcto** (detector + clasificador); el **fine-tuning propio** queda documentado como la via para alinear las clases al catalogo ([`07-finetuning.md`](07-finetuning.md)) |
| D21 | **Granularidad**            | **Multi-item** en v1: detector de alimentos + clasificador por region (alinea con D12)                                                                                                                   |
| D22 | **Runtime**                 | `onnxruntime-web` con WebGPU y fallback WASM, corriendo en un Web Worker ([`06-runtime.md`](06-runtime.md))                                                                                              |
| D23 | **Export cifrado**          | **Argon2 (wasm)** para derivar clave + AES-GCM; sobre versionado con sus parametros KDF                                                                                                                  |
| D24 | **Pesos**                   | Fuera del repo: **jsDelivr / GitHub Releases**; manifest con URL, sha256, bytes y version                                                                                                                |
| D25 | **Medida v1**               | Benchmark externo (Nutrition5k) en la v1; set propio pesado como deuda posterior ([`05-benchmark.md`](05-benchmark.md))                                                                                  |
| D26 | **Catalogo**                | Empaquetado en el build (decenas de KB); solo los pesos salen del repo                                                                                                                                   |
| D27 | **Detector**                | **Cajas (bounding boxes)**, no mascaras: suficiente para ubicar y contar items, mas barato                                                                                                               |
| D28 | **Eleccion de modelo**      | **Shortlist + benchmark**: probar varios publicos en Nutrition5k y elegir por error y tamano                                                                                                             |
| D29 | **Argon2 lib**              | **hash-wasm** (argon2id), WASM pequeno y mantenido                                                                                                                                                       |
| D30 | **BEDCA**                   | **Spike cerrado (2026-10-12)**: condiciones incompatibles con AGPL; se resuelve por **plan B abierto** (D19)                                                                                             |
| D31 | **Clases v1**               | Mapeo de las clases de un **modelo publico** al catalogo; sin mapeo, **"desconocido"** -> seleccion manual                                                                                               |
| D32 | **Fine-tuning por defecto** | **Cabeza nueva (linear probe)**; pipeline en `training/` y targets de `make` ([`08-linear-probe.md`](08-linear-probe.md)). **Destilacion fuera de la Fase 1**                                            |

## Entregables

| #   | Entregable                    | Que es                                                                                                                                                                                                      | Depende de       |
| --- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| E1  | **Catalogo de alimentos**     | 150-300 alimentos y platos (ES) con carbohidratos/100 g, porcion por defecto, nombres ES/EN y sinonimos. Datos + esquema Zod. Fuente **plan B abierto** (USDA/CIQUAL, D19).                                 | -                |
| E2  | **Detector + mapa de clases** | Detector de alimentos por **cajas** (D27, multi-item) + indice clase -> id del catalogo. Define el conjunto cerrado (D2/D21).                                                                               | E1, modelos      |
| E3  | **Manifests de modelos**      | `model-manifest.json` con **detector** y **clasificador**: URL, sha256, bytes, version y clases. Pesos **fuera del repo** (D24).                                                                            | Modelos elegidos |
| E4  | **Runtime de inferencia**     | `onnxruntime-web` (WebGPU -> WASM) en Web Worker; descarga diferida + cache; inferencia multi-region.                                                                                                       | E3               |
| E5  | **Captura**                   | Camara o fichero, reescalado, orientacion EXIF. La imagen **nunca** sale del dispositivo.                                                                                                                   | -                |
| E6  | **Porciones + confianza**     | Un item por region detectada; porcion por defecto por clase; seleccion y ajuste por item; top-k a la vista; texto "revisa y ajusta los gramos".                                                             | E2, E4           |
| E7  | **Diario**                    | Hoy, historico, totales por dia, comida y semana.                                                                                                                                                           | -                |
| E8  | **Registro de insulina**      | Anadir y listar lo ya puesto. **Solo registro, nunca calculado.**                                                                                                                                           | -                |
| E9  | **Export cifrado**            | JSON legible (hecho) + export con contrasena (Argon2 + AES-GCM, D23). Import detecta sobre/cifrado.                                                                                                         | -                |
| E10 | **PWA offline**               | Service worker, instalable, aviso de almacenamiento y empujon a exportar, `storage.persist()`.                                                                                                              | -                |
| E11 | **i18n ES/EN**                | Todas las cadenas por locale, selector, idioma por `navigator.language`.                                                                                                                                    | -                |
| E12 | **Accesibilidad**             | Texto escalable (rem), contraste alto, una mano, objetivos tactiles >= 44 px, ARIA, `prefers-reduced-motion`.                                                                                               | E7-E11           |
| E13 | **Banco de medida**           | Arnes que corre deteccion + clasificacion sobre **Nutrition5k** y calcula MAE de gramos y de carbohidratos; deja listo el runner para el set propio futuro. Diseno en [`05-benchmark.md`](05-benchmark.md). | E1, E4           |
| E14 | **Publicacion de la medida**  | Resultado sobre el benchmark externo publicado en el repo, con la **deuda del set propio** declarada.                                                                                                       | E13              |

## Olas (orden y paralelismo)

- **O0 - Despliegue**: Pages en marcha ([`03-despliegue.md`](03-despliegue.md)) para probar cada ola en el movil por URL.
- **O1 - Datos** (E1, E2, E3): bloquea inferencia y porciones. Spike BEDCA cerrado en **plan B** (D19); despues catalogo con USDA/CIQUAL y **shortlist de modelos publicos** evaluada en Nutrition5k (D28).
- **O2 - Deteccion + clasificacion** (E5, E4): captura + runtime + worker. Hito: una foto devuelve **N clases** del catalogo. Diseno en [`06-runtime.md`](06-runtime.md).
- **O3 - Registro** (E6, E7, E8): el flujo foto -> items -> entrada del diario/insulina.
- **O4 - Datos del usuario** (E9, E10): export cifrado y PWA offline.
- **O5 - Idioma y acceso** (E11, E12): extraccion de cadenas y pasada de accesibilidad.
- **O6 - Medida** (E13, E14): arnes sobre benchmark, publicacion. Cierra la fase.

## Cambios de modelo de datos

- `SCHEMA_VERSION` sube a **2** con migracion `1 -> 2` en `core`.
- `Meal` gana metadatos de inferencia: `origin: 'manual' | 'photo'` y
  `model?: { detector: string; classifier: string; topk: { classId: string; p: number }[] }`.
  El array `items` ya soporta **multi-item**; cada `FoodItem` gana `classId?: string`.
- Nuevos tipos en `src/catalog/`: `Food` (id, `name.es`, `name.en`, `synonyms`, `carbsPer100g`,
  `defaultPortionGrams`, `source`), con esquema Zod y version propia.
- Nuevo tipo de **sobre de export cifrado**:
  `{ format: 'carbos-enc', version, kdf: { name: 'argon2id', salt, m, t, p }, cipher, iv, data }`.
- El **catalogo es dato de app**, no parte del `Vault`: no viaja en el export del usuario.

## Aceptacion por entregable (resumen)

| #   | Criterio verificable                                                                                                    |
| --- | ----------------------------------------------------------------------------------------------------------------------- |
| E1  | >= 150 entradas validas por Zod; todas con porcion por defecto; fuentes del **plan B** trazables (USDA/CIQUAL/propia)   |
| E2  | Todo id del mapa existe en el catalogo; test que lo comprueba; el detector devuelve regiones sobre una imagen de prueba |
| E3  | Ambos manifests parsean; sha256 de los pesos descargados coincide                                                       |
| E4  | Una imagen de prueba detecta y clasifica en WebGPU y en WASM; los pesos se cachean (segunda carga sin red)              |
| E5  | Foto de camara y de fichero entran; EXIF aplicado; sin peticiones de red con la imagen                                  |
| E6  | Toda clase tiene porcion por defecto; multi-item seleccionable y ajustable antes de registrar; confianza visible        |
| E7  | Totales por dia/comida/semana coinciden con `totals.ts`; test                                                           |
| E8  | Se anade y lista insulina; ningun valor calculado por la app                                                            |
| E9  | Export cifrado abre con la contrasena correcta y falla con la incorrecta; import reconoce ambos formatos                |
| E10 | App funciona offline tras la primera carga; instalable; aviso de almacenamiento visible                                 |
| E11 | No queda ninguna cadena literal en la UI; cambiar idioma re-renderiza; ES y EN completos                                |
| E12 | Auditoria: contraste AA, zoom de texto al 200 %, controles a una mano, sin `aria-*` rotos                               |
| E13 | `make eval` produce MAE de gramos y de carbohidratos sobre el benchmark externo                                         |
| E14 | Cifra publicada en README/results, con benchmark, fecha y la deuda del set propio                                       |

## Reglas que Fase 1 no puede romper

- **La foto nunca produce unidades.** Producen carbohidratos y muestran incertidumbre; ningun
  camino de la estimacion a una dosis sin confirmacion explicita de la persona sobre los gramos.
- **El numero de insulina sale de la formula, nunca del modelo.** (Aqui solo hay registro.)
- **Textos** segun `docs/decisiones.md`: nunca "dosis", "recomendamos", "seguro", "preciso";
  siempre "estimacion", "registro", "aritmetica", "tus numeros", "revisa y ajusta".
- **Pesos fuera del repo** y fuera del artefacto de Pages (D18/D24).
- **Metrica honesta antes que feature**: si un numero no se mide, no se afirma.

## Fine-tuning del modelo (caso de uso documentado, D20)

La v1 arranca con un **modelo publico correcto**, pero su vocabulario de clases **no coincide**
con el catalogo. La via para cerrar esa brecha, cuando la precision lo exija, es el fine-tuning
propio. Opciones, esfuerzo, riesgo y escalera de decision en [`07-finetuning.md`](07-finetuning.md);
proceso por defecto y como ejecutarlo en [`08-linear-probe.md`](08-linear-probe.md).
El camino por defecto (D32) es la **cabeza nueva**, ya esbozada y ejecutable con `make`
([`08-linear-probe.md`](08-linear-probe.md)); la **destilacion** queda fuera de la Fase 1.

- **Cuando**: si la **shortlist evaluada en Nutrition5k** (D28) queda por debajo del umbral honesto de mapeo clase a clase.
- **Datos**: el set propio pesado (hoy inexistente, ver D25) + etiquetas del catalogo; aumento de
  datos desde el benchmark publico.
- **Proceso**: partir del detector/clasificador publico, reemplazar la cabeza por las clases del
  catalogo, exportar a ONNX, publicar pesos nuevos en jsDelivr/Releases con sha256 (D24).
- **Contrato**: el manifest (E3) no cambia de forma; solo cambian URL, version y lista de clases.
- **Regla**: el modelo sigue **sin** producir unidades ni gramos; solo clase y confianza.

## Riesgos

- **Error de porcion** (riesgo principal): mitigado con porcion por defecto + ajuste + incertidumbre a la vista.
- **Multi-item** (D21): mas falsos positivos/negativos y mas coste; mitigado con umbral de confianza y seleccion manual de regiones.
- **Alineacion de clases**: un modelo publico no habla el idioma del catalogo; mitigado por el mapeo (E2) y el fine-tuning documentado (D20).
- **Fuentes de datos**: BEDCA descartada por licencia; mitigado con USDA/CIQUAL y curacion propia trazable (D19).
- **iOS**: WebGPU inestable y almacenamiento que se borra a los 7 dias; mitigado con PWA, aviso y export.
- **Descarga de pesos en datos moviles**: mostrar tamano y progreso, cachear una sola vez.

## Delta frente al roadmap (a reconciliar)

- El roadmap situa en Fase 0 la **tabla BEDCA curada**. Se sustituye por el **plan B abierto**
  (USDA/CIQUAL + curacion propia, D19); BEDCA solo como referencia.
- El roadmap pide "MAE medido sobre el **set propio**". La v1 cierra con **benchmark externo** y
  set propio como deuda (D25). Actualizar el criterio de done de Fase 1 en [`01-roadmap.md`](01-roadmap.md).
- El roadmap dice "la salida cae dentro del conjunto cerrado" (singular). La v1 es **multi-item**
  (D21): N regiones, cada una en el conjunto cerrado.
