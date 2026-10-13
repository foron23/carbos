# 16 - Pase de UI/UX v2: distribucion, movimiento y movil

> [!abstract] TL;DR
> Segundo pase de UI/UX sobre la app de Fase 1. Endereza la **distribucion** (cabecera pegajosa compacta que fija solo el total y una mini-semana, mas una **superficie de entrada unica Foto | Buscar** con un borrador compartido), introduce un **sistema de movimiento por tokens** (aditivo, nunca unico portador de significado, con el interruptor global de `prefers-reduced-motion` intacto) y **optimiza el movil** (safe-area de la PWA instalada, objetivos tactiles, foco bajo la cabecera, teclado del buscador). De paso cierra los hallazgos verificados de la auditoria: doble registro, contraste de las etiquetas de deteccion, onboarding que no es un dialogo, recordatorio de copia plegado y fallo de imagen silencioso.

## Contexto

La spec `09-ui-ux.md` dejo la UI como una pila de siete `fieldset` en un unico scroll sin recortar, y `13-atajos-y-dia.md` (D37) metio las barras de la semana dentro de la cabecera. Funciona, pero la auditoria de UI/UX de esta iteracion (fleet de subagentes + verificacion adversarial sobre `src/main.ts`, `src/style.css`, `src/insulin/ui.ts`, `index.html` y las capturas E2E) encontro defectos verificados que ni el paso 09 ni el 13 cubrian:

- **El ciclo de anadir comida cruza una tarjeta.** `applyDetections()` empuja items al borrador (`main.ts`), pero el borrador se pinta en la tarjeta _siguiente_. En un 320 px, "foto -> revisar -> ajustar -> registrar" cuesta ~una pantalla de scroll entre la causa y el efecto.
- **La superficie fija pina de mas.** La cabecera pegajosa incluye el total, la semana entera y el selector de fecha; el requisito (spec 09 §7) es que solo el total sea visible siempre.
- **El aviso legal vive solo en el pie**, a dos o tres pantallas de scroll, aunque la regla la exige visible sin desplegar nada.
- **Sin safe-area.** `index.html` declara `viewport-fit=cover` y el manifest es `standalone`, pero el CSS no usa `env(safe-area-inset-*)`: en la PWA instalada el total y el pie caen bajo la muesca/el indicador.
- **Doble registro.** Registrar comida o insulina no bloquea el boton mientras la escritura async esta en vuelo; dos toques rapidos duplican el registro (carbohidratos contados dos veces).
- **Contraste AA.** Las etiquetas de las cajas de deteccion son blanco sobre el color de caja; tres de las seis paletas no llegan a 4.5:1 con texto de 0.72rem.
- **El onboarding no es un dialogo**: no mueve el foco ni pone el fondo `inert`; su `align-content:center` con `overflow` deja el primer paso inalcanzable en pantallas bajas.
- **Copia sin aviso**: el recordatorio de exportacion esta `hidden` dentro del `<details>` plegable y solo se evalua al arrancar.
- **Foto sin error**: un fallo al procesar la imagen se traga con `.catch(() => {})`; la app se queda muda.
- **Sin movimiento util**: existe **una sola** transicion (`.btn`) y **cero** `@keyframes`; las barras de la semana, las cajas de deteccion y el progreso de deteccion no comunican nada.

### Hallazgos descartados (no tocar)

La verificacion adversarial (con reproduccion propia en Firefox del caso de `position:sticky` en un item de grid) descarto tres falsos positivos; se anotan aqui para que nadie los "arregle":

- **`position:sticky` en la cabecera funciona** (es un item de grid, pero fija). No cambiar `#app` a `flex`.
- **La foto es el modo por defecto** y va antes que la busqueda (reafirma D33): no se reordena la prioridad del producto.
- **El registro de insulina se queda siempre visible** (E8/D7); no se pliega detras de la puerta opt-in ni se mueve a otro sitio.

## Alcance

Incluye: distribucion/IA, movimiento, movil, accesibilidad y estados/feedback, todo en `src/style.css`, `src/main.ts`, `src/insulin/ui.ts`, `index.html`, `src/i18n/index.ts` y `e2e/`.

