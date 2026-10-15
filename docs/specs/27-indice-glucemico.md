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
> Decisiones **D70-D72** (propuestas). No toca el camino del calculo (D12) ni el de la
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

Esta spec **no implementa** la funcion: documenta la investigacion, filtra las
candidatas, **construye prototipos** para elegir la mejor UX y deja las decisiones en
**propuesta**, listas para decidir con los prototipos delante.

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
  "preciso" (`docs/decisiones.md:123`).
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

Cobertura aproximada sobre los **186 alimentos** (172 CIQUAL + 14 recetas propias; el
recuento "154" del README esta desactualizado): frutas, cereales, legumbres, lacteos y
dulces (~95-110) admitirian curacion; los platos compuestos (~40-50) se **omiten**;
los alimentos sin carbohidrato (~30-40) **no aplican**. Si finalmente se persiste como
campo opcional, se sigue el **patron SPEC 26/D68** (campo `?` en `Food`/`FoodItem`, Zod
tolerante, `CATALOG_VERSION`/`SCHEMA_VERSION` bumpeados con test).

## Decisiones nuevas (propuesta D70-D72)

| #   | Decision                                                      | Detalle                                                                                                                                                                                                                                                                                                                                                                                        | Estado    |
| --- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| D70 | **IG cualitativo, opcional y solo en el desglose**            | Banda Bajo/Medio/Alto con texto y forma redundantes (no solo color), **sin numero**, marcada "estimado"; en el contexto de composicion del alimento (desglose del borrador/detecciones), **nunca** en filas de resultado ni en el diario; incluye la **explicacion colapsada** (F2). **Opt-in propio** en `Ajustes`, por defecto oculto e **independiente del modo completo**. No toca D10/D12 | propuesta |
| D71 | **Sin tablas de IG propietarias; dato por alimento o enlace** | El valor solo puede venir de una **tabla propia curada alimento a alimento con fuente, metodologia y licencia compatible** (o permiso); en otro caso, **enlace a fuente externa**; se **omite** si no aplica. Se reconoce que una banda derivada de Atkinson/Sydney/FAO seria **obra derivada**: no se embebe. Campo opcional tolerante (patron D68) si se persiste                            | propuesta |
| D72 | **Guardarrail de frontera IG -> dosis**                       | Sin ranking ni orden por IG, sin IG en el diario, sin `objetivo de IG`, sin conversion IG->unidades ni IG->carbos->insulina; textos de "estimado, no consejo dietetico ni guia de insulina"; **test de frontera** que prohibe cualquier ruta IG->unidades                                                                                                                                      | propuesta |

## Alcance

> **Estado de esta spec: investigacion y prototipos.** Las decisiones D70-D72 quedan
> en **propuesta**; la implementacion en la app se decide **con los prototipos delante**
> y **tras** resolver la procedencia/licencia del dato. El alcance de abajo describe
> _donde iria_ cada pieza si se aprueba.

- **Datos:** `tools/catalog/build_catalog.py` (si se persiste: tabla **propia curada por
  alimento**, con metodologia y licencia; **no** desde CIQUAL/USDA),
  `tools/catalog/test_build_catalog.py`, `src/catalog/types.ts` (`Food.giBand?`,
  `CATALOG_VERSION`), `src/catalog/schema.ts`, `catalog.ts` (regenerado con `make catalog`).
- **Nucleo:** `src/core/types.ts` (`FoodItem.giBand?` opcional, patron D68),
  `src/core/schema.ts`, `src/core/migrate.ts` (tolerante, acepta la version previa),
  `src/core/export.ts` (tolerancia a campos nuevos). **No** se toca `src/core/totals.ts`
  (carbos) ni `src/insulin/*`.
- **UI:** `src/main.ts` — `macroBreakdown()` (`:1286`) y `renderDraft()` (`:879`) para
  co-ubicar el indicador con los macros; `renderDetect()` (`:1370`) para las detecciones;
  **fuera**: `renderResultList()` (`:766`) y `mealEntry()` (`:1837`). Reutiliza
  `macroFields()` (`:1242`) y `resolveItem()` (`:1213`). `src/style.css` (banda/etiqueta
  con forma, tokens, reduced-motion, `forced-colors`).
- **i18n:** `src/i18n/index.ts` (claves ES/EN, guarda de paridad).
- **Prototipos:** `prototypes/ig/` (desechables; ver abajo).

### Detalle

- **F1a.** Indicador **Banda + etiqueta** ("Bajo/Medio/Alto") con **texto y forma**
  redundantes y `aria-label` que nombra la banda; la nota `gi.estimateNote` visible. Sin numero.
- **F1b.** Ubicacion: en el **desglose del borrador** y en las **detecciones**, junto a
  los macros; **nunca** en resultados de busqueda ni en el diario.
- **F1c.** **Oculto** si el alimento no aporta carbohidratos o no hay estimacion
  defendible (no se inventa).
- **F1d.** **Opt-in propio, por defecto oculto**, en `Ajustes` (`localStorage`),
  **independiente** del modo completo.
- **F1e.** **Explicacion colapsada** "¿que es el IG?" (patron `<details>`) y **enlace
  externo** (F3) cuando no hay valor propio.
- **F1f.** Datos: tabla **propia por alimento** con metodologia y licencia, marcada
  estimada; las 14 recetas propias **se omiten** (plato compuesto); test de "no inventa".
