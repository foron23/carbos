# 22 - Pase de UI/UX v3: navegacion persistente y Diario como linea de tiempo

> [!abstract] TL;DR
> Tercer pase de UI/UX. Cierra el problema reportado por el usuario ("la interfaz es poco intuitiva"): mantiene el **scroll unico de una columna** (identidad del producto) pero sustituye el acceso a las secciones por una **navegacion persistente con iconos** —barra inferior en movil, menu lateral (rail) en pantallas anchas— con la seccion activa marcada por **scrollspy** (`aria-current`, no solo color). Y rediseña el **Diario**, hoy una lista plana, como **linea de tiempo visual**: eje con marcadores, comida e insulina distinguidas, los **carbohidratos como dato principal** por entrada, detalle e info secundaria revelados al expandir, y un **resumen del dia** compacto (total, comidas, insulina y reparto de carbohidratos por momento del dia) dentro de la propia seccion. Esta spec **supersede la exclusion de navegacion de nivel superior de SPEC 16** y **amplia D40** (el chrome siempre visible incluye ahora la nav).

## Contexto

SPEC 16 fijo la "identidad calmada de una columna con un acento" y, en su seccion _Fuera de alcance_ (linea 171), descarto explicitamente el panel inferior y la navegacion de nivel superior:

> **Panel inferior "Mas" y navegacion de nivel superior** (tabs/router): se descartan; la identidad calmada de una columna con un acento es el producto.

Esa decision se tomo sin datos de uso y sin haber explorado una navegacion que **conservara** la columna unica. La iteracion de prototipos (variantes A/B/C para la navegacion; D/E/F/G para el Diario) mostro que se puede dar acceso persistente a las secciones **sin** conmutar paneles: los atajos se convierten en nav, y el dia se sigue leyendo de un vistazo.

Dos defectos verificados motivan este pase:

- **El Diario es una lista plana** (`renderDiary`, `src/main.ts:1114-1176`). Cada entrada es un `.timeline-row` en grid `3.25rem | 1fr` (`src/style.css:673`); la **hora es un `<input type="time">` siempre vivo** en comidas y un `<span>` inerte en insulina (`src/main.ts:1128`, `1161`); **comida e insulina son indistinguibles** (mismo `.timeline-row`, sin icono ni etiqueta; `diary.meal`/`diary.origin*` existen en i18n pero no se usan); el detalle de items antepone los **gramos del alimento** a los carbohidratos (`"Pan integral 70 g (35 g)"`, `src/main.ts:1147`), invirtiendo la jerarquia del dato (el total si es el `<strong>`, `src/style.css:703`, pero la linea de items no); **Editar/Quitar estan siempre visibles** (`src/style.css:713`). El **total del dia no vive en la seccion**: esta solo en `#day-total` del topbar (`renderToday`, `src/main.ts:1018`). El estado vacio informa pero no ofrece salida (`src/main.ts:1118`).
- **Sin navegacion**: llegar a una seccion es scroll. La leyenda del Diario es "Registro" (`section.diary`) mientras la tarjeta de al lado es "Registro de insulina" (`section.insulinLog`): dos "Registros" con funciones opuestas (`src/i18n/index.ts:9,74`).

Prototipos de referencia (desechables, no versionados; viven en `prototypes/`, ignorados por git): `c-nav-anclas.html` (nav) y `g-timeline-resumen.html` (Diario elegido). No forman parte del build.

## Alcance

**Incluye**: navegacion persistente (markup, estilos, scrollspy, accesibilidad), rediseño del Diario (linea de tiempo + resumen del dia), ids de ancla en las secciones reales, estados vacios, i18n ES/EN, tests E2E y extension del auditor (pasada de escritorio incluida). Todo en `src/main.ts`, `src/style.css`, `src/i18n/index.ts`, `e2e/helpers.mjs`, `e2e/scenarios.mjs`, `e2e/audit.mjs` y `e2e/run.mjs` (viewport de escritorio).