Excluye: el panel inferior "Mas" y cualquier navegacion de nivel superior (tabs/router); el chat (v1.1); el aprendizaje de correcciones; tocar el dominio (`src/core`), el catalogo, el modelo, la captura, la contribucion o el service worker.

## Cambios

### A. Distribucion (cabecera compacta + superficie unica)

**A1. Cabecera pegajosa compacta.** `.topbar` pasa a `position:sticky; inset-block-start:0; z-index:10` con fondo propio (superficie + linea) y contiene, de arriba abajo: el titulo y el selector de idioma; el resumen del dia (`#day-total` como unica cifra protagonista + chip de total semanal + **mini-semana** de siete barras finas); la navegacion de dia (`‹ fecha › Hoy`); y el **aviso legal** en una linea (clave nueva `footer.disclaimerShort`, el texto completo sigue en el pie). El `fieldset.daybar` deja de ser la unidad pegajosa: su cuerpo (etiqueta de fecha y demas) fluye con el resto.

**A2. Superficie de entrada unica.** Las tarjetas "Foto" y "Añadir comida" se funden en una sola tarjeta con un **conmutador segmentado `Foto | Buscar`** (dos `radio` nativos estilizados como se estila en la app; panel inactivo con `hidden`). **Foto es el modo por defecto** (D33).

**A3. Un solo borrador.** El borrador (`#draft-items`), su total y el boton **Registrar** viven dentro de esa superficie y por debajo del conmutador, de modo que el ciclo foto/busqueda -> ajustar -> registrar nunca sale de la tarjeta. Las filas de deteccion muestran **nombre, % y gramos estimados** (hoy solo nombre y %).

**A4. Lo secundario no cambia de sitio.** El registro diario (linea temporal, D36), el registro de insulina, Copia y Ajustes se quedan donde estan; Copia y Ajustes siguen plegados por defecto (spec 09 §7).

### B. Movimiento (sistema por tokens)

**B1. Tokens en `:root`.** Duraciones (`--dur-instant: 90ms`, `--dur-fast: 140ms`, `--dur-base: 200ms`, `--dur-slow: 300ms`) y curvas (`--ease-standard: cubic-bezier(0.2, 0, 0, 1)`, `--ease-emphasis` para el pulso).

**B2. Animaciones.** Se anaden o corrigen, todas con el token correspondiente:

| Disparador                                | Que anima                      | Propiedad                                        | Nota                                                           |
| ----------------------------------------- | ------------------------------ | ------------------------------------------------ | -------------------------------------------------------------- |
| Cambia la semana                          | `.week-fill`                   | `transform: scaleY(var(--fill))`                 | exige **reconciliar nodos**, no `innerHTML=''` (ver B4)        |
| Se (re)construyen las barras              | `.week-fill`                   | entrada escalonada                               | `min(--i,7) x 40ms`, `backwards`                               |
| Resuelve la deteccion                     | `.detect-box`                  | `opacity` + `scale(.96->1)`                      | escalonada por `--i`; el overlay sigue `aria-hidden`           |
| Deteccion en curso                        | `#photo-status::after`         | giro indeterminado + `aria-busy`                 | unica animacion continua, acotada por el `Promise`             |
| Registro correcto                         | `#day-total`                   | `scale(1->1.08->1)`                              | une "Comida registrada" con la cifra que cambio                |
| Navegacion de dia / `<details>` / botones | contorno, chevron, fondo/borde | `outline-color`, `transform`, `background-color` | sin `filter` (hoy el `brightness` del primario no transiciona) |

**B3. Reglas de movimiento.** El movimiento nunca es el unico portador de significado (todo estado animado tiene tambien su texto/`aria-live`/opacidad final); se animan solo `transform` y `opacity` salvo acentos de pintura pequenos; nada de layout (`width/height/block-size/margin`) en estado estable; ningun estado depende de `transitionend`/`animationend`.

