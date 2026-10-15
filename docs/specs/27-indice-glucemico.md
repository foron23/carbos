# 27 - Indice glucemico (IG) en los alimentos: indicador visual

> [!abstract] TL;DR
> Investigacion (internet, 2026-10-15; cuatro angulos) mas auditoria offline del
> repo sobre **como integrar el indice glucemico (IG)** en los alimentos cuando se
> visualizan. **Veredicto: se puede, pero acotado y con guardarrailes estrictos, y
> el margen sobre no hacerlo es estrecho.** El IG **no cambia el numero** de
> carbohidratos: en DM1 describe la **forma/timing** de la curva glucemica, que es
> territorio de la **dosis** (D10). Ademas la evidencia en DM1 es debil (mayoria
> DM2; ISPAD 2022 lo admite "no aislado") y la variabilidad intra-individual es
> alta (CV 20-43 %) -> **nunca un numero**, solo una **banda cualitativa** con
> texto redundante (WCAG 1.4.1), **en la ficha del alimento, no en filas ni en el
> diario, y opcional**. **Bloqueo de datos:** ninguna tabla de IG (Atkinson 2021,
> Universidad de Sydney, FAO/WHO 1998) es redistribuible bajo AGPL-3.0; CIQUAL y
> USDA **no traen IG**. Se propone un mapeo **propio por categoria** (documentado y
> marcado como estimado), con **enlace a fuente externa** como respaldo, o
> **omitir** el dato. Se construyen **prototipos desechables** para fijar la mejor
> UX. Decisiones **D70-D72** (propuestas). No toca el camino del calculo (D12) ni
> el de la dosis (D10); sin backend, sin dependencias nuevas y sin red en runtime
> (D11).

## Contexto

Desde SPEC 26 la app muestra **solo carbohidratos** en modo simplificado y anade
**macros y kcal como composicion** en modo completo (D67-D69). Hay una pregunta
recurrente de quien convive con DM1: _"¿y el indice glucemico?"_. Conocer el IG de
un alimento es una practica extendida (etiquetado voluntario, apps de diabetes) y
promete una lectura **cualitativa** que el conteo de carbohidratos no da: no
_cuantos_ carbohidratos, sino _como de rapido_ suben.

El hueco es real, pero tambien lo son tres tensiones que esta spec tiene que
resolver antes de tocar codigo:

- **Cientifica.** El IG **no cambia el conteo**; en DM1 lo que cambia es la
  **forma** de la curva. Eso lo situa muy cerca del bolo extendido/dual, que es
  **dosis** (D10), el terreno que el nucleo rechaza.
- **De datos.** El IG **no esta** en el pipeline del catalogo (CIQUAL 2020 y USDA
  FDC no traen IG; `tools/catalog/.cache/xml/const_2020_07_07.xml` no tiene ningun
  `const_code` de IG ni de carga glucemica), y las tablas publicas de IG **no son
  redistribuibles** (ver _Coste de datos_).
- **Regulatoria/identidad.** El IG es **accionable** (guia _que elegir_), a
  diferencia de los macros. Un indicador puede leerse como **recomendacion
  dietetica** o insinuar ajuste de insulina, y ademas choca con la identidad
  **calma** ("un solo numero: carbohidratos", D9/SPEC 16).

Esta spec **no implementa** la funcion: documenta la investigacion, filtra las
candidatas, **construye prototipos** para elegir la mejor UX y deja las decisiones
en **propuesta**, listas para decidir con prototipos delante.

## Metodo

1. **Investigacion en internet (2026-10-15)** en cuatro angulos: (a) **ciencia y
   DM1** (IG vs carga glucemica vs respuesta; ISPAD 2022, ADA 2025, Cochrane,
   Parillo 2011, Matthan 2016); (b) **UX** de comunicacion del IG (semaforo UK,
   GI Symbol, Nutri-Score, apps); (c) **datos y licencias** (Atkinson 2021,
   Universidad de Sydney, FAO/WHO 1998, CIQUAL/USDA, cobertura sobre 186); (d)
   **regulacion y etica** (FDA _General Wellness_, MDR UE, comparacion con la
   decision de macros de SPEC 26).
