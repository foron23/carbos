# 27 - Indice glucemico (IG) en los alimentos: indicador visual

> [!abstract] TL;DR
> Investigacion (internet, 2026-10-15; cuatro angulos) mas auditoria offline del
> repo sobre **como integrar el indice glucemico (IG)** en los alimentos cuando se
> visualizan, con **prototipos** para fijar la mejor UX. **Hallazgo honesto:** el IG
> **no cambia el numero** de carbohidratos; en DM1 describe la **forma/tiempo** de la
> curva glucemica, que es territorio de la **dosis** (D10). ISPAD 2022 lo recomienda
> (grado B) pero **junto a** un metodo de cuantificacion de carbohidratos (que la app
> ya cumple); el efecto agudo esta documentado (Parillo 2011) mientras que el
> beneficio a largo plazo es sobre todo de DM2, y la variabilidad intra-individual es
> alta (CV 20-43 %) -> **nunca un numero**, solo una **banda cualitativa** con texto y
> forma redundantes (WCAG 1.4.1), **opcional y por defecto oculta**, en el **contexto
> de composicion** del alimento (desglose del borrador/detecciones), **nunca** en
> filas de busqueda ni en el diario.
> **Bloqueo de datos (serio):** el IG es especifico del alimento y la coccion, asi que
> un mapeo por _categoria_ **no es defendible**; ademas cualquier banda derivada de las
> tablas publicas (Atkinson 2021, Universidad de Sydney, FAO/WHO 1998) es **obra
> derivada** y esas licencias **no permiten redistribuirla** bajo AGPL-3.0. CIQUAL y
> USDA **no traen IG**. Via honesta: **enlace a fuente externa**, o una tabla **propia
> curada alimento a alimento con metodologia documentada y licencia compatible**.
> **Veredicto:** la funcion solo cabe como informacion cualitativa secundaria, y el
> **margen sobre no hacerla es estrecho**; la opcion "nada" (C13) es runner-up.
> Decisiones **D70-D73** (implementadas 2026-10-15: indicador propio de **fibra** +
> enlace externo opt-in; ni se calcula ni se embebe el IG). No toca el camino del calculo (D12) ni el de la
> dosis (D10); sin backend, sin dependencias nuevas y sin red en runtime (D11).

## Contexto

Desde SPEC 26 la app muestra **solo carbohidratos** en modo simplificado y anade
**macros y kcal como composicion** en modo completo (D67-D69). Hay una pregunta
recurrente de quien convive con DM1: _"¿y el indice glucemico?"_. Conocer el IG de
un alimento es una practica extendida (etiquetado voluntario, apps de diabetes) y
promete una lectura **cualitativa** que el conteo de carbohidratos no da: no
_cuantos_ carbohidratos, sino _como de rapido_ suben.

El hueco es real, pero tambien lo son tres tensiones que esta spec resuelve antes de
tocar codigo:

- **Cientifica.** El IG **no cambia el conteo**; en DM1 lo que cambia es la **forma**
  de la curva. ISPAD 2022 (grado B) lo recomienda como beneficio **adicional** al
  conteo total de carbohidratos, con la condicion de usarlo **"junto a un metodo de
  cuantificacion de carbohidratos"** -que la app ya satisface-. El matiz no es "la
  evidencia es debil" sino: (a) el grueso de la evidencia es **DM2** y el beneficio a
  largo plazo (HbA1c) en DM1 es limitado; (b) el efecto **agudo** postprandial si esta
  documentado (Parillo 2011); y (c) describe forma/tiempo, muy cerca del **bolo
  extendido/dual** = **dosis** (D10).
- **De datos.** El IG **no esta** en el pipeline del catalogo (CIQUAL 2020 y USDA FDC
  no traen IG; `tools/catalog/.cache/xml/const_2020_07_07.xml` tiene 67 `const_code` y
  ninguno es IG ni carga glucemica). Es **especifico del alimento, la variedad y la
  coccion** (el "arroz" va de bajo a alto), asi que un mapeo por categoria **no vale**.
  Y las tablas publicas **no son redistribuibles** (ver _Coste de datos_).