**B4. Reconciliar en vez de reconstruir (arreglo habilitante).** `renderWeekBars()` deja de vaciar la lista con `innerHTML=''`: si la semana no cambia de forma, actualiza el `--fill` de los nodos existentes; la animacion de entrada solo corre en (re)construccion estructural.

**B5. Reduced-motion.** Se **mantiene** el interruptor global `@media (prefers-reduced-motion: reduce) { * { animation:none; transition:none } }` como garantia. El sistema es aditivo: apagar el movimiento deja la app completa (cifras, contornos, estados finales). No se estrecha la regla a selectores concretos.

### C. Movil

**C1. Safe-area.** `body` pasa a `padding: max(clamp(0.75rem, 3vw, 1.5rem), env(safe-area-inset-*))` (cuatro lados); la cabecera pegajosa usa `inset-block-start: env(safe-area-inset-top)`; `footer`/cabecera respetan los insets laterales.

**C2. Objetivos tactiles ≥ 44 px.** Los botones del borrador (mitad/doble/cambiar/porciones) suben de 36 px a `min-height: 2.75rem`, con separacion `>= 0.4rem`.

**C3. Foco bajo la cabecera.** Se publica `--daybar-h` (altura medida de la cabecera, actualizada tras pintar) y `html { scroll-padding-top: calc(var(--daybar-h) + env(safe-area-inset-top)) }` + `:focus { scroll-margin-top: ... }`, para que al enfocar un campo este no quede oculto.

**C4. Teclado y buscador.** `#search-results { max-height: 40dvh; overflow-y: auto; overscroll-behavior: contain }`; al escribir menos de 2 letras se muestra una pista (`search.hint`) en vez de una lista vacia; `body { overscroll-behavior-y: contain }`; controles interactivos con `touch-action: manipulation` y `-webkit-tap-highlight-color: transparent`.

**C5. Breakpoints estrechos.** Reglas `@media (max-width: 26rem)` para que la navegacion de dia no comprima el `<input type=date>` y para que la hora editable de la linea temporal tenga su columna util.

### D. Accesibilidad

**D1. Onboarding como dialogo.** `#onboarding` pasa a `role="dialog" aria-modal="true"`; al mostrarse, los hermanos quedan `inert` y el foco va a **Empezar**; al cerrar, se limpia `inert` y el foco pasa a `#date`; `align-content: safe center` (evita el recorte del primer paso en pantallas bajas) + safe-area.

**D2. Puerta de insulina.** El aviso no descartable pasa a `role="alertdialog"` con `aria-labelledby`/`aria-describedby`, recibe el foco al insertarse, y cancelar lo devuelve a la casilla.

**D3. Aviso siempre visible.** El aviso "no es un dispositivo medico" vive en la cabecera (A1) ademas del pie, sin desplegar nada.

**D4. Barras de semana accesibles.** Se quita `aria-hidden` de `#week-bars`; la lista lleva nombre accesible y cada dia expone "dia + gramos" (el valor deja de estar solo en la altura de la barra).

**D5. Estructura.** Se agrupa el contenido en `<main>` (la cabecera y el pie quedan fuera); se anade un h2 (visualmente oculto) por seccion principal para no saltar de h1 a h3; `renderPhoto` pone alt real a la imagen capturada.

### E. Estados y feedback

**E1. Anti doble registro.** Al pulsar, Registrar/Anadir insulina se deshabilitan y la tarjeta marca `aria-busy="true"`; se rearman **tanto en exito como en error**; se estiliza `button:disabled`.

**E2. Recordatorio de copia visible.** `#export-reminder` sale del `<details>` a un aviso `role="status"` en flujo, y se reevalua en cada `render()` (no solo al arrancar).

**E3. Fallo de imagen.** El `.catch` vacio se sustituye por un estado `photo.error` (clave ES/EN) y se rearman las entradas de fichero para reintentar.

**E4. Progreso de deteccion + entrada de cajas.** Mientras corre la deteccion se muestra el indicador de B2 y `aria-busy="true"`; las cajas entran con la animacion de B2 (o aparecen directamente sin movimiento).