2. **Auditoria offline del repo** (dos unidades): superficies donde se pinta un
   alimento y sus puntos de insercion; y convenciones (specs, decisiones,
   patron de campo opcional, prototipos).
3. **Long-list** de candidatas (13) con el patron comun documentado.
4. **Filtro** por cuatro criterios con la misma escala (1-3): **Impacto**,
   **Frecuencia**, **Esfuerzo** (3 = menos esfuerzo -> mas puntua) y **Encaje**
   con los guardarrailes (D9, D10, D11, D12, D16/WCAG, identidad calma).
5. **Seleccion** de la mejor (mayor total y encaje alto), descartando el resto
   con su motivo. Se construyen **prototipos** de las variantes finalistas.

## Candidatas y filtro

| #   | Candidata                                                | Impacto | Frec. | Esfz. | Encaje | Total | ¿Elegida? | Motivo del descarte                                                                  |
| --- | -------------------------------------------------------- | ------- | ----- | ----- | ------ | ----- | --------- | ------------------------------------------------------------------------------------ |
| C1  | Numero de IG + banda de color                            | 2       | 2     | 2     | 1      | 7     | no        | Precision falsa (CV 20-43 %, R1) y color unico (WCAG 1.4.1)                          |
| C2  | Solo banda de color (semaforo)                           | 2       | 2     | 2     | 1      | 7     | no        | Moraliza (CHI 2024) y depende del color; falla con daltonismo                        |
| C3  | Carga glucemica (GL) por porcion                         | 2       | 2     | 1     | 1      | 6     | no        | Se acerca a "cuantificar" y a la dosis; esfuerzo alto (requiere IG + carbos exactos) |
| C4  | Icono/insignia minimalista                               | 2       | 2     | 3     | 2      | 9     | no        | Binario/ambiguo sin texto; el canal redundante es obligatorio                        |
| C5  | Barra segmentada de 3 tramos                             | 2       | 2     | 2     | 2      | 8     | no        | Muestra un continuo que el dato no sostiene; ambigua sin etiqueta                    |
| C6  | **Banda + etiqueta textual (sin numero), en la ficha**   | 2       | 2     | 3     | 3      | 10    | **F1**    | —                                                                                    |
| C7  | Indicador en filas de resultado                          | 2       | 3     | 2     | 1      | 8     | no        | Satura el escaneo y moraliza; "una senal por pantalla" (R2)                          |
| C8  | Indicador en el diario                                   | 1       | 3     | 2     | 1      | 7     | no        | Convierte cada comida en un juicio recurrente; riesgo regulatorio (R4)               |
| C9  | **Explicacion educativa ("¿que es el IG?")**             | 3       | 1     | 3     | 3      | 10    | **F2**    | Absorbida por F1 (nota educativa colapsada)                                          |
| C10 | Segunda metrica ignorable (colapsada)                    | 1       | 1     | 3     | 3      | 8     | no        | Es la forma de F1; no una feature aparte                                             |
| C11 | **Enlace/consulta a fuente externa (sin dato embebido)** | 2       | 1     | 3     | 3      | 9     | **F3**    | Respaldo de datos de F1 (evita licencias y precision falsa)                          |
| C12 | Indicador agregado por comida (no por alimento)          | 2       | 2     | 1     | 2      | 7     | no        | Agregar IG de una comida mixta no es defendible (R1/R3)                              |
| C13 | **Nada (rechazar/aplazar la feature)**                   | 1       | 1     | 3     | 3      | 8     | runner-up | Opcion honesta; con evidencia debil en DM1 el margen es estrecho                     |

**Elegidas: C6 (F1), con C9 (F2) y C11 (F3) como partes.** F1 es el nucleo; F2
(educacion) y F3 (enlace externo) la acompanan: F3 resuelve el bloqueo de datos
(no se embebe ninguna tabla) y F2 da el encuadre "permiso, no prohibicion" (R2).
El resto se descarta por precision falsa, ruido, moralizacion o cruce con la dosis.