- **F1g.** Guardarrail (D72): test de frontera que comprueba que ningun modulo
  `src/insulin/*` ni el camino del calculo referencia el IG.

### i18n

| Clave              | ES                                                                      | EN                                                             |
| ------------------ | ----------------------------------------------------------------------- | -------------------------------------------------------------- |
| `gi.label`         | Índice glucémico (estimado)                                             | Glycemic index (estimated)                                     |
| `gi.low`           | Bajo                                                                    | Low                                                            |
| `gi.medium`        | Medio                                                                   | Medium                                                         |
| `gi.high`          | Alto                                                                    | High                                                           |
| `gi.estimateNote`  | Estimación de composición. No es consejo dietético ni guía de insulina. | Estimated composition. Not dietary advice or insulin guidance. |
| `gi.notApplicable` | Sin carbohidratos: no aplica                                            | No carbs: not applicable                                       |
| `gi.learn`         | ¿Qué es el índice glucémico?                                            | What is the glycemic index?                                    |
| `gi.external`      | Ver IG en una fuente externa                                            | See GI in an external source                                   |
| `settings.giLabel` | Mostrar el índice glucémico estimado                                    | Show estimated glycemic index                                  |

> **Nota i18n.** Las cadenas ES propuestas llevan **tildes** (índice, glucémico,
> estimación, dietético, guía, qué). La guarda de `src/i18n/index.test.ts` exige tildes
> en ES y usa una lista blanca `SIN_ACENTO` para palabras sin tilde (p. ej. "kcal"): al
> implementar hay que **anadir nuevas palabras sin tilde** a esa lista si aparecen (p. ej.
> "insulina" no la necesita, pero "glucemico"/"indice" si llevan tilde). Si alguna clave
> coincide ES/EN debera anadirse a `IGUALES_PERMITIDAS`.

## Criterios de aceptacion

Los criterios marcados _(m)_ se comprueban con una formula concreta (Tests).

1. Por defecto (opt-in oculto) **no** se pinta ningun indicador de IG; la vista coincide
   con la de hoy (simplificado) y con la de completo **sin** IG. _(m)_
2. Al activarlo, el indicador aparece **solo** en el desglose del borrador y en las
   detecciones; **nunca** en resultados de busqueda ni en el diario. _(m)_
3. El indicador es una **banda cualitativa** con **texto y forma** redundantes (no solo
   color) y **sin ningun numero** de IG. _(m)_
4. Un alimento **sin carbohidratos** o sin estimacion defendible **no** muestra
   indicador (no se inventa). _(m)_
5. El **total de carbohidratos** y el objetivo **no cambian** se muestre o no el IG. _(m)_
6. La **nota** "estimado / no consejo" es visible junto al indicador. _(m)_
7. Existe una **explicacion colapsada** y, cuando no hay valor propio, un **enlace
   externo** en lugar de un numero. _(m)_
8. **Sin tablas propietarias embebidas:** ningun artefacto versionado del repo contiene
   valores copiados de Atkinson/Sydney/FAO; si hay dato embebido, es una tabla propia con
   fuente, metodologia y licencia compatible documentadas.
9. **Sin cruce regulatorio** (estructural): ningun modulo de `src/insulin/*` ni el camino
   del calculo referencia el IG ni el concepto de banda. _(m)_
10. **i18n:** toda clave nueva existe en **es** y **en**, con tildes correctas; guarda de
    paridad intacta.
11. **Sin regresiones:** SPEC 22-26 siguen verdes.
12. `make check` (+ `make e2e` con los escenarios nuevos) en verde. _(m)_
13. **Go/no-go (_m_).** Si al probar H1 (uso real o revision) no demuestra utilidad
    informativa **sin volverse consejo** o exige datos que no se pueden licenciar, se aplica
    **C13** (aplazar/omitir) y la feature no se implementa. Este criterio es bloqueante.

## Tests

- **Unitarios** (vitest):
  - `src/catalog/`: banda por **alimento** (no por categoria); "no aplica" en alimentos
    sin carbohidrato; cobertura de la tabla propia; paridad con el esquema zod.
  - `src/core/migrate.ts`: si se persiste el campo, version previa migra tolerante
    (patron SPEC 26).
  - **Frontera (D72):** test que comprueba que `src/core/totals.ts` y `src/insulin/*` no
    referencian el IG (analogo a los boundary tests `src/chat/boundary.test.ts` y
    `src/barcode/boundary.test.ts`).
  - `src/i18n/index.test.ts`: guarda de paridad cubre las claves nuevas y las tildes.
- **E2E** (Firefox, `make e2e`): por defecto no hay indicador; al activarlo aparece en el
  borrador con banda + texto (no solo color) y el total de carbos no cambia; no aparece en
  el diario.
- **Auditoria** (`make audit-uiux`): la banda y el control opt-in cumplen contraste
  (texto >= 4,5:1; borde >= 3:1) y objetivo tactil (MIN_HIT=44) y no dependen del color.
- **Gate**: `make check`.

## Prototipos (UX)

> **Seccion adicional** al patron de 13 secciones, propia de una spec de investigacion
> (la implementacion no esta aprobada aun).

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
  (D67-D69); `docs/decisiones.md` (D10, D11, D12, D16, D19, D67, D70-D72, reglas de
  redaccion :123); `docs/receta-de-codigo.md`.