### F. Tokens de tipografia y color (pulido)

Escala tipografica en `:root` y `h2` base (hoy el `h2` del onboarding queda por encima del `h1`); `.topbar` con superficie propia o `--line-strong` mas oscuro en claro (borde < 3:1 sobre el fondo de pagina); separacion de tarjetas en oscuro (linea/borde interior, la sombra negra no se ve); aviso del pie con su barra de acento; `--radius` en las cajas de deteccion; y el `output` del chip con peso de dato.

## Decisiones nuevas propuestas (D40-D46)

A incorporar a `docs/decisiones.md` al aceptar la spec:

| #   | Decision                              | Detalle                                                                                                                                                       |
| --- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D40 | **Cabecera pegajosa compacta**        | Lo unico siempre visible es el total del dia y la mini-semana; el aviso legal vive en la cabecera ademas del pie.                                             |
| D41 | **Superficie de entrada unica**       | Foto y Buscar comparten una sola tarjeta conmutada y **un unico borrador**; la foto sigue siendo el modo por defecto (reafirma D33).                          |
| D42 | **Lenguaje de movimiento por tokens** | Duraciones/curvas como tokens; el movimiento es aditivo y nunca unico portador de significado; el interruptor global de `prefers-reduced-motion` se mantiene. |
| D43 | **Anti doble registro**               | Todo envio async deshabilita su boton y marca `aria-busy`; se rearma en exito y en error.                                                                     |
| D44 | **Estados de fallo y progreso**       | Fallo de imagen y deteccion en curso tienen estado visible (y anunciado); ningun fallo silencioso.                                                            |
| D45 | **El aviso de copia no se pliega**    | El recordatorio de exportacion es visible y se anuncia (`role="status"`), reevaluado en cada render.                                                          |
| D46 | **Safe-area movil**                   | `viewport-fit=cover` ya declarado implica usar `env(safe-area-inset-*)` en body, cabecera y pie.                                                              |

## Criterios de aceptacion

1. Al desplazar, `#day-total` permanece visible y la cabecera no supera ~7.5rem de alto a 320 px.
2. El aviso "no es un dispositivo medico" es visible sin desplazar en la primera pantalla, y sigue tambien en el pie.
3. Foto y Buscar comparten superficie conmutada (Foto por defecto) y un solo borrador; ningun paso del ciclo foto/busqueda -> ajustar -> registrar cruza de tarjeta.
4. Cada fila de deteccion muestra nombre, % y gramos estimados; el ajuste de gramos sigue viviendo en el borrador.
5. Apagar el movimiento (reduced-motion) no elimina ninguna informacion: cifras, contornos y estados finales siguen ahi.
6. `#week-bars` no es `aria-hidden`, la lista tiene nombre accesible y cada dia expone dia + gramos; el total semanal es un numero.
7. Registrar comida o insulina dos veces seguidas no duplica el registro; el control se deshabilita en vuelo y se rearma en exito y en error.
8. El recordatorio de copia es visible y anunciado sin abrir Copia, y reaparece/desaparece segun el estado al refrescar.
9. Una imagen ilegible muestra un error visible y permite reintentar.
10. La deteccion en curso muestra progreso y `aria-busy="true"`; las cajas entran con animacion breve o aparecen directamente sin movimiento.
11. La primera apertura es un dialogo: el fondo queda `inert`, el foco entra en Empezar y, al cerrar, vuelve al contenido.
12. Activar el modulo de insulina lleva el foco al aviso no descartable (`role="alertdialog"`); cancelar lo devuelve a la casilla.
13. En la PWA instalada en un dispositivo con muesca/indicador, ningun contenido queda bajo el area no segura.
14. Ningun control tactil mide menos de 44 px de alto a 320/390 px.
15. Al enfocar un campo, este no queda oculto bajo la cabecera pegajosa.
16. Con el teclado abierto la lista del buscador hace scroll interno; con menos de 2 letras se muestra una pista en vez de nada.
17. Todo texto nuevo existe en `es` y en `en` (el tipo `StringKey` y las guardas lo imponen).
18. `make check` verde y `make audit-uiux` verde, con la matriz de viewports ampliada y las nuevas aserciones (D4, D3, C2, C3, contraste de deteccion).

