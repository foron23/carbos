# 09 - Pase de UI/UX (v1)

> [!abstract] TL;DR
> Primer pase de usabilidad sobre la UI de Fase 1. Cinco cambios: **onboarding de primera apertura** (las tres pantallas acordadas), **aviso de "no es dispositivo médico" siempre visible**, **puerta de activación del módulo de insulina** con el aviso no descartable, **accesibilidad táctil y de teclado** (inputs de fichero enfocables, `inputmode` en los numéricos, alturas mínimas) y **bucle principal** (navegación de día, total pegajoso, Copia y Ajustes plegables, acuse al registrar, recordatorio de export).

## Contexto

La Fase 1 dejó el núcleo funcional (foto, catálogo, borrador, registro, insulina, export, i18n) pero la UI es una pila de siete `fieldset` en un solo scroll, sin onboarding, sin el aviso legal que fija D10 y con el módulo de dosis activable con una casilla sin confirmación. Además, los `input type=file` van `hidden`, así que no son alcanzables por teclado ni por lector de pantalla.

## Cambios

- `docs/specs/09-ui-ux.md` — esta spec.
- `src/i18n/index.ts` — claves nuevas en **es y en** (onboarding, aviso del pie, navegación de día, acuse de registro, recordatorio de export, puerta del módulo de insulina).
- `src/style.css` — `.sr-only`, `.notice`, cabecera pegajosa, `details` plegables, alturas táctiles mínimas, bloque de onboarding.
- `src/main.ts` — onboarding (una vez, `carbos.onboarded`), pie con el aviso, ficheros accesibles, `inputmode`/`autocomplete`, navegación de día, `details` para Copia y Ajustes, acuse al registrar, recordatorio de export.
- `src/insulin/ui.ts` — la casilla deja de activar el panel directamente: exige confirmación explícita en un aviso no descartable.

## Criterios de aceptación

1. En una instalación nueva, la primera apertura muestra tres pantallas (privacidad, borrado del navegador, alcance) y no vuelve a mostrarse tras pulsar "Empezar".
2. El aviso "no es un dispositivo médico ni ofrece consejo médico" es visible sin desplegar nada.
3. Activar el módulo de insulina exige confirmar un aviso que nombra la hipoglucemia; sin confirmar, el panel no se renderiza y la casilla vuelve a apagado.
4. Los dos `input type=file` son alcanzables con teclado (foco visible) y anuncian su propósito.
5. Los campos numéricos abren teclado numérico o decimal en móvil.
6. Se puede mover el día con anterior/siguiente/hoy sin abrir el selector de fecha.
7. Copia y Ajustes están plegados por defecto; el total del día es visible en todo momento.
8. Registrar una comida sin alimentos avisa en vez de no hacer nada; con alimentos, confirma.
9. Toda clave nueva existe en `es` y en `en` (el tipo `StringKey` lo impone).

## Tests

- Los existentes de `i18n` (si los hay) cubren la paridad de claves.
- `make check` verde (lint + typecheck + tests).
- `make e2e` cubre los escenarios actuales; no se añaden escenarios nuevos en este pase.

## Riesgos

- `main.ts` crece; el siguiente pase debería extraer la UI a módulos por pantalla (ya hay `src/insulin/ui.ts` como precedente).
- El onboarding se guarda en `localStorage`, que puede borrarse: si desaparece, vuelve a mostrarse una vez. Aceptable.