- **Regulatoria/identidad.** El IG es **accionable** (guia _que elegir_), a diferencia
  de los macros. Un indicador puede leerse como **recomendacion dietetica** o insinuar
  ajuste de insulina, y choca con la identidad **calma** ("un solo numero:
  carbohidratos"; `docs/specs/16-uiux-v2.md:171`).

Esta spec primero documento la investigacion, filtro las candidatas y **construyo
prototipos** para elegir la mejor UX; despues se **implemento la via de minima
friccion**: un **indicador propio de fibra** (no IG) mas un **enlace externo** opt-in al
indice glucemico (D70-D73, _Implementacion_ mas abajo).

## Metodo

1. **Investigacion en internet (2026-10-15)** en cuatro angulos, citados abajo como
   **R1-R4**: **(R1) ciencia y DM1** (IG vs carga glucemica vs respuesta; ISPAD 2022,
   ADA 2025, Cochrane, Parillo 2011, Matthan 2016); **(R2) UX** de comunicacion del IG
   (semaforo UK, GI Symbol, Nutri-Score, apps, WCAG 1.4.1); **(R3) datos y licencias**
   (Atkinson 2021, Universidad de Sydney, FAO/WHO 1998, CIQUAL/USDA, cobertura sobre
   186); **(R4) regulacion y etica** (FDA _General Wellness_, MDR UE, comparacion con
   la decision de macros de SPEC 26).
2. **Auditoria offline del repo** (dos unidades): superficies donde se pinta un
   alimento y sus puntos de insercion; y convenciones (specs, decisiones, patron de
   campo opcional, prototipos).
3. **Long-list** de candidatas (14) con el patron comun documentado.
4. **Filtro** por cuatro criterios con la misma escala (1-3): **Impacto**,
   **Frecuencia**, **Esfuerzo** (3 = menos esfuerzo -> mas puntua) y **Encaje** con los
   guardarrailes (D9, D10, D11, D12, D16/WCAG, identidad calma).
5. **Seleccion** de la mejor (mayor total y encaje alto), descartando el resto con su
   motivo. Se construyen **prototipos** de las variantes finalistas y de los extremos
   descartados, para ver la mejor UX.

## Candidatas y filtro

| #   | Candidata                                                 | Impacto | Frec. | Esfz. | Encaje | Total | ¿Elegida?   | Motivo del descarte                                                                  |
| --- | --------------------------------------------------------- | ------- | ----- | ----- | ------ | ----- | ----------- | ------------------------------------------------------------------------------------ |
| C1  | Numero de IG + banda de color                             | 2       | 2     | 2     | 1      | 7     | (prototipo) | Precision falsa (CV 20-43 %, R1) y color unico (WCAG 1.4.1); se prototipa para verlo |
| C2  | Solo banda de color (semaforo)                            | 2       | 2     | 2     | 1      | 7     | (prototipo) | Moraliza (CHI 2024) y depende del color; se prototipa para verlo                     |
| C3  | Carga glucemica (GL) por porcion                          | 2       | 2     | 1     | 1      | 6     | no          | Se acerca a cuantificar/dosis; exige IG + carbos exactos y precision que no tenemos  |
| C4  | Icono/insignia minimalista                                | 2       | 2     | 3     | 2      | 9     | no          | Binario/ambiguo sin texto; el canal redundante es obligatorio                        |
| C5  | Barra segmentada de 3 tramos                              | 2       | 2     | 2     | 2      | 8     | no          | Muestra un continuo que el dato no sostiene; ambigua sin etiqueta                    |
| C6  | **Banda + etiqueta textual (sin numero), en el desglose** | 2       | 2     | 3     | 3      | 10    | **F1**      | —                                                                                    |
| C7  | Indicador en filas de resultado                           | 2       | 3     | 2     | 1      | 8     | no          | Satura el escaneo y moraliza (R2)                                                    |
| C8  | Indicador en el diario                                    | 1       | 3     | 2     | 1      | 7     | no          | Convierte cada comida en un juicio recurrente; riesgo regulatorio (R4)               |
| C9  | **Explicacion educativa ("¿que es el IG?")**              | 3       | 1     | 3     | 3      | 10    | **F2**      | Absorbida por F1 (nota educativa colapsada)                                          |
| C10 | Segunda metrica ignorable (colapsada)                     | 1       | 1     | 3     | 3      | 8     | no          | Es la forma de F1; no una feature aparte                                             |
| C11 | **Enlace/consulta a fuente externa (sin dato embebido)**  | 2       | 1     | 3     | 3      | 9     | **F3**      | Respaldo de datos de F1 (evita licencia y precision falsa)                           |
| C12 | Indicador agregado por comida (no por alimento)           | 2       | 2     | 1     | 2      | 7     | no          | Agregar IG de una comida mixta no es defendible (R1/R3)                              |
| C13 | **Nada (rechazar/aplazar la feature)**                    | 1       | 1     | 3     | 3      | 8     | runner-up   | Opcion honesta; con evidencia estrecha en DM1 el margen es pequeno                   |
| C14 | Detalle del alimento a demanda (tocar fila -> panel)      | 2       | 2     | 2     | 2      | 8     | no          | Superficie nueva (no existe hoy); la banda cabe en el desglose sin anadir pantalla   |

**Elegidas: C6 (F1), con C9 (F2) y C11 (F3) como partes.** F1 es el nucleo; F2
(educacion) va dentro de la misma tarjeta y F3 (enlace externo) resuelve el bloqueo de
datos donde no haya estimacion propia. Se **prototipan tambien C1 y C2** (los extremos
numero-y-color) para poder compararlos; el resto se descarta por precision falsa,
ruido, moralizacion o cruce con la dosis.

> **Runner-up honesto: C13 (nada).** Su total empata con C4/C5/C10/C14; se elige como
> runner-up por **argumento**, no por puntuacion: con la evidencia actual en DM1 (R1) y
> el coste/licencia de datos (R3), F1 debe ser **barata, opcional y desmontable**. Si al
> probar los prototipos no demuestra utilidad informativa sin volverse consejo, se
> aplaza igual que FPU/eCarbs.

## La elegida: banda cualitativa opcional en el desglose

> **Superado por _Implementacion_ (D70-D73).** Este bloque describe el diseno de _banda de
> IG_ que se investigo; la via finalmente elegida e implementada fue un **indicador de
> fibra** (no IG) mas un **enlace externo**. Se conserva como registro del razonamiento.

**Que.** Un **indicador de IG estimado, cualitativo y opcional** que solo aparece
**cuando el alimento se muestra en su contexto de composicion** (el desglose del
borrador y las detecciones), **nunca** en las filas de resultado de busqueda ni en el
diario. Muestra una **banda** ("Bajo / Medio / Alto") con **texto y forma redundantes**
(no solo color) y la nota _"estimado: no es consejo"_. No muestra **ningun numero** de
IG. Se **oculta** cuando el alimento no aporta carbohidratos o no hay estimacion
defendible. Incluye una **explicacion colapsada** ("¿que es el IG?") y, cuando no hay
estimacion propia, un **enlace a una fuente externa** en lugar de un valor. Es
**opt-in propio** en `Ajustes`, **por defecto oculto** e **independiente** del modo
completo (no lo enciende el modo completo).

**Por que asi (y no de otra forma).**

- **No un numero.** La variabilidad intra-individual (CV 20-43 %, R1) y la dependencia
  de coccion/proceso hacen que un valor puntual engane; la regla de redaccion prohibe
  "preciso" (`docs/decisiones.md:124`).
- **Banda + texto + forma.** WCAG 1.4.1 (Uso del color): el color no puede ser el unico
  canal; se anaden etiqueta y forma (G14/G111, R2).
- **Un indicador por alimento, no en filas ni en el diario.** En el desglose cada
  alimento lleva **su** banda; lo que se evita es multiplicar el indicador **por fila de
  resultado** (varias decisiones a la vez) y en el **diario** (juicio recurrente, R4).
- **Opcional y por defecto off.** Respeta la identidad calma; desmontable.

**Tabla de que va / que no va.**

| Va                                                                     | No va                                                                |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Banda cualitativa (Bajo/Medio/Alto) en el desglose, marcada "estimado" | Numero de IG, carga glucemica (GL), "impacto glucemico" cuantificado |
| Texto + forma redundantes con el color; `aria-label` con la banda      | Color como unico canal; flechas o ranking por IG                     |
| Explicacion colapsada y enlace externo                                 | Recomendacion ("mejor", "elige", "deberias"), objetivos de IG        |
| Co-ubicada con los macros, lejos de la insulina                        | En filas de busqueda, en el diario, junto al registro de insulina    |
| Omitir cuando no aplica (sin carbohidrato / sin dato)                  | Inventar, derivar de la foto o "estimar" sin metodologia documentada |

**Veredicto razonado.** El IG es una **estimacion cualitativa de respuesta** (no un
nutriente ni una "composicion" en sentido estricto, es una respuesta fisiologica medida
por ISO 26642). Se trata como informacion secundaria, con un guardarrail extra: **es
accionable**, asi que la redaccion y la ubicacion importan mas que con los macros. El
encabezado y la nota dejan claro que **no es consejo dietetico ni guia de insulina**, y
el dato **no puede entrar en ningun camino que lleve a unidades** (D10/D12). Al no tocar
esos caminos, no cambia el calculo; pero se reconoce que el IG **roza** el territorio de
la dosis, y por eso es **opcional, cualitativo y periferico**.

## Coste de datos (prerequisito)

El IG **no es derivable** del pipeline actual: CIQUAL 2020 no trae IG/GL (revisado
`tools/catalog/.cache/xml/const_2020_07_07.xml`, 67 `const_code`; ninguno es IG) y USDA
FDC tampoco. Las tablas publicas de IG tienen **licencias incompatibles** con AGPL-3.0:

| Fuente                                    | Acceso               | Redistribucion                             | ¿Embeber en la PWA?    |
| ----------------------------------------- | -------------------- | ------------------------------------------ | ---------------------- |
| Atkinson et al. 2021 (AJCN)               | lectura gratis       | "no uso comercial" / Elsevier user license | **No**                 |
| Universidad de Sydney (glycemicindex.com) | de pago / all rights | permiso obligatorio / pago                 | **No**                 |
| FAO/WHO 1998 (FN Paper 66, Tabla 8)       | lectura gratis       | "All rights reserved"                      | **No**                 |
| Repos GitHub "abiertos"                   | variable             | derivan de las tablas anteriores           | **No** (origen dudoso) |

**Cita ≠ licencia (y ≠ dataset abierto).** Atribuir la fuente satisface la norma
academica, pero **no concede el derecho a redistribuir**: las tablas se protegen como
compilacion (derecho de autor) y, en la UE, por el **derecho _sui generis_ de bases de
datos**. Extraer y redistribuir una parte sustancial de una tabla protegida puede
infringir **aunque se cite**. La atribucion es necesaria y suficiente **solo** para las
fuentes abiertas (CIQUAL = Licence Ouverte; Open Food Facts = ODbL).

**No hay atajo con licencia limpia (comprobado).** Wikidata describe el _concepto_ de IG
(`Q273924`) y no ofrece un dataset denso de valores por alimento; DBpedia/Wikipedia
(CC BY-SA) tienen cobertura escasa y con la misma procedencia restringida; los repos
"MIT" de GitHub licencian el _codigo_, no acreditan los _valores_. Es decir: **hoy no
existe un dataset de IG abierto, autoritativo y con licencia compatible**.

**Clave del bloqueo (corregida).** El IG es **especifico del alimento, la variedad y la
coccion** (el mismo "arroz" va de bajo a alto). Por tanto:

1. Un **mapeo por categoria no es defendible** y no se propone.
2. Cualquier banda que se derive de las tablas publicas es **obra derivada**, no "obra
   propia": las tablas estan protegidas y su licencia **no permite** redistribuirlas
   (ni una version derivada) bajo AGPL-3.0.

**Vías honestas (por fricción creciente):**

- **(0) Enlace externo (F3): la vía sin complicación.** Un puntero a una fuente de
  terceros (idealmente una búsqueda con el nombre del alimento); la app no copia nada.
  Cero licencias, cero mantenimiento; **una línea por alimento**. Coste: **sale del
  dispositivo** -> opt-in + aviso (patrón D48, como la consulta de código de barras).
- **(1) Tabla propia pequeña y curada** (p. ej. 30-60 alimentos de carbohidrato de uso
  común en España), con **fuente y metodología documentadas** y valores de procedencia
  **permitida**; banda marcada "estimado"; **se oculta** donde no haya dato. La fricción
  aquí es de **curaduría y mantenimiento** (el IG es del alimento y la cocción), no de
  licencia si la fuente lo permite. Es el único camino para un **valor embebido**.
- **(2) Licenciar/permiso** de una tabla grande (Sydney/Atkinson): descartado para una
  app AGPL sin ánimo de lucro, por coste y por contaminación de licencia.

> **Techo honesto (ciencia).** Incluso con licencia perfecta, la variabilidad del IG
> (CV 20-43 %; cocción, variedad, comida entera) hace que un valor **preciso** engañe; el
> máximo honesto es una **banda** o un **enlace**. La restricción legal y la científica
> apuntan al mismo sitio: **banda o puntero, nunca un número**.

**¿Y calcularlo nosotros desde la composición? No (y es importante).** El IG es una
**respuesta fisiológica medida** (ISO 26642:2010), **no una función de los macros**:
dos alimentos con la misma composición pueden tener IG muy distinto (estructura del
almidón, tamaño de partícula, procesado, cocción, matriz), y CIQUAL da azúcares totales
pero **no** el reparto fructosa/glucosa/sacarosa, que sí cambia el IG. La literatura lo
confirma: los modelos de regresión/ML que intentan predecir el IG desde la composición
son **específicos de clase** y **no generalizan** (solo correlaciónan en cereales, no en
legumbres; no hay asociación entre el IG calculado por tablas y el medido en comidas
compuestas). Derivarlo de `carbsPer100g`/`fiberPer100g`/azúcares sería **inventar un
número** (falsa confianza) y, si se entrenara un modelo, exigiría las mismas tablas
restringidas. Lo prohíbe la regla del proyecto "si un número no se puede medir, no se
afirma". Si algún día se quiere algo _sin_ datos licenciados, la vía honesta **no** es el
IG calculado, sino un indicador **propio y transparente de calidad del carbohidrato**
(fibra, azúcares, grado de procesado), con su propio nombre y definición, **sin llamarlo
"IG"**.

Cobertura del dato que se usa: el indicador se apoya **solo en la fibra**
(`fiberPer100g`), que ya trae el catalogo (SPEC 26). No hay tabla de IG que curar ni campo
que persistir; por eso **no** hay bump de `CATALOG_VERSION`/`SCHEMA_VERSION`.

## Decisiones (D70-D73, implementadas 2026-10-15)

| #   | Decision                                                                   | Detalle                                                                                                                                                                                                                                                                                                                                                                                                                        | Spec | Estado  |
| --- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- | ------- |
| D70 | **Indicador propio de calidad del carbohidrato (fibra), en modo completo** | Banda **Baja/Media/Alta** derivada **solo de la fibra** (umbrales UE, Reglamento 1924/2006: fuente >=3 g, alta >=6 g por 100 g); con **forma + texto** redundantes (no solo color) y `aria-label`; se **oculta** si el alimento no es fuente de carbohidratos (>=5 g) o no hay dato de fibra. **No es el IG**. En el desglose del borrador y las detecciones; **nunca** en filas de resultado ni en el diario. No toca D10/D12 | 27   | cerrada |
| D71 | **Sin tablas de IG propietarias; enlace externo**                          | El IG **ni se calcula ni se embebe**: es una respuesta medida (ISO 26642) y las tablas publicas (Atkinson/Sydney/FAO) no son redistribuibles; un derivado seria obra derivada. La via es un **enlace a fuente externa** (o, en el futuro, una tabla propia con licencia compatible documentada)                                                                                                                                | 27   | cerrada |
| D72 | **Guardarrail de frontera IG -> dosis**                                    | Sin ranking ni orden por IG, sin IG en el diario, sin `objetivo de IG`, sin conversion IG->unidades; el indicador es de **fibra**, no de IG; cero claims de manejo de DM1                                                                                                                                                                                                                                                      | 27   | cerrada |
| D73 | **Enlace externo al IG, opt-in y por defecto off**                         | Ajuste en `Ajustes` (`localStorage`, `carbos.externalLinks`); al activarlo, el desglose ofrece un enlace que abre una **busqueda externa** (sale del dispositivo, avisado). Nada se abre sin el toque de la persona. No embebe datos                                                                                                                                                                                           | 27   | cerrada |

## Implementación (2026-10-15)

Se implementa la via de **minima friccion**: un **indicador propio de fibra** (no IG)
mas un **enlace externo** opt-in. No se embebe ninguna tabla ni se calcula el IG.

- **Nucleo:** `src/core/carbquality.ts` (funciones puras `carbQualityBand(carbsPer100g,
fiberPer100g)`: `high` >=6 g fibra, `medium` >=3 g, `low` por debajo; `null` si no es
  fuente de carbohidratos [<5 g/100 g] o no se conoce la fibra; e `isCarbSource`) +
  `carbquality.test.ts` + `carbquality.boundary.test.ts` (frontera D72).
- **UI (`src/main.ts`):** en **modo completo**, cada fila del **desglose** (borrador y
  detecciones) anade la banda (`carbQualityBadge`: 1-3 segmentos rellenos + texto; el color
  **no** distingue el nivel) y, si el enlace esta permitido **y** el alimento es fuente de
  carbohidratos, un **enlace** (`giExternalLink`, con `aria-label` y objetivo 44 px) a
  `https://duckduckgo.com/?q=<nombre> índice glucémico` (locale). En **simple** no aparece
  nada. La nota `carbquality.note` acompana al borrador y a las detecciones.
- **Ajuste:** `settings.externalLinks` (`carbos.externalLinks`), por defecto **off**; el
  aviso explica que el nombre del alimento se envia a un buscador externo.
- **i18n:** `carbquality.label/low/medium/high/note`, `gi.external`, `gi.searchSuffix`,
  `settings.externalLinks`/`Hint` (ES/EN, paridad y tildes).
- **Estilos:** `src/style.css` (banda neutra con tokens, enlace de 44 px, `forced-colors`).
- **Tests:** unitarios (`carbquality.test.ts`, `carbquality.boundary.test.ts`) + E2E nuevo
  ("calidad del carbohidrato (fibra) y enlace externo al IG"). Gate:
  `make check` (451) + `make e2e` (56/56) + `make audit-uiux` GREEN.
- **Fuera:** no hay valor numerico, ni IG embebido, ni conversion a dosis.

## Alcance

> **Estado: implementado (2026-10-15), via de minima friccion.** D70-D73 quedan
> **cerradas**. No se embebe ni se calcula el IG: se implementa el indicador propio de
> **fibra** (D70) y el **enlace externo opt-in** (D73). El bloque describe _donde_ vive
> cada pieza.

- **Datos:** ninguno nuevo. `fiberPer100g` ya existe (SPEC 26); **no** se persiste
  `giBand` ni se toca el catalogo ni el esquema (el diseno de tabla propia se
  **descarto**: ver _Coste de datos_).
- **Nucleo:** `src/core/carbquality.ts` (`carbQualityBand`/`isCarbSource`, funcion pura) y
  `src/core/carbquality.boundary.test.ts` (frontera D72). **No** se toca
  `src/core/totals.ts` (carbos) ni `src/insulin/*`.
- **UI:** `src/main.ts` — `appendCarbQuality()` (`:1393`) anade la banda y el enlace en el
  **desglose del borrador** (`renderDraft`, `:911`) y en las **detecciones**
  (`renderDetect`, `:1482`); la nota, en `renderDraftMacros` (`:1040`) y en
  `#detect-carbquality-note`. **Fuera**: `renderResultList()` (`:798`) y `mealEntry()`
  (`:1961`). El ajuste `settings.externalLinks` vive junto al modo. `src/style.css`
  (banda neutra con forma, enlace con objetivo 44 px, `forced-colors`).
- **i18n:** `src/i18n/index.ts` (claves ES/EN, guarda de paridad y de tildes).
- **Prototipos:** `prototypes/ig/` (desechables; ver abajo).

### Detalle (lo implementado)

- **F1a.** Banda **Baja/Media/Alta** con **forma** (1-3 segmentos rellenos) y **texto**;
  el color **no** distingue el nivel (sin semaforo rojo/verde). Sin numero.
- **F1b.** Ubicacion: **desglose del borrador** y **detecciones**, en **modo completo**;
  **nunca** en resultados de busqueda ni en el diario.
- **F1c.** **Oculta** si el alimento no es fuente de carbohidratos (>=5 g/100 g) o no hay
  fibra (no se inventa).
- **F1d.** La banda aparece con el **modo completo** (D70); el **enlace** es un **opt-in
  propio** (D73), por defecto off.
- **F1e.** **Enlace externo** al IG (busqueda) con nombre accesible; abre fuera de la app.
- **F1f.** Datos: **solo fibra** (dato existente). Sin tablas de IG.
- **F1g.** Guardarrail (D72): `src/core/carbquality.boundary.test.ts` comprueba que
  `src/core/totals.ts` y `src/insulin/**` no referencian el indicador.

### i18n

| Clave                        | ES                                                                                                                                                                                | EN                                                                                                                                                                                      |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `carbquality.label`          | Calidad del carbohidrato (fibra)                                                                                                                                                  | Carbohydrate quality (fiber)                                                                                                                                                            |
| `carbquality.low`            | Baja                                                                                                                                                                              | Low                                                                                                                                                                                     |
| `carbquality.medium`         | Media                                                                                                                                                                             | Medium                                                                                                                                                                                  |
| `carbquality.high`           | Alta                                                                                                                                                                              | High                                                                                                                                                                                    |
| `carbquality.note`           | Según la fibra del alimento (fuente desde 3 g; alta desde 6 g por 100 g). No es el índice glucémico ni consejo dietético.                                                         | Based on the food's fiber (source from 3 g; high from 6 g per 100 g). Not the glycemic index or dietary advice.                                                                         |
| `gi.external`                | Ver índice glucémico (fuente externa)                                                                                                                                             | See glycemic index (external source)                                                                                                                                                    |
| `gi.searchSuffix`            | índice glucémico                                                                                                                                                                  | glycemic index                                                                                                                                                                          |
| `settings.externalLinks`     | Permitir abrir fuentes externas                                                                                                                                                   | Allow opening external sources                                                                                                                                                          |
| `settings.externalLinksHint` | Muestra enlaces en el desglose (modo completo) que abren una web fuera de la app. Al tocar uno, el nombre del alimento se envía a un buscador externo. Nada se abre sin tu toque. | Shows links in the breakdown (complete mode) that open a website outside the app. When you tap one, the food name is sent to an external search engine. Nothing opens without your tap. |

> **Nota i18n.** La guarda `SIN_ACENTO` (`src/i18n/index.test.ts`) incluye ya `indice`,
> `glucemico` y `dietetico`, de modo que las cadenas ES deben llevarlos con tilde.

## Criterios de aceptacion

Los criterios marcados _(m)_ se comprueban con una formula concreta (Tests).

1. Por defecto (modo simplificado) **no** se pinta ningun indicador; en completo se pinta
   la banda de fibra (que **no** es IG). _(m)_
2. El indicador aparece **solo** en el desglose del borrador y en las detecciones;
   **nunca** en resultados de busqueda ni en el diario. _(m)_
3. La banda es **cualitativa**, con **texto y forma** redundantes y **sin numero**; el
   color **no** distingue el nivel (sin semaforo rojo/verde). _(m)_
4. Un alimento **sin carbohidratos** (o sin fibra) **no** muestra banda (no se inventa). _(m)_
5. El **total de carbohidratos** y el objetivo **no cambian** se muestre o no el
   indicador. _(m)_
6. La **nota** ("no es el índice glucémico ni consejo dietético") es visible junto al
   indicador, en el borrador y en las detecciones. _(m)_
7. El **enlace externo** al IG es **opt-in** (por defecto off), no embebe datos, tiene
   nombre accesible y objetivo tactil >= 44 px. _(m)_
8. **Sin tablas propietarias embebidas:** ningun artefacto versionado contiene valores
   copiados de Atkinson/Sydney/FAO.
9. **Sin cruce regulatorio** (estructural): ningun modulo de `src/insulin/*` ni el camino
   del calculo referencia el indicador ni el IG. _(m)_
10. **i18n:** toda clave nueva existe en **es** y **en**, con tildes correctas.
11. **Sin regresiones:** SPEC 22-26 siguen verdes.
12. `make check` + `make e2e` (56/56) + `make audit-uiux` en verde. _(m)_
13. **Go/no-go (_m_).** Criterio **vivo**: si el indicador no demuestra utilidad sin
    volverse consejo, se retira (como FPU/eCarbs). Queda pendiente de uso real.

## Tests

- **Unitarios** (vitest): `src/core/carbquality.test.ts` (umbrales, no aplica, sin fibra);
  `src/core/carbquality.boundary.test.ts` (frontera D72: `src/core/totals.ts` y
  `src/insulin/**` no referencian el indicador); `src/i18n/index.test.ts` (paridad y tildes).
- **E2E** (Firefox, `make e2e`): en simple no hay banda; en completo aparece con forma +
  texto ("Alta" en garbanzos) y el total de carbos no cambia; el enlace esta oculto por
  defecto, se activa, mide >= 44 px y persiste; ni banda ni enlace en el diario.
- **Auditoria** (`make audit-uiux`): verde. _La auditoria no abre Ajustes, asi que la
  cobertura especifica de la banda y el enlace la aportan los tests unitarios y el E2E._
- **Gate**: `make check`.

## Prototipos (UX)

> **Seccion adicional** al patron de 13 secciones, propia de una spec con investigacion y
> prototipos.

Desechables y **no versionados** (`.gitignore:12` ignora `prototypes/`, como manda la
convencion del repo): son mockups locales para decidir, no un entregable de build.
Autocontenidos en lo posible (datos ficticios, sin red, sobre el CSS de la app
`prototypes/_app.css`), comparados en un `index.html` con badge, captura y "Abrir".

Variantes construidas:

- **H1 - Banda en el desglose (recomendada).** Carbos (principal) + banda "IG estimado:
  Bajo/Medio/Alto" con forma y texto; incluye la **explicacion colapsada** (F2).
- **H2 - Insignia en la fila.** Chip por resultado; contrasta el ruido/moralizacion
  (variante a descartar, se incluye para verla).
- **H3 - Enlace externo.** "Ver IG (fuente externa)" + nota; valida F3.
- **H4 - Educativo.** Bloque colapsado "¿que es el IG?" sin valor por alimento.
- **H5 - Numero + banda.** El extremo "numero de IG" (C1): muestra por que la precision
  falsa es un problema de UX.
- **H6 - Semaforo puro.** El extremo "solo color" (C2): muestra por que falla en
  accesibilidad (sin texto/forma).
- **C13 - Nada.** Control honesto (estado actual).

La recomendacion (H1, con C13 como control y C13/H5/H6 como contraste) se presenta en el
indice; la etiqueta "Recomendada" es la convencion del repo para la variante propuesta.

### Resultado (2026-10-15)

Construidos y verificados (desechables; `prototypes/` esta en `.gitignore`):

- **Ficheros:** `prototypes/ig/index.html` (comparacion), `h1-detalle.html`, `h2-fila.html`,
  `h3-enlace.html`, `h4-educativo.html`, `h5-numero.html`, `h6-semaforo.html`,
  `c13-nada.html`; capturas en `prototypes/shots/ig-*.png`; verificador
  `prototypes/shots/render-ig.mjs` (mismo arranque de Firefox que `e2e`: honra
  `CARBOS_FIREFOX`).
- **Verificacion automatica (claro y oscuro; movil 390x844 + escritorio 1440x900):**
  sin errores de consola ni desborde; en **H1** cada banda tiene **texto + forma
  (3 segmentos) + `aria-label`** y **contraste numerico >= 4,5:1** (no se acepta un
  contraste no calculable); `H3`/`H4`/`C13` **no** muestran ningun valor por alimento; en
  H5 se registra el numero y en H6 la ausencia de texto (defectos documentados del
  extremo descartado); las imagenes del indice cargan.
- **Recomendacion:** **H1 es la base** (F1+F2), con **H3** como respaldo de datos (F3).
  **H2, H5 y H6 se descartan** (ruido, precision falsa y color unico). **C13 ("nada")**
  sigue siendo la alternativa honesta si H1 no demuestra utilidad (criterio 13).
- **Como verlo:** abrir `prototypes/ig/index.html` (doble clic; no necesita servidor).
  `node prototypes/shots/render-ig.mjs` regenera las capturas y revalida la semantica.

## Fuera de alcance

- **Carga glucemica (GL) cuantificada / FPU / eCarbs / carbos extendidos / dual-wave:**
  existe para calcular insulina; cruza D10.
- **Conversion IG -> insulina** y cualquier "output" usado para decidir dosis (FDA
  _General Wellness_ / MDR UE).
- **Numero de IG** y cualquier "impacto glucemico" cuantificado: la banda basta.
- **Calcular el IG (o la GL) desde la composicion** del alimento o con un modelo: el IG
  es una respuesta **medida**, no derivable; los modelos de regresion/ML son especificos
  de clase y no generalizan, y ademas exigirian las tablas restringidas para entrenar.
- **Ranking/orden por IG, objetivos de IG** y recomendaciones dieteticas.
- **IG en el diario** y en filas de resultado (ruido y moralizacion).
- **Embeber tablas propietarias** (Atkinson 2021, Sydney, FAO/WHO) o derivados suyos.
- **Cambios en la deteccion** (D12), en la aritmetica de insulina (D10) y en el
  export/import salvo la tolerancia a campos nuevos.
- **Backend, red en runtime, cuentas y analitica** (D11).

## Riesgos

- **Leido como recomendacion dietetica.** Mitigacion: banda sin numero, sin ranking ni
  colores de "mejor/peor"; nota "estimado, no consejo"; tono "permiso, no prohibicion" (R2).
- **Insinua bolo extendido (cruza D10).** Mitigacion: co-ubicar con los macros y lejos de
  la insulina; opcional y periferico; test de frontera IG->unidades (D72).
- **Reclasificacion como dispositivo.** Mitigacion: uso previsto "informacion cualitativa
  secundaria"; cero claims de manejo de DM1.
- **Precision falsa.** Mitigacion: nunca un numero; "estimado"; **ocultar** si no hay dato
  defendible (no derivar).
- **Intentar calcular el IG desde la composicion.** Mitigacion: no derivarlo nunca; si se
  quiere algo sin datos licenciados, un indicador **propio y transparente de calidad del
  carbohidrato** (sin llamarlo "IG") o el enlace externo.
- **Moralizacion / culpa.** Mitigacion: sin semaforo rojo-verde como unico canal, sin
  lenguaje "bueno/malo"; banda con texto descriptivo.
- **Datos/licencias (obra derivada).** Mitigacion: enlace externo o tabla propia con
  licencia compatible; nunca embeber tablas de terceros ni derivados; no contaminar el
  share-alike de OFF (ODbL).
- **Utilidad no demostrada.** Mitigacion: criterio **go/no-go** (13); si no aporta sin ser
  consejo, se aplica C13 (como FPU/eCarbs).
- **Accesibilidad.** Mitigacion: canal redundante (texto/forma), `aria-label` con la banda,
  contraste texto >= 4,5:1 y borde >= 3:1 (WCAG 1.4.11), `forced-colors`, reduced-motion;
  verificado en claro y oscuro.

## Referencias

- **Ciencia/DM1:** Annan et al., ISPAD 2022, _"The use of the glycemic index provides
  additional benefit to glycemic management over that observed when total carbohydrate is
  considered alone"_ (grado B) y _"In T1D, GI should not be used in isolation, but together
  with a method of carbohydrate quantification"_ (https://doi.org/10.1111/pedi.13429); ADA
  2025 _Standards of Care_ (https://pmc.ncbi.nlm.nih.gov/articles/PMC11519289/); Thomas &
  Elliott, Cochrane 2009 (https://doi.org/10.1002/14651858.CD006296.pub2); Chiavaroli et
  al., BMJ 2021 (https://doi.org/10.1136/bmj.n1651); Zafar et al., AJCN 2019
  (https://doi.org/10.1093/ajcn/nqz149); Parillo et al. 2011
  (https://pubmed.ncbi.nlm.nih.gov/21219435); Bell et al. 2015
  (https://doi.org/10.2337/dc15-0100); Matthan et al. 2016
  (https://doi.org/10.3945/ajcn.116.137208); Vega-Lopez et al. 2007
  (https://doi.org/10.2337/dc06-1598); ISO 26642:2010
  (https://www.iso.org/standard/43633.html).
- **IG predecible desde la composicion (y por que no basta):** Al Hamli et al. 2011
  (https://doi.org/10.1017/S002966511100173X, solo cereales); Li & Arandjelović 2017
  (https://doi.org/10.1109/BHI.2017.7897279); Flint et al. 2004
  (https://doi.org/10.1079/BJN20041124, el IG calculado por tablas no predice el medido
  en comidas compuestas); Rytz et al. 2019 (https://www.mdpi.com/2072-6643/11/5/1172).
- **UX:** etiquetado traffic-light UK
  (https://www.gov.uk/government/publications/check-the-label/check-the-label); GI Symbol /
  Glycemic Index Foundation (https://www.gifoundation.com/gifsa-endorsement/gi-symbol/);
  Nutri-Score (https://www.santepubliquefrance.fr/en/nutri-score); WCAG 1.4.1
  (https://www.w3.org/WAI/WCAG22/Understanding/use-of-color); MDN _Use of color_
  (https://developer.mozilla.org/en-US/docs/Web/Accessibility/Guides/Understanding_WCAG/Perceivable/Use_of_color);
  O'Neill et al., CHI 2024 (https://doi.org/10.1145/3613904.3642600); Health Canada y el IG
  (https://ajcn.nutrition.org/article/S0002-9165(23)05172-9/fulltext).
- **Datos/licencias:** Atkinson et al. 2021 (https://doi.org/10.1093/ajcn/nqab233);
  Universidad de Sydney (https://glycemicindex.com/copyright-and-permission/); FAO/WHO 1998
  (https://www.fao.org/4/w8079E/w8079e00.htm); CIQUAL
  (`tools/catalog/.cache/xml/const_2020_07_07.xml`); Open Food Facts, ODbL
  (https://world.openfoodfacts.org/terms-of-use).
- **Regulacion:** FDA _General Wellness: Policy for Low Risk Devices_ (2026); MDR UE
  2017/745 y MDCG 2019-16.
- **Repo:** `src/main.ts` (`renderDraft` :879, `renderDetect` :1370, `renderResultList`
  :766, `mealEntry` :1837, `macroBreakdown` :1286, `macroFields` :1242, `resolveItem`
  :1213); `src/catalog/types.ts` (`Food`, `CATALOG_VERSION`); `src/core/types.ts`
  (`FoodItem`); `src/style.css` (`.chip` :297, `.macro-breakdown` :1222);
  `src/chat/boundary.test.ts` y `src/barcode/boundary.test.ts` (patron de frontera);
  `docs/specs/16-uiux-v2.md:171` (identidad calma); `docs/specs/26-diario-modos-simplificado-completo.md`
  (D67-D69); `docs/decisiones.md` (D10, D11, D12, D16, D19, D67, D70-D73, reglas de
  redaccion :123); `docs/receta-de-codigo.md`.