> **Runner-up honesto: C13 (nada).** Con la evidencia actual en DM1 (R1) y el
> coste de datos (R3), F1 debe ser **barata, opcional y desmontable**. Si al
> probar los prototipos no demuestra utilidad informativa sin volverse consejo,
> se aplaza igual que FPU/eCarbs.

## La elegida: banda cualitativa opcional en la ficha

**Que.** Un **indicador de IG estimado, cualitativo y opcional**, que solo aparece
**cuando el alimento se muestra en su contexto de composicion** (el desglose del
borrador y las detecciones), **nunca** en las filas de resultado de busqueda ni en
el diario. Muestra una **banda** ("Bajo / Medio / Alto") con **texto y forma
redundantes** (no solo color) y la nota _"estimado: composicion, no consejo"_. No
muestra **ningun numero** de IG. Se **oculta** cuando el alimento no aporta
carbohidratos o el dato no es defendible. Incluye una **explicacion colapsada**
("¿que es el IG?") y, cuando no hay estimacion propia, un **enlace a una fuente
externa** en lugar de un valor.

**Por que asi (y no de otra forma).**

- **No un numero.** La variabilidad intra-individual (CV 20-43 %, R1) y la
  dependencia de coccion/proceso hacen que un valor puntual engane; ademas la
  regla de redaccion prohibe "preciso" (`docs/decisiones.md:120`).
- **Banda + texto + forma.** WCAG 1.4.1 (Uso del color): el color no puede ser el
  unico canal; se anaden etiqueta y forma (G14/G111, R2).
- **No en filas ni en el diario.** Una senal por pantalla (R2); el diario es el
  lugar donde mas danaria (juicio recurrente, R4).
- **Opcional y por defecto off.** Respeta la identidad calma; se puede activar
  junto al modo completo (D67) o como ajuste propio. Desmontable.

**Tabla de que va / que no va.**

| Va                                                                  | No va                                                                |
| ------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Banda cualitativa (Bajo/Medio/Alto) en la ficha, marcada "estimado" | Numero de IG, carga glucemica (GL), "impacto glucemico" cuantificado |
| Texto + forma redundantes con el color; `aria-label` con la banda   | Color como unico canal; flechas o ranking por IG                     |
| Explicacion colapsada y enlace externo                              | Recomendacion ("mejor", "elige", "deberias"), objetivos de IG        |
| Co-ubicada con los macros, lejos de la insulina                     | En filas de busqueda, en el diario, junto al registro de insulina    |
| Omitir cuando no aplica (sin carbohidrato / sin dato)               | Inventar, derivar de la foto o "estimar" sin metodologia documentada |

**Veredicto razonado.** El IG es **informacion de composicion**, no un calculo. Se
trata como los macros (D67), con un guardarrail extra: **es accionable**, asi que
la redaccion y la ubicacion importan mas. El encabezado y la nota deben dejar
claro que **no es consejo dietetico ni guia de insulina**, y el dato **no puede
entrar en ningun camino que lleve a unidades** (D10/D12).

## Coste de datos (prerequisito)

El IG **no es derivable** del pipeline actual: CIQUAL 2020 no trae IG/GL (revisado
`tools/catalog/.cache/xml/const_2020_07_07.xml`, 68 `const_code`; ninguno es IG) y
USDA FDC tampoco. Las tablas publicas de IG tienen **licencias incompatibles** con
AGPL-3.0:

| Fuente                                    | Acceso               | Redistribucion                             | ¿Embeber en la PWA?    |
| ----------------------------------------- | -------------------- | ------------------------------------------ | ---------------------- |
| Atkinson et al. 2021 (AJCN)               | lectura gratis       | "no uso comercial" / Elsevier user license | **No**                 |
| Universidad de Sydney (glycemicindex.com) | de pago / all rights | permiso obligatorio / pago                 | **No**                 |
| FAO/WHO 1998 (FN Paper 66, Tabla 8)       | lectura gratis       | "All rights reserved"                      | **No**                 |
| Repos GitHub "abiertos"                   | variable             | derivan de las tablas anteriores           | **No** (origen dudoso) |
| **Mapeo propio por categoria**            | propio               | AGPL-3.0 (obra propia)                     | **Si**                 |