**Excluye**: conmutacion de paneles (pestañas que ocultan secciones; la refuta E8/D7, ver Riesgos); agrupado por momento **dentro** de la linea de tiempo (se mantiene cronologica); cambios de dominio (`src/core`), catalogo, modelo, captura, contribuciones o service worker; frameworks o dependencias nuevas (D11).

## Cambios

### A. Navegacion persistente (columna unica, sin conmutar paneles)

**A1. Nav de secciones.** Una `nav` con **4 destinos**: _Añadir_, _Diario_, _Insulina_, _Ajustes_. Cada destino es un **`<a href="#...">`** real (para heredar la asercion de objetivos tactiles del auditor) a la seccion correspondiente. **No** oculta ni conmuta contenido: todo sigue en la misma columna y el mismo scroll.

**A2. Ids de ancla en las secciones reales.** Se añaden ids a los contenedores existentes: `#s-anadir` en el `<fieldset id="entry">` (o se conserva `#entry` y la nav apunta a el), `#s-diario` en el `<fieldset>` del Diario (hoy sin id, `src/main.ts:321`), `#s-insulina` en el `<fieldset>` de registro de insulina (hoy sin id, `src/main.ts:327`) y `#s-ajustes` en un **contenedor envolvente** del `<details id="settings">` (`src/main.ts:361`). **Nota**: `#settings` es un `<details>` **plegado**; al navegar a _Ajustes_ debe **abrirse** (`open = true`) para que el contenido sea visible.

**A3. Responsive.** Por defecto (`< 64rem`) es una **barra fija inferior** con icono sobre etiqueta, respetando `env(safe-area-inset-bottom)`. En `>= 64rem` la barra inferior se oculta y aparece un **menu lateral fijo** (rail) a la izquierda, verticalmente centrado, con los items en columna; la columna central (`--page`) no queda tapada.

**A4. Iconos.** SVG inline (Feather/Lucide: `stroke="currentColor"`, `fill="none"`, 22 px, `viewBox="0 0 24 24"`, `aria-hidden`). Sin emojis ni fuentes de iconos externas. El nombre accesible del destino va en el enlace. Cualquier icono con esa forma y `viewBox` es valido (no se fijan rutas exactas).

**A5. Estado activo.** El destino de la seccion visible se marca con color de acento **y** un indicador (barra/punto) **y** `aria-current="true"`. Un `IntersectionObserver` (scrollspy) lo actualiza; al cargar, _Añadir_. El color nunca es el unico portador. El observer usa un `rootMargin` que **descuenta la cabecera y la nav** (`-{--daybar-h - --nav-h} 0px 0px 0px`).

**A6. Espacio reservado.** Se publica `--nav-h` (como ya se hace con `--daybar-h`, `src/main.ts:1216`) para reservar `padding-block-end` del contenido, de modo que la barra no tape el final de la lista.

**A7. Un solo desplazamiento de ancla.** La seccion aterriza **justo** bajo la cabecera pegajosa: se conserva **solo** `html { scroll-padding-top: var(--daybar-h) }` (`src/style.css:64`) para las anclas, y se **evita** añadir un `scroll-margin-block-start` extra a las secciones (el prototipo sufrio un doble offset de ~188 px). El `:focus { scroll-margin-top }` de SPEC 16 C3 (`src/style.css:508`) se **mantiene** (sirve al foco, no a las anclas); solo se prohibe duplicar el desplazamiento en el mismo elemento.

### B. Diario como linea de tiempo visual

**B1. Eje y marcadores.** Columna con eje vertical continuo y un marcador por entrada; el marcador distingue comida (circulo) de insulina (rombo/gota) — forma **y** icono, no solo color.

**B2. Comida e insulina distinguidas.** La comida se trata como tarjeta (icono de cubiertos, etiqueta "Comida"); la insulina como ficha fina intercalada (icono de gota, "Insulina"). Se reutilizan las claves i18n `diary.meal`, `diary.originManual`, `diary.originPhoto` que hoy no se usan.

