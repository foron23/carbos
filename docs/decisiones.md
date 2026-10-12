# Decisiones de Carbos (D1-D32)

Registro de decisiones cerradas. Cada decision es una restriccion de diseno, no una preferencia.

## Nucleo (D1-D12)

| #   | Decision                | Detalle                                                                                                                                                                                                                                         |
| --- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Usuario**             | Adulto con diabetes tipo 1 que se autogestiona (una persona, un dispositivo, sin permisos de cuidador)                                                                                                                                          |
| D2  | **Cobertura de comida** | Tabla curada de alimentos y platos de uso diario en Espana (~150-300) y **el modelo solo reconoce esas clases**. Fuente: **plan B abierto** (USDA FDC CC0 + CIQUAL Licence Ouverte + curacion propia); BEDCA solo como referencia (**ver D19**) |
| D3  | **Medida**              | Set propio con bascula (30-60 platos espanoles) para decidir el producto + benchmark publico (Nutrition5k) para cifra comparable. En la v1 el set propio queda como deuda y se mide solo con el benchmark (**ver D25**)                         |
| D4  | **Sincronia**           | Un solo dispositivo. El **export manual** es la via de mover el diario. File System Access (copia automatica) aparcado                                                                                                                          |
| D5  | **Copia**               | JSON legible por defecto, con aviso claro, **mas opcion de export cifrado con contrasena**                                                                                                                                                      |
| D6  | **Health**              | Sin Apple Health ni Health Connect en v1 (una PWA no puede: no hay API web)                                                                                                                                                                     |
| D7  | **Modulo de dosis**     | Flag de configuracion opt-in desde la app, con el codigo **desacoplado como modulo** para que sacarlo del build sea un cambio de una linea                                                                                                      |
| D8  | **Interfaz**            | v1 por **botones**. Chat conversacional en **v1.1**, con el esquema de intenciones y el modelo de datos ya preparados                                                                                                                           |
| D9  | **Nombre**              | Carbos                                                                                                                                                                                                                                          |
| D10 | **Linea regulatoria**   | El calculo de dosis no es el proposito ni el nucleo. Uso previsto **no medico**; el modulo se activa por el usuario, con sus numeros, formula visible y sin recomendacion                                                                       |
| D11 | **Stack**               | PWA estatica sin backend. Vite + TypeScript, WebGPU con fallback a WASM, IndexedDB, service worker. Sin cuentas ni analitica                                                                                                                    |
| D12 | **Modelo**              | Detector/segmentador + clasificador sobre tabla local (no un VLM que escupa gramos). El LLM/VLM nunca esta en el camino del calculo                                                                                                             |

## Parametros cerrados (D13-D18)

| #   | Decision              | Detalle                                                                                                                              |
| --- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| D13 | **Licencia**          | AGPL-3.0 (copyleft fuerte: evita forks propietarios)                                                                                 |
| D14 | **Modelo y descarga** | Clasificador pequeno + tabla local, con los pesos en **descarga diferida** (10-25 MB una sola vez; usable en todos los dispositivos) |
| D15 | **Idiomas**           | ES y EN desde el inicio                                                                                                              |
| D16 | **Accesibilidad**     | Requisito de la v1: texto escalable, contraste alto, uso a una mano                                                                  |
| D17 | **Construccion**      | Maquina de trabajo; prueba en el movil; la Pi publica el estatico                                                                    |
| D18 | **Hosting**           | GitHub Pages (repo publico, sin backend) y los **pesos fuera del repo** (Hugging Face Hub o jsDelivr)                                |

## Parametros cerrados de Fase 1 (D19-D32)