**Solucion propuesta (F1+F3):** un **mapeo propio por categoria** de alimento
(curado y documentado, sin copiar tablas de terceros), marcado como **estimado**;
donde no sea defendible, **se omite** el dato o se ofrece el **enlace externo**
(F3). Este mapeo es una **estimacion de composicion**, no un valor de laboratorio.

Cobertura aproximada sobre los **186 alimentos** (172 CIQUAL + 14 recetas propias
— nota: el recuento "154" del README esta desactualizado):

| Grupo                                                            | Aprox.  | Tratamiento                                               |
| ---------------------------------------------------------------- | ------- | --------------------------------------------------------- |
| Frutas, cereales, legumbres, lacteos, dulces                     | ~95-110 | Mapeo propio de categoria, marcado "estimado"             |
| Platos compuestos (CIQUAL y recetas propias)                     | ~40-50  | Omitir o "estimado" conservador; nunca derivar de la foto |
| Sin carbohidrato (carne, pescado, huevo, verduras no feculentas) | ~30-40  | **No aplica** -> se oculta el indicador                   |

Si finalmente se persiste el dato como campo opcional, se sigue el **patron de
SPEC 26/D68** (campo `?` en `Food`/`FoodItem`, Zod tolerante, `CATALOG_VERSION`/
`SCHEMA_VERSION` bumpeados con test). **Prerequisito de decision:** metodologia del
mapeo escrita y revisada antes de escribir el primer valor.

## Decisiones nuevas (propuesta D70-D72)

| #   | Decision                                        | Detalle                                                                                                                                                                                                                                                                                    | Estado    |
| --- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| D70 | **IG cualitativo, opcional y solo en la ficha** | Banda Bajo/Medio/Alto con texto y forma redundantes (no solo color), **sin numero**, marcada "estimado"; en el contexto de composicion del alimento (desglose del borrador/detecciones), **nunca** en filas de resultado ni en el diario. Por defecto oculto; desmontable. No toca D10/D12 | propuesta |
| D71 | **Sin tablas de IG propietarias embebidas**     | El dato sale de un **mapeo propio por categoria** (documentado) o de un **enlace a fuente externa** (F3); se **omite** si no aplica. Atkinson/Sydney/FAO **no** se redistribuyen. Campo opcional tolerante (patron D68) si se persiste; `CATALOG_VERSION`/`SCHEMA_VERSION` con test        | propuesta |
| D72 | **Guardarrail de frontera IG -> dosis**         | Sin ranking ni orden por IG, sin IG en el diario, sin `objetivo de IG`, sin conversion IG->unidades ni IG->carbos->insulina; textos de "composicion estimada, no consejo dietetico ni guia de insulina"; **test de frontera** que prohíbe cualquier ruta IG->unidades                      | propuesta |

## Alcance

> **Estado de esta spec: investigacion y prototipos.** Las decisiones D70-D72
> quedan en **propuesta**; la implementacion en la app se decide **con los
> prototipos delante** y **tras** fijar la metodologia del mapeo de datos. El
> alcance de abajo describe _donde iria_ cada pieza si se aprueba.

- **Datos:** `tools/catalog/build_catalog.py` (si se persiste: mapeo propio por
  categoria como dato curado, **no** desde CIQUAL/USDA), `tools/catalog/test_build_catalog.py`,
  `src/catalog/types.ts` (`Food.giBand?`, `CATALOG_VERSION`), `src/catalog/schema.ts`,
  `catalog.ts` (regenerado con `make catalog`).
- **Nucleo:** `src/core/types.ts` (`FoodItem.giBand?` opcional, patron D68),
  `src/core/schema.ts`, `src/core/migrate.ts` (tolerante, acepta la version
  previa), `src/core/export.ts` (tolerancia a campos nuevos). **No** se toca
  `src/core/totals.ts` (carbos) ni `src/insulin/*`.