**B3. Jerarquia del dato.** En cada comida, el **total de carbohidratos** en gramos es el dato de mayor peso tipografico. Los items y su detalle (nombre, gramos del alimento, carbohidratos) pasan a **chips** secundarios.

**B4. Confianza como medidor.** La `confidence` se representa con un medidor sutil (barra/puntos) ademas del texto, nunca como bloque dominante.

**B5. Revelacion progresiva.** El detalle de una entrada (hora editable, acciones) se **expande** al tocar, con un control con nombre accesible (`aria-expanded`). Estados **colapsados por defecto**, **independientes** entre entradas (no acordeon) y **sin persistir** al recargar. La **hora sigue siendo editable** (D36) mediante un `<input type="time">` que en reposo esta **colapsado** (`offsetHeight === 0`) y se revela al expandir. Acciones: **Editar** y **Quitar**; el borrador conserva sus atajos (D34: mitad/doble/cambiar/quitar).

**B6. Resumen del dia (en la seccion).** Encabezando el Diario, un panel compacto con: **total de carbohidratos del dia**, **numero de comidas**, **unidades de insulina** totales (suma de `units`; **no** se desglosa ni se reparte por momento) y el **reparto de carbohidratos por momento** (Mañana/Tarde/Noche) con subtotales en gramos. Debe cuadrar con la suma de las entradas. El total del resumen es un **recap de seccion**; el protagonista global sigue siendo `#day-total` del topbar (a escala mayor).

**B7. Resumen compacto.** El resumen no puede enterrar la cronologia: en 390x844, tras anclar el Diario, deben verse **>= 3 entradas** completas sin scroll adicional; a 320 px, **>= 2**. En viewports de altura reducida (`390x400`) y paisaje, el umbral no aplica (se comprueba solo que el resumen no desborde).

**B8. Renombrado y vacio.** La seccion "Registro" pasa a **"Diario"** en **ambos idiomas** (`section.diary`: `es` "Registro" -> "Diario"; `en` "Log" -> "Diary"), resolviendo la ambiguedad con "Registro de insulina". El estado vacio muestra el mensaje, **oculta el resumen** y ofrece una **salida** hacia Añadir (CTA), no un aviso muerto.

### C. Movil y accesibilidad

**C1. Objetivos tactiles >= 44 px** en la nav (enlaces reales) y en las acciones del Diario.
**C2. Safe-area** en la barra inferior y el rail (`env(safe-area-inset-*)`, reafirma D46).
**C3. Foco.** Al enfocar un control no queda oculto ni bajo la cabecera ni bajo la barra inferior (`scroll-padding`).
**C4. Reduced-motion.** Se mantiene el interruptor global de D42; el scrollspy y las expansiones no dependen del movimiento.
**C5. i18n.** Claves nuevas en `es` y `en` (el tipo `StringKey` y las guardas lo imponen):

| Clave                                                    | ES                     | EN                            |
| -------------------------------------------------------- | ---------------------- | ----------------------------- |
| `nav.label` (aria-label del `<nav>`)                     | Secciones              | Sections                      |
| `nav.add`                                                | Añadir                 | Add                           |
| `nav.diary`                                              | Diario                 | Diary                         |
| `nav.insulin`                                            | Insulina               | Insulin                       |
| `nav.settings`                                           | Ajustes                | Settings                      |
| `section.diary` (renombrada)                             | Diario                 | Diary                         |
| `diary.insulin` (etiqueta de linea)                      | Insulina               | Insulin                       |
| `diary.expand` (nombre acc. del control)                 | Ver detalle            | Show detail                   |
| `diary.emptyCta`                                         | Añadir una comida      | Add a meal                    |
| `summary.total`                                          | Total del día          | Day total                     |
| `summary.meals`                                          | comidas                | meals                         |
| `summary.insulin`                                        | insulina               | insulin                       |
| `moment.morning` / `moment.afternoon` / `moment.evening` | Mañana / Tarde / Noche | Morning / Afternoon / Evening |

