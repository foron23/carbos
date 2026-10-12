# Decisiones de Carbos (D1-D18)

Registro de decisiones cerradas. Cada decision es una restriccion de diseno, no una preferencia.

## Nucleo (D1-D12)

| # | Decision | Detalle |
|---|---|---|
| D1 | **Usuario** | Adulto con diabetes tipo 1 que se autogestiona (una persona, un dispositivo, sin permisos de cuidador) |
| D2 | **Cobertura de comida** | Tabla espanola curada (BEDCA, ~150-300 alimentos y platos de uso diario) y **el modelo solo reconoce esas clases** |
| D3 | **Medida** | Set propio con bascula (30-60 platos espanoles) para decidir el producto + benchmark publico (Nutrition5k) para cifra comparable |
| D4 | **Sincronia** | Un solo dispositivo. El **export manual** es la via de mover el diario. File System Access (copia automatica) aparcado |
| D5 | **Copia** | JSON legible por defecto, con aviso claro, **mas opcion de export cifrado con contrasena** |
| D6 | **Health** | Sin Apple Health ni Health Connect en v1 (una PWA no puede: no hay API web) |
| D7 | **Modulo de dosis** | Flag de configuracion opt-in desde la app, con el codigo **desacoplado como modulo** para que sacarlo del build sea un cambio de una linea |
| D8 | **Interfaz** | v1 por **botones**. Chat conversacional en **v1.1**, con el esquema de intenciones y el modelo de datos ya preparados |
| D9 | **Nombre** | Carbos |
| D10 | **Linea regulatoria** | El calculo de dosis no es el proposito ni el nucleo. Uso previsto **no medico**; el modulo se activa por el usuario, con sus numeros, formula visible y sin recomendacion |
| D11 | **Stack** | PWA estatica sin backend. Vite + TypeScript, WebGPU con fallback a WASM, IndexedDB, service worker. Sin cuentas ni analitica |
| D12 | **Modelo** | Detector/segmentador + clasificador sobre tabla local (no un VLM que escupa gramos). El LLM/VLM nunca esta en el camino del calculo |

## Parametros cerrados (D13-D18)

| # | Decision | Detalle |
|---|---|---|
| D13 | **Licencia** | AGPL-3.0 (copyleft fuerte: evita forks propietarios) |
| D14 | **Modelo y descarga** | Clasificador pequeno + tabla local, con los pesos en **descarga diferida** (10-25 MB una sola vez; usable en todos los dispositivos) |
| D15 | **Idiomas** | ES y EN desde el inicio |
| D16 | **Accesibilidad** | Requisito de la v1: texto escalable, contraste alto, uso a una mano |
| D17 | **Construccion** | Maquina de trabajo; prueba en el movil; la Pi publica el estatico |
| D18 | **Hosting** | GitHub Pages (repo publico, sin backend) y los **pesos fuera del repo** (Hugging Face Hub o jsDelivr) |

## La linea regulatoria

El estatus legal lo deciden el **uso previsto** y la **funcion**, no el precio ni la licencia. Dos salidas honestas y ninguna tercera: no calcular dosis (limpio) o calcularla en la tradicion OS-AID (OpenAPS, AndroidAPS: abierta, sin claims medicos, bajo responsabilidad del usuario, zona tolerada y no exencion legal). Carbos toma la primera como nucleo y deja la segunda como modulo separable.

**La foto nunca produce unidades.** Produce carbohidratos y muestra la incertidumbre. La regla que se puede vigilar en el codigo: no existe ningun camino de la estimacion a una dosis sin confirmacion explicita de la persona sobre los gramos.

**Reglas del modulo gris**, si se activa: los numeros los pone el usuario (vienen de su equipo medico, la app no los propone ni los ajusta); muestra la formula y los numeros, no solo el resultado; nunca recomienda ("la aritmetica que has pedido", no "debes ponerte X"); aviso no descartable de hipoglucemia y de que no es dispositivo ni consejo medico; sin tienda ni marketing de dosis. El nombre y el texto deciden el estatus: "diario de carbohidratos y registro de insulina" es limpio; "calculadora de bolus" es regulado.

## Textos y reglas de redaccion

- Nombre y etiqueta: **Carbos** · "Cuenta carbohidratos. En tu dispositivo, y solo en tu dispositivo."
- Prohibido como nombre o claim: "bolus", "calculadora de insulina", "dosis", "prescripcion".
- Reglas: nunca "dosis", "recomendamos", "deberias ponerte", "seguro", "preciso". Siempre "estimacion", "registro", "aritmetica", "tus numeros", "revisa y ajusta", "tu equipo medico".