- **UI:** `src/main.ts` — `macroBreakdown()` (`:1286`) y `renderDraft()`
  (`:879`) para co-ubicar el indicador con los macros; `renderDetect()` (`:1370`)
  para las detecciones; **fuera**: `renderResultList()` (`:766`) y `mealEntry()`
  (`:1837`). Reutiliza `macroFields()` (`:1242`) y `resolveItem()` (`:1213`).
  `src/style.css` (banda/etiqueta con forma, tokens, reduced-motion).
- **i18n:** `src/i18n/index.ts` (claves ES/EN, guarda de paridad).
- **Prototipos:** `prototypes/` (desechables; ver abajo).

### Detalle

- **F1a.** Indicador **Banda + etiqueta** ("Bajo/Medio/Alto") con **texto y
  forma** redundantes y `aria-label` que nombra la banda; `gi.estimateNote` visible
  en el bloque. Sin numero.
- **F1b.** Ubicacion: en el **desglose del borrador** y en las **detecciones**,
  junto a los macros; **nunca** en resultados de busqueda ni en el diario.
- **F1c.** **Oculto** si el alimento no aporta carbohidratos o no hay estimacion
  defendible (no se inventa).
- **F1d.** **Opcional y por defecto off**; se activa con el modo completo (D67) o
  con un ajuste propio en `Ajustes` (`localStorage`).
- **F1e.** **Explicacion colapsada** "¿que es el IG?" (patron `<details>`) y
  **enlace externo** (F3) cuando no hay valor propio.
- **F1f.** Datos: mapeo propio por categoria, marcado estimado; `own` de las 14
  recetas **se omite** (plato compuesto) o se estima conservador; test de
  cobertura y de "no inventa".
- **F1g.** Guardarrail (D72): test de frontera que comprueba que ningun modulo
  `core/insulin*` ni el camino del calculo referencia el IG.

### i18n

| Clave              | ES                                                                 | EN                                                             |
| ------------------ | ------------------------------------------------------------------ | -------------------------------------------------------------- |
| `gi.label`         | Indice glucemico (estimado)                                        | Glycemic index (estimated)                                     |
| `gi.low`           | Bajo                                                               | Low                                                            |
| `gi.medium`        | Medio                                                              | Medium                                                         |
| `gi.high`          | Alto                                                               | High                                                           |
| `gi.estimateNote`  | Composicion estimada. No es consejo dietetico ni guia de insulina. | Estimated composition. Not dietary advice or insulin guidance. |
| `gi.notApplicable` | Sin carbohidratos: no aplica                                       | No carbs: not applicable                                       |
| `gi.learn`         | ¿Que es el indice glucemico?                                       | What is the glycemic index?                                    |
| `gi.external`      | Ver IG en una fuente externa                                       | See GI in an external source                                   |
| `settings.giLabel` | Mostrar indice glucemico estimado                                  | Show estimated glycemic index                                  |

> **Nota i18n.** `gi.low/medium/high` y `gi.estimateNote` incluyen tildes en
> castellano (la guarda de `src/i18n/index.test.ts` las comprueba). Si alguna
> clave coincide ES/EN debera anadirse a `IGUALES_PERMITIDAS`.

## Criterios de aceptacion

Los criterios marcados _(m)_ se comprueban con una formula concreta (Tests).

1. Por defecto **no** se pinta ningun indicador de IG; la vista coincide con la de
   hoy (simplificado) y con la de completo sin IG. _(m)_
2. Al activarlo, el indicador aparece **solo** en el desglose del borrador y en
   las detecciones; **nunca** en resultados de busqueda ni en el diario. _(m)_
3. El indicador es una **banda cualitativa** con **texto y forma** redundantes
   (no solo color) y **sin ningun numero** de IG. _(m)_
4. Un alimento **sin carbohidratos** o sin estimacion defendible **no** muestra
   indicador (no se inventa). _(m)_
5. El **total de carbohidratos** y el objetivo **no cambian** se muestre o no el
   IG. _(m)_