## Decisiones nuevas propuestas (D53-D58)

> **Numeracion reconciliada (2026-10-14).** Los numeros canonicos se registran en `docs/decisiones.md`: SPEC 16 -> D40-D46, SPEC 17 -> D47-D49, SPEC 19 -> D50-D52, esta spec -> D53-D58. Antes hubo solape entre specs; ver la nota de reconciliacion en el registro.

| #   | Decision                                        | Detalle                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D53 | **Navegacion persistente, scroll unico**        | Acceso permanente a las secciones (barra inferior movil / rail escritorio) **sin** conmutar paneles: todo sigue en una columna y un scroll. **Supersede** la exclusion de navegacion de SPEC 16 y **amplia D40**: el chrome siempre visible pasa a ser total + mini-semana + **nav**.                                                                                                                                                                                                                                       |
| D54 | **Diario como linea de tiempo visual**          | Eje con marcadores; comida vs insulina distinguidas por icono y forma; los carbohidratos son el dato principal de cada comida; detalle progresivo.                                                                                                                                                                                                                                                                                                                                                                          |
| D55 | **Resumen del dia dentro del Diario**           | Total, numero de comidas, insulina total y reparto de carbohidratos por momento. Es un **recap de la seccion**; `#day-total` del topbar sigue siendo el protagonista global.                                                                                                                                                                                                                                                                                                                                                |
| D56 | **Revelacion progresiva (hora y acciones)**     | Hora editable y acciones (Editar/Quitar; atajos D34 en el borrador) se revelan al expandir; colapsadas por defecto, independientes, sin persistir.                                                                                                                                                                                                                                                                                                                                                                          |
| D57 | **Reparto por momento del dia, presentacional** | Mañana/Tarde/Noche se **derivan de la hora** para el resumen; **no** se almacenan ni se le piden al usuario (no reintroduce el `slot`). **Amplia D36/SPEC 13**: la prohibicion de "totales por franja" era sobre las franjas **almacenadas y editables**; se admite un reparto **presentacional, derivado del reloj, solo de carbohidratos**. Cortes: Mañana `05:00-11:59`, Tarde `12:00-19:59`, Noche `20:00-04:59` (inicio inclusivo, fin exclusivo). Un registro fuera de rango cae en Noche. La insulina no se reparte. |
| D58 | **Estados vacios con salida**                   | Todo estado vacio ofrece una accion (CTA), no solo un mensaje.                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

## Criterios de aceptacion

Los criterios marcados _(m)_ se comprueban con una formula concreta en Tests.

1. Se mantiene el **scroll unico de una columna**: la nav **no** conmuta paneles ni oculta secciones.
2. Hay una nav persistente con **4 destinos** (Añadir, Diario, Insulina, Ajustes): barra inferior a `< 64rem` (medida como `max-width: 63.99rem`), rail lateral a `>= 64rem`.
3. Cada destino es un `<a href>` con **icono SVG** y nombre accesible; el activo lleva `aria-current="true"` **y** un nodo indicador con caja no vacia (no solo color). _(m)_
4. El **scrollspy** actualiza el destino activo al desplazar; al cargar, _Añadir_; con reduced-motion no depende de animacion.
5. La nav **no tapa** contenido a 320/390 px: `padding-block-end` reservado `>= --nav-h`. _(m)_
6. El rail de escritorio **no tapa** la columna: `rail.right <= page.left`. _(m)_
7. Al enfocar un control, no queda bajo la cabecera (`rect.bottom <= 0` imposible) ni bajo la barra (`rect.bottom <= navTop`). _(m)_
8. Los controles de la nav miden **>= 44 px** de alto.
9. En el Diario hay **eje vertical con marcadores**; comida e insulina se distinguen por **forma + icono + etiqueta**.
10. Cada comida muestra su **total de carbohidratos** como numero de mayor tamano de la fila: `fontSize(carbs) >= 1.5rem` y mayor que cualquier otro numero de la entrada. _(m)_
11. El detalle y la info secundaria son **progresivos**: en reposo la hora (`input[type=time]`) esta colapsada (`offsetHeight === 0`) y se revela al expandir (`aria-expanded`). _(m)_
12. **Editar/Quitar** alcanzables al expandir; el borrador conserva **mitad/doble/cambiar/quitar** (D34).
13. El **resumen del dia** muestra total, numero de comidas, insulina total y reparto por momento; **cuadra**: `abs(total - suma) <= 0.5 g`, e igual para los subtotales de momento. _(m)_
14. Al anclar el Diario se ven **>= 3 entradas** completas a 390x844 y **>= 2** a 320 px. _(m)_
15. El **ancla** aterriza justo bajo la cabecera: `headerBottom <= sectionTop <= headerBottom + 8` en los 4 destinos; _Ajustes_ ademas abre el `<details>`. _(m)_
16. El **estado vacio** muestra mensaje, oculta el resumen y ofrece una **salida** hacia Añadir.
17. La seccion se llama **"Diario"** en ES y EN, sin ambiguedad con "Registro de insulina".
18. Apagar el movimiento no elimina informacion (cifras, marcadores, estados finales).
19. Todo texto nuevo existe en **es y en** (`StringKey`) y no queda ningun `aria-label` sin cubrir.
20. `make check`, `make e2e` y `make audit-uiux` en verde, con las **nuevas aserciones** (ver Tests).