| #   | Decision                    | Detalle                                                                                                                                                                                                                                                                                          |
| --- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D19 | **Datos**                   | **Plan B abierto**: las condiciones de BEDCA (no comercial, sin modificar, autorizacion expresa) **chocan con AGPL-3.0**; se descarta usar sus valores. Catalogo curado con **USDA FDC (CC0)** y **CIQUAL (Licence Ouverte)**, citando BEDCA solo como referencia (spike en `04-bedca-spike.md`) |
| D20 | **Modelo**                  | Arrancar con un **modelo publico correcto** (detector + clasificador); el **fine-tuning propio** queda documentado como la via para alinear las clases al catalogo                                                                                                                               |
| D21 | **Granularidad**            | **Multi-item** en v1: detector de alimentos + clasificador por region (alinea con D12)                                                                                                                                                                                                           |
| D22 | **Runtime**                 | `onnxruntime-web` con WebGPU y fallback WASM, en Web Worker                                                                                                                                                                                                                                      |
| D23 | **Export cifrado**          | **Argon2 (wasm)** para derivar clave + AES-GCM; sobre versionado con parametros KDF                                                                                                                                                                                                              |
| D24 | **Pesos**                   | Fuera del repo en **jsDelivr / GitHub Releases**; manifest con URL, sha256, bytes y version                                                                                                                                                                                                      |
| D25 | **Medida v1**               | Benchmark externo (**Nutrition5k**) en la v1; el set propio pesado con bascula queda como deuda posterior                                                                                                                                                                                        |
| D26 | **Catalogo**                | **Empaquetado** en el build (decenas de KB); solo los pesos salen del repo                                                                                                                                                                                                                       |
| D27 | **Detector**                | **Cajas (bounding boxes)**, no mascaras: suficiente para ubicar y contar items, mas barato                                                                                                                                                                                                       |
| D28 | **Eleccion de modelo**      | **Shortlist + benchmark**: probar varios publicos en Nutrition5k y elegir por error y tamano                                                                                                                                                                                                     |
| D29 | **Argon2**                  | Libreria **hash-wasm** (argon2id), WASM pequeno y mantenido                                                                                                                                                                                                                                      |
| D30 | **BEDCA**                   | **Spike cerrado (2026-10-12)**: condiciones incompatibles con AGPL-3.0; se resuelve por **plan B abierto** (ver D19)                                                                                                                                                                             |
| D31 | **Clases v1**               | Mapeo de las clases de un **modelo publico** al catalogo; sin mapeo, **"desconocido"** -> seleccion manual del usuario                                                                                                                                                                           |
| D32 | **Fine-tuning por defecto** | **Cabeza nueva (linear probe)** sobre backbone preentrenado; la **destilacion** queda documentada como siguiente paso, **fuera de la Fase 1** (ver `specs/07-finetuning.md`, `specs/08-linear-probe.md`)                                                                                         |

## La linea regulatoria

El estatus legal lo deciden el **uso previsto** y la **funcion**, no el precio ni la licencia. Dos salidas honestas y ninguna tercera: no calcular dosis (limpio) o calcularla en la tradicion OS-AID (OpenAPS, AndroidAPS: abierta, sin claims medicos, bajo responsabilidad del usuario, zona tolerada y no exencion legal). Carbos toma la primera como nucleo y deja la segunda como modulo separable.

**La foto nunca produce unidades.** Produce carbohidratos y muestra la incertidumbre. La regla que se puede vigilar en el codigo: no existe ningun camino de la estimacion a una dosis sin confirmacion explicita de la persona sobre los gramos.

**Reglas del modulo gris**, si se activa: los numeros los pone el usuario (vienen de su equipo medico, la app no los propone ni los ajusta); muestra la formula y los numeros, no solo el resultado; nunca recomienda ("la aritmetica que has pedido", no "debes ponerte X"); aviso no descartable de hipoglucemia y de que no es dispositivo ni consejo medico; sin tienda ni marketing de dosis. El nombre y el texto deciden el estatus: "diario de carbohidratos y registro de insulina" es limpio; "calculadora de bolus" es regulado.

## Textos y reglas de redaccion

- Nombre y etiqueta: **Carbos** · "Cuenta carbohidratos. En tu dispositivo, y solo en tu dispositivo."
- Prohibido como nombre o claim: "bolus", "calculadora de insulina", "dosis", "prescripcion".
- Reglas: nunca "dosis", "recomendamos", "deberias ponerte", "seguro", "preciso". Siempre "estimacion", "registro", "aritmetica", "tus numeros", "revisa y ajusta", "tu equipo medico".