6. La **nota** "estimado / no consejo" es visible junto al indicador. _(m)_
7. Existe una **explicacion colapsada** y, cuando no hay valor propio, un
   **enlace externo** en lugar de un numero. _(m)_
8. **Sin tablas propietarias:** ningun artefacto del repo contiene datos derivados
   de Atkinson/Sydney/FAO; el mapeo es propio y su metodologia esta documentada.
9. **Sin cruce regulatorio** (estructural): ningun modulo de `core/insulin*` ni el
   camino del calculo referencia el IG ni el concepto de banda. _(m)_
10. **i18n:** toda clave nueva existe en **es** y **en**; guarda de paridad intacta.
11. **Sin regresiones:** SPEC 22-26 siguen verdes.
12. `make check` (+ `make e2e` con los escenarios nuevos) en verde. _(m)_

## Tests

- **Unitarios** (vitest):
  - `src/catalog/`: clasificacion por categoria -> banda; "no aplica" en alimentos
    sin carbohidrato; cobertura del mapeo; paridad con el esquema zod.
  - `src/core/migrate.ts`: si se persiste el campo, version previa migra tolerante
    (patron SPEC 26).
  - **Frontera (D72):** test que comprueba que `src/core/totals.ts` y
    `src/insulin/*` no referencian el IG (analogo a los gates de frontera de
    `docs/specs/06-runtime.md`).
  - `src/i18n/index.test.ts`: guarda de paridad cubre las claves nuevas.
- **E2E** (Firefox, `make e2e`): por defecto no hay indicador; al activarlo aparece
  en el borrador con banda + texto (no solo color) y el total de carbos no cambia;
  no aparece en el diario.
- **Auditoria** (`make audit-uiux`): la banda y el control opt-in cumplen
  contraste y objetivo tactil (MIN_HIT=44) y no dependen del color.
- **Gate**: `make check`.

## Prototipos (UX)

Desechables, autocontenidos (CSS inline, datos ficticios, sin red) en
`prototypes/`, comparados en un `index.html` con badge, captura y "Abrir". Las
variantes a comparar:

- **H1 - Ficha con banda + etiqueta.** En el desglose: carbos (principal) + banda
  "IG estimado: Bajo/Medio/Alto" con forma y texto; midas si rompe la jerarquia.
- **H2 - Insignia en fila de resultado.** Chip por fila; contrasta el ruido
  (esperado: descartable).
- **H3 - Enlace externo.** "Ver IG (fuente externa)" + nota; valida F3 y el tono.
- **H4 - Educativo.** Bloque colapsado "¿que es el IG?" sin valor por alimento.

La comparacion fija la variante recomendada (previsiblemente **H1**), con la
variante **"nada" (C13)** como control honesto.

## Fuera de alcance

- **Carga glucemica (GL) cuantificada / FPU / eCarbs / carbos extendidos /
  dual-wave:** existe para calcular insulina; cruza D10.
- **Conversion IG -> insulina** y cualquier "output" usado para decidir dosis
  (FDA _General Wellness_ / MDR UE).
- **Numero de IG** y cualquier "impacto glucemico" cuantificado: la banda basta.
- **Ranking/orden por IG, objetivos de IG** y recomendaciones dieteticas.
- **IG en el diario** y en filas de resultado (ruido y moralizacion).
- **Embeber tablas propietarias** (Atkinson 2021, Sydney, FAO/WHO): bloqueo legal.
- **Cambios en la deteccion** (D12), en la aritmetica de insulina (D10) y en el
  export/import salvo la tolerancia a campos nuevos.
- **Backend, red en runtime, cuentas y analitica** (D11).

## Riesgos

- **Leido como recomendacion dietetica.** Mitigacion: banda sin numero, sin
  ranking ni colores de "mejor/peor"; nota "composicion, no consejo"; tono
  "permiso, no prohibicion" (R2).
- **Insinua bolo extendido (cruza D10).** Mitigacion: co-ubicar con los macros y
  lejos de la insulina; test de frontera IG->unidades (D72).
- **Reclasificacion como dispositivo.** Mitigacion: uso previsto "composicion
  informativa"; cero claims de manejo de DM1.