## Tests

- **Unitarios**: sin cambios de dominio. Se extrae el **calculo del reparto por momento** (hora -> momento y suma de carbohidratos) a una funcion pura y se cubre con vitest (incluye el borde 04:59/05:00 y 19:59/20:00). La paridad i18n existente cubre las claves nuevas.
- **E2E** (Firefox, `make e2e`):
  - la nav tiene 4 destinos con nombre accesible; el activo lleva `aria-current`;
  - al pulsar _Diario_, la seccion aterriza bajo la cabecera (sin doble offset, tolerancia 8 px); se ven **>= 3 entradas**;
  - el **scrollspy** cambia el destino activo al desplazar; al cargar es _Añadir_;
  - el Diario distingue **comida vs insulina** y el **resumen cuadra** con la suma;
  - expandir una comida revela la **hora editable**; al cambiarla se persiste (actualizar los escenarios existentes, que hoy leen `#diary input[type="time"]` directamente y clasifican `meal`/`insulin` por su presencia: `e2e/scenarios.mjs:395,421,440`);
  - _Ajustes_ abre el `<details>` al navegar;
  - el **estado vacio** oculta lista y resumen y ofrece vuelta;
  - el **idioma** sigue exigiendo cero cadenas sin cubrir (y se añade una asercion de que ningun `aria-label` queda sin traducir).
- **Auditoria** (`make audit-uiux`, ampliada):
  - **matriz de viewports ampliada con una pasada de escritorio `>= 64rem`** (p.ej. `1280x800`), imprescindible para verificar el rail; hoy el maximo es 844 px y el rail seria inverificable;
  - `collect()` publica `--nav-h`, `padding-block-end` del `main`, `navRect` y `pageRect`; aserciones **fatales** nuevas: barra inferior sin solape a 320/390 (`padding >= navH`), rail sin solape (`rail.right <= page.left`), `aria-current` presente y unico, foco ademas **sobre la barra** (`rect.bottom <= navTop`);
  - mantener la matriz actual (320x568, 390x844, 414x896, paisaje con muesca, altura reducida), las pasadas de reduced-motion y dark, MIN_HIT=44 y contraste 4.5:1.
- **Gate**: `make check`.

## Formulaciones medibles (m)

- **entrada** = cada `<li>` del Diario (selector estable p.ej. `.timeline-entry`, que esta spec introduce). **completa** = `rect.top >= headerBottom && rect.bottom <= innerHeight && rect.bottom <= navTop`.
- **resumen cuadra** = `abs(valorResumen - sumaEntradas) <= 0.5` (epsilon de redondeo; parseo decimal local).
- **ancla** = `headerBottom <= sectionTop <= headerBottom + 8`.
- **dato principal** = el numero de carbohidratos de la entrada tiene `fontSize >= 1.5rem` y es el mayor de la entrada.