## Tests

- **Unitarios**: sin cambios de dominio en esta spec. La paridad de claves i18n ya existente cubre las claves nuevas (`footer.disclaimerShort`, `photo.error`, `search.hint`, `photo.previewAlt`).
- **E2E** (Firefox, `make e2e`):
  - el onboarding se comporta como dialogo (foco entra y sale) y no vuelve a mostrarse;
  - el ciclo unificado: registrar desde la busqueda y registrar una deteccion, ambos sin cambiar de tarjeta;
  - **doble toque** en Registrar y en Anadir insulina -> exactamente un registro;
  - imagen ilegible -> estado `photo.error` visible;
  - recordatorio de copia visible sin abrir Copia (limpiando `carbos.lastExport`);
  - barras de la semana etiquetadas (dia + gramos) y total semanal numerico;
  - el escenario de idioma sigue exigiendo cero cadenas sin cubrir.
- **Auditoria** (`make audit-uiux`, ampliada):
  - matriz de viewports (320x568, 390x844, 414x896, mas paisaje con muesca y una pasada de altura reducida como proxi del teclado);
  - pasada de `prefers-reduced-motion: reduce` y de `prefers-color-scheme: dark`;
  - **fatal** (hoy solo aviso): cualquier control por debajo de 44 px;
  - **fatal**: contraste < 4.5:1 en cada `.detect-box-label`;
  - aserciones nuevas: aviso `role="note"` visible por encima del pliegue a 320; `#week-bars` no `aria-hidden` y cada dia con valor numerico; al enfocar `#ins-time` o el ultimo resultado, su `top` no queda bajo la cabecera;
  - asercion estatica de que el CSS construido contiene cuatro `env(safe-area-inset-` (Firefox/Puppeteer no pueden inyectar safe-area); el suelo del `max()` protege el caso real.
- **Gate**: `make check`.

## Orden de implementacion

1. **Movil y fundaciones** (seccion C) y **extension de `make audit-uiux`** con la matriz de viewports y los objetivos tactiles como fatales. Sin tocar el dominio.
2. **Accesibilidad y estados** (secciones D y E) + contraste de las etiquetas de deteccion (F).
3. **Movimiento** (seccion B), incluida la reconciliacion de las barras de semana (B4), que es requisito de cualquier transicion.
4. **Distribucion** (seccion A): cabecera compacta y superficie unificada. Es el cambio de mayor radio; al aterrizar se cierran las aserciones de aviso, semana y foco del auditor.
5. **Tokens y pulido** (resto de F).

## Fuera de alcance

- **Panel inferior "Mas" y navegacion de nivel superior** (tabs/router): se descartan; la identidad calmada de una columna con un acento es el producto.
- **Reordenar la prioridad del producto**: la foto sigue siendo el modo por defecto (D33).
- **Registro de insulina**: no se pliega ni se mueve (E8/D7).
- **Chat** (v1.1, D8) y **aprendizaje de correcciones** (aparcado, D33).
- **Dependencias nuevas, framework o libreria de CSS**: todo es CSS/TS vanilla en un unico `style.css`.

## Riesgos

- **La fusion Foto/Buscar** es el punto delicado de este ciclo: conmutador con `radio` nativos y panel `hidden`, sin logica nueva mas alla del conmutador; sin tests E2E que cubran ambos caminos no se toca.
- **La cabecera pegajosa mas alta agrava la occlusion del foco** hasta que aterrice C3; por eso C3 va en la primera ola.
- **Safe-area no es simulable** en Firefox/Puppeteer: se cubre con el suelo del `max()` y una asercion estatica sobre el CSS; conviene una comprobacion en dispositivo real con muesca.
- **Mantener el interruptor global `*` de reduced-motion** renuncia a afinar por selector; se acepta a cambio de no arriesgar la garantia (D42).