- **Precision falsa.** Mitigacion: nunca un numero; "estimado"; **ocultar** si no
  hay dato defendible (no derivar como fibra/azucares en SPEC 26).
- **Moralizacion / culpa.** Mitigacion: sin semaforo rojo-verde como unico canal,
  sin lenguaje "bueno/malo"; banda con texto descriptivo.
- **Datos/licencias.** Mitigacion: mapeo propio documentado o enlace externo;
  nunca embeber tablas de terceros; no contaminar el share-alike de OFF (ODbL).
- **Utilidad no demostrada.** Mitigacion: decision viva; si no aporta sin ser
  consejo, se aplaza (como FPU/eCarbs); la variante "nada" es valida.
- **Accesibilidad.** Mitigacion: canal redundante (texto/forma), `aria-label` con
  la banda, contraste >= 3:1, respetar reduced-motion.

## Referencias

- **Ciencia/DM1:** Annan et al., ISPAD 2022 (https://doi.org/10.1111/pedi.13429);
  ADA 2025 _Standards of Care_ (https://pmc.ncbi.nlm.nih.gov/articles/PMC11519289/);
  Thomas & Elliott, Cochrane 2009 (https://doi.org/10.1002/14651858.CD006296.pub2);
  Chiavaroli et al., BMJ 2021 (https://doi.org/10.1136/bmj.n1651); Zafar et al.,
  AJCN 2019 (https://doi.org/10.1093/ajcn/nqz149); Parillo et al. 2011
  (https://pubmed.ncbi.nlm.nih.gov/21219435); Bell et al. 2015
  (https://doi.org/10.2337/dc15-0100); Matthan et al. 2016
  (https://doi.org/10.3945/ajcn.116.137208); Vega-Lopez et al. 2007
  (https://doi.org/10.2337/dc06-1598); ISO 26642:2010
  (https://www.iso.org/standard/43633.html).
- **UX:** etiquetado traffic-light UK (https://www.gov.uk/government/publications/check-the-label/check-the-label);
  GI Symbol / Glycemic Index Foundation (https://www.gifoundation.com/gifsa-endorsement/gi-symbol/);
  Nutri-Score (https://www.santepubliquefrance.fr/en/nutri-score); WCAG 1.4.1
  (https://www.w3.org/WAI/WCAG22/Understanding/use-of-color); MDN _Use of color_
  (https://developer.mozilla.org/en-US/docs/Web/Accessibility/Guides/Understanding_WCAG/Perceivable/Use_of_color);
  O'Neill et al., CHI 2024 (https://doi.org/10.1145/3613904.3642600); Health
  Canada y el IG (https://ajcn.nutrition.org/article/S0002-9165(23)05172-9/fulltext).
- **Datos/licencias:** Atkinson et al. 2021 (https://doi.org/10.1093/ajcn/nqab233);
  Universidad de Sydney (https://glycemicindex.com/copyright-and-permission/);
  FAO/WHO 1998 (https://www.fao.org/4/w8079E/w8079e00.htm); CIQUAL
  (`tools/catalog/.cache/xml/const_2020_07_07.xml`); Open Food Facts, ODbL
  (https://world.openfoodfacts.org/terms-of-use).
- **Regulacion:** FDA _General Wellness: Policy for Low Risk Devices_ (2026);
  MDR UE 2017/745 y MDCG 2019-16.
- **Repo:** `src/main.ts` (`renderDraft` :879, `renderDetect` :1370,
  `renderResultList` :766, `mealEntry` :1837, `macroBreakdown` :1286,
  `macroFields` :1242, `resolveItem` :1213); `src/catalog/types.ts` (`Food`,
  `CATALOG_VERSION`); `src/core/types.ts` (`FoodItem`); `src/style.css`
  (`.chip` :297, `.macro-breakdown` :1222); `docs/specs/26-diario-modos-simplificado-completo.md`
  (D67-D69); `docs/decisiones.md` (D9, D10, D11, D12, D16, D19, D40, D67);
  `docs/receta-de-codigo.md`.