## Orden de implementacion

1. **Nav (seccion A)** sobre la columna existente: ids de ancla, markup, estilos, scrollspy, `aria-current`, `--nav-h`. E2E de la nav + aserciones del auditor (incluida la pasada de escritorio).
2. **Diario (seccion B)**: linea de tiempo visual, comida/insulina, jerarquia del dato, revelacion progresiva, resumen (con la funcion pura del reparto por momento) y estado vacio. Actualizar los escenarios E2E existentes que dependen de la hora visible.
3. **Accesibilidad y pulido (seccion C)**: targets, safe-area, foco, i18n, reduced-motion, renombrado a "Diario".

Cada ola cierra con `make check` + `make e2e` + `make audit-uiux`.

## Fuera de alcance

- **Conmutacion de paneles / pestanas** que oculten secciones: se descarta (fragmenta el dia y esconde la insulina; refuta E8/D7).
- **Agrupado por momento dentro de la linea de tiempo**: el Diario sigue **cronologico**; los momentos solo se usan en el resumen.
- **Cambios de dominio o esquema**: sin `slot`, sin tabla de porciones habituales, sin aprender correcciones (D33/D36).
- **Reordenar la prioridad del producto**: la foto sigue siendo el modo por defecto (D33).
- **Registro de insulina**: sigue siempre visible en su sitio (E8/D7); la nav solo enlaza.
- **Frameworks, dependencias nuevas o libreria de CSS** (D11).

## Riesgos

- **Altura cabecera + barra en 320 px.** La barra inferior se suma a la cabecera pegajosa; el espacio reservado y el resumen compacto son la mitigacion (criterios 5 y 14). Verificado en prototipo: 60 px de resumen y 4 entradas visibles a 390.
- **Scrollspy con coste o parpadeo.** Mitigar con un unico observer y `rootMargin` que descuente cabecera y barra; sin dependencia de animacion (D42).
- **Rail de escritorio inverificable sin pasada desktop.** Se añade la pasada `>= 64rem` al auditor (Tests); sin ella el criterio 6 no se puede comprobar.
- **Escenarios E2E existentes que rompen.** Hoy leen `#diary input[type="time"]` y clasifican `meal`/`insulin` por su presencia (`e2e/scenarios.mjs:395,421,440`); con la revelacion progresiva hay que expandir primero o clasificar por clase. Incluido en el plan.
- **Ambiguedad de "momento".** Mañana/Tarde/Noche se derivan del reloj (D57); los cortes horarios son una eleccion de presentacion, no datos, y se pueden ajustar sin tocar dominio.
- **Numeracion de decisiones: reconciliada.** El registro llega a D39 y varias specs proponian numeros solapados; ya se han adoptado numeros canonicos (D40-D58) y registrado en `docs/decisiones.md`, con las referencias de las specs 17/19/20/22 corregidas. Deuda cerrada.
- **Renombrar `section.diary` ("Registro" -> "Diario")** afecta a aserciones E2E que busquen el texto; revisarlas.

## Referencias

- SPEC 16 (UI/UX v2; identidad de una columna y su exclusion de navegacion, que esta spec supersede), SPEC 13 (atajos y lectura del dia, D34-D37; su "sin totales por franja" queda precisado por D57), SPEC 02 (E8, insulina siempre visible), SPEC 17/18/19 (escaneo, deteccion, camara: sin cambios), `docs/decisiones.md` (D33, D34, D36, D37, D40, D42, D46; y las de esta spec, D53-D58, ya registradas), `src/main.ts` (`renderDiary`, `renderToday`, `wire`, `publishDaybarHeight`), `src/style.css` (`.timeline-*`, `.topbar`, `.card`, `html { scroll-padding-top }`).
