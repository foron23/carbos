# SPEC 21 - Expansion del catalogo: platos cocinados y guisos

> [!abstract] TL;DR
> El catalogo (154 clases) tiene buen soporte de **ingredientes sueltos** y flojo de **platos
> cocinados/guisos** ([`../catalogo.md`](../catalogo.md)). Esta spec define **como ampliarlo** de forma
> reproducible: filas nuevas en `tools/catalog/selection.csv` -> `make catalog`. Mapeo a **Ciqual 2020
> donde existe** (subgrupo 0103 tiene decenas de guisos con `alim_code` real) y a **USDA FDC (CC0) o
> composicion propia** donde no (muchos guisos espanoles no estan en Ciqual). Fases: (F1) platos con
> codigo Ciqual directo; (F2) guisos espanoles por USDA/composicion; (F3) imagenes + re-destilado.
> Arregla de paso **2 bugs** del catalogo. Medir con `make eval`/`make identify` + recall por clase
> (con el **limite**: Nutrition5k no son guisos espanoles).

Investigacion y opciones en [`20-platos-cocinados.md`](20-platos-cocinados.md). Mecanica del catalogo en
`tools/catalog/build_catalog.py`.

## Objetivo y criterio de exito

- Anadir **platos cocinados/combinados** al catalogo, con **carbohidratos trazables** (fuente citada) y
  **sinonimos** en espanol.
- Criterio: `make catalog` sigue verde; ids unicos; cada clase nueva con **fuente** y **plan de datos**;
  el clasificador re-destilado **no empeora** el top-1 global ni el MAE (`make eval` / `make identify`).

## Mecanica actual (y limites)

`tools/catalog/build_catalog.py` lee `selection.csv` (cabecera `id,es,en,synonyms,portion,code`),
exige que `code` exista en Ciqual con carbohidratos (`const_code 31000`) y **falla** si no. `synonyms`
se separan por `|`. **Restricciones del script**: ids unicos (aborta) y `>=150` alimentos (aviso).

**Bugs a corregir en esta expansion** (verificados en `selection.csv` y Ciqual):

- `lasana` y `canelones` comparten `25081` ("Lasagnes ou cannelloni a la viande") — dos ids, un dato.
- `fabada` usa `25098` ("Cassoulet au porc") — es un cassoulet frances; revisar si se prefiere una
  entrada propia o el equivalente Ciqual.

### Cambio de mecanica propuesto (F2)

Para guisos sin Ciqual, extender `selection.csv` con una columna `source`:
`ciqual` (por defecto, `code`=alim_code), `usda` (`code`=fdcId, USDA FDC CC0) o `own`
(`code`=id de receta en un `tools/catalog/recipes.json` con composicion -> carbohidratos derivados de
ingredientes ya presentes). `build_catalog.py` gana la rama `usda`/`own`; sigue exigiendo
`source`+`code` trazables. Los platos `own` publican la cifra como **rango** (regla de incertidumbre).

## Fase 1 - Platos con codigo Ciqual directo (bajo esfuerzo)

Todos verificados en Ciqual 2020 (subgrupos 0102/0103/0104):

| Plato (ES)                   | id propuesto          | Ciqual | carbs g/100g | porcion g | sinonimos                                 |
| ---------------------------- | --------------------- | ------ | ------------ | --------- | ----------------------------------------- |
| Albondigas en salsa          | `albondigas`          | 25211  | 5.5          | 200       | albondigas, albondiguillas                |
| Cocido / pote                | `cocido`              | 25013  | 3.2          | 350       | cocido madrileno, pote gallego, escudella |
| Cuscus                       | `cuscus`              | 25152  | 12.5         | 300       | cuscus, couscous                          |
| Arroz tres delicias          | `arroz_tres_delicias` | 25088  | 23.6         | 250       | arroz cantonés, arroz frito               |
| Arroz con pollo              | `arroz_con_pollo`     | 25184  | 31.5         | 300       | arroz con pollo                           |
| Estofado de ternera          | `estofado_ternera`    | 25065  | 3.3          | 250       | ternera con zanahorias, estofado          |
| Ternera a la borgoñona       | `ternera_borgonona`   | 25033  | 4.2          | 250       | boeuf bourguignon                         |
| Pollo a la vasca             | `pollo_vasca`         | 25190  | 2.5          | 250       | pollo basquaise, pollo con pimientos      |
| Guiso de cordero             | `guiso_cordero`       | 25124  | 5.0          | 250       | cordero guisado, navarin                  |
| Tajin                        | `tajin`               | 25204  | 14.4         | 300       | tajin, tagine                             |
| Musaka                       | `musaka`              | 25123  | 5.2          | 250       | musaka, moussaka                          |
| Pastel de carne (parmentier) | `pastel_carne`        | 25009  | 9.4          | 250       | pastel de carne, hachis parmentier        |
| Pasta al horno               | `pasta_horno`         | 25122  | 16.4         | 300       | pasta gratinada, gratin de pasta          |
| Patatas panadera/gratén      | `patatas_graten`      | 25056  | 14.5         | 200       | patatas a la crema, gratin dauphinois     |
| Raviolis                     | `raviolis`            | 25019  | 12.5         | 250       | raviolis, ravioles                        |
| Sushi / maki                 | `sushi`               | 25456  | 26.9         | 180       | sushi, maki                               |
| Chili con carne              | `chili`               | 25111  | 13.0         | 250       | chili con carne                           |
| Pollo al vino                | `pollo_al_vino`       | 25121  | 4.0          | 250       | coq au vin                                |
| Callos                       | `callos`              | 8612   | 0.6          | 200       | callos a la madrilena, tripas             |
| Verdura gratinada            | `verdura_gratinada`   | 25162  | 6.9          | 200       | gratin de verduras                        |

## Fase 2 - Guisos espanoles sin Ciqual (USDA o composicion propia)

`source=usda` (FDC CC0) o `source=own` (receta en `recipes.json`, carbs derivados; cifra como rango):

| Plato (ES)                      | id propuesto       | via                                       | sinonimos                        |
| ------------------------------- | ------------------ | ----------------------------------------- | -------------------------------- |
| Salmorejo                       | `salmorejo`        | own (tomate, pan, aceite, ajo)            | salmorejo cordobes               |
| Ajoblanco                       | `ajoblanco`        | own (almendra, pan, ajo, aceite)          | ajo blanco                       |
| Marmitako                       | `marmitako`        | usda/own (atun, patata, pimiento)         | marmitako, atun con patatas      |
| Zarzuela                        | `zarzuela`         | usda/own (pescado, marisco, tomate)       | zarzuela de mariscos             |
| Rabo de toro                    | `rabo_toro`        | usda/own (rabo, vino, cebolla, zanahoria) | rabo de toro estofado            |
| Migas                           | `migas`            | own (pan, chorizo, pimenton)              | migas, migas de pan              |
| Huevos rotos                    | `huevos_rotos`     | own (patata, huevo, aceite)               | huevos rotos, huevos estrellados |
| Patatas bravas                  | `patatas_bravas`   | own (patata, salsa brava)                 | bravas, patatas bravas           |
| Arroz a la cubana               | `arroz_cubana`     | own (arroz, huevo, tomate frito, platano) | arroz a la cubana                |
| Pote gallego / lacon con grelos | `lacon_grelos`     | usda/own                                  | lacon con grelos, pote gallego   |
| Empanada gallega                | `empanada_gallega` | own (masa, atun, cebolla, tomate)         | empanada gallega                 |
| Sopa castellana                 | `sopa_castellana`  | own (pan, ajo, huevo, pimenton)           | sopa de ajo, sopa castellana     |
| Fabada (revisar fuente)         | `fabada`           | revisar                                   | fabada asturiana, potaje         |

> Nota: evitar duplicar lo ya cubierto (`pisto`, `tortilla_patatas`, `paella`, `gazpacho`, `sandwich_mixto`).

## Fase 3 - Datos e integracion con el modelo

1. **Imagenes**: `python3 tools/data/fetch_images.py --classes <ids> --per-class 20` -> `make
data-review` -> `make data-confirm`. Prioridad a las clases con menos fotos; las guisos de Commons
   suelen ser escasos y ruidosos -> revision obligatoria. Alternativa: **contribuciones** (D38/D39)
   priorizando clases nuevas.
2. **Re-destilado**: +N clases cambian la salida del clasificador (hoy 155 = 154 + `__unknown__`).
   Re-ejecutar `make distill-clip` (D32) con prompts de plato/sinonimos (SPEC 20, C1) y **benchmarkear**.
3. **Pesos**: nueva version `weights-0.3.0` con `make weights-manifest` (D24/D18) + actualizar
   `public/model-manifest.json`. El **mapa identidad** ya resuelve ids de catalogo (SPEC 18); el
   `classmap.ts` no necesita cambios (solo afecta a modelos publicos).
4. **Sinonimos en el buscador**: `src/catalog/search.ts` los puntua; los guisos entran gratis aqui
   **aunque no haya imagenes** (F1/D1 de SPEC 20).

## Medicion

- `make eval` (MAE/cobertura) y `make identify --oracle detector` (identificacion + `by_ingredients`).
- **Recall por clase nueva** (top-3) para saber si la foto los reconoce (no solo el buscador).
- **LIMITE**: Nutrition5k (cafeteria de Google) **no** tiene guisos espanoles; sirve para no regresar,
  no para demostrar mejora en guisos. La prueba representativa requiere el **set propio pesado (D25)**.

## Riesgos

- **Clases sin imagenes diluyen el top-1** (el student ya tiene top-1 flojo, ~7 % sin fuga). Mitigar:
  no anadir una clase hasta tener un minimo de imagenes revisadas; medir el top-1 antes/despues.
- **Carbohidratos no trazables**: obligar `source`; `own` publica rango, no valor puntual.
- **Licencias**: Ciqual (Licence Ouverte) y USDA (CC0) compatibles AGPL; evitar fuentes no comerciales.
- **Sobre-expansion** vs D2 (~150-300): el catalogo debe seguir siendo curado y de uso diario.

## Decisiones abiertas

- Cuantas clases anadir por fase (propuesta: ~20 en F1, ~13 en F2).
- `own` (composicion) vs `usda` para cada guiso espanol sin Ciqual.
- Si `fabada`/`lasana`/`canelones` se reasignan de codigo Ciqual.
- Si el re-destilado de F3 se hace con datos de Commons o se espera a contribuciones.

## Reproducibilidad

```bash
# 1) editar tools/catalog/selection.csv (+ recipes.json en F2) y, si aplica, la rama usda/own
make catalog                # regenera src/catalog/catalog.ts
npx vitest run src/catalog  # schema/clase
# 2) datos por clase nueva
python3 tools/data/fetch_images.py --classes albondigas,cocido,cuscus --per-class 20
make data-review && make data-confirm
# 3) re-destilado + bench
make distill-clip && make candidate-manifest CAND_CLASSIFIER=... && make eval && make identify
```

## Estado (2026-10-15): frutos secos ampliados

Hueco estructural de la seccion J cerrado con 4 alimentos de **Ciqual directo** (sin `usda`/`own`):
`anacardos` (15054), `pistachos` (15044), `pipas` (15011) y `castanas` (15024). El catalogo pasa de
**186 a 190** alimentos; `CATALOG_VERSION` **no** cambia (2), porque no se anade ningun campo al
esquema (solo contenido). Se anaden alias en `src/catalog/classmap.ts` (`cashew`, `pistachio`,
`sunflower_seed`, `chestnut`) para modelos publicos.

**El modelo NO reconoce todavia estas clases por foto.** La lista de clases del clasificador se deriva
del catalogo (`training/distill_clip.py`, `class_order = ids + __unknown__`), pero el clasificador
publicado es anterior (155 clases). Se verifico el pipeline con `--smoke` sobre el catalogo ampliado:
emite **191 clases** (190 + `__unknown__`), incluida `anacardos`. **Nada se ha publicado**: para que la
foto las reconozca hace falta (a) imagenes revisadas por clase nueva, (b) `make distill-clip`,
(c) `make weights-manifest` y **publicar los pesos** (viven fuera del repo, D18/D24), (d) apuntar
`public/model-manifest.json` a la version nueva. Hasta entonces, los 4 frutos secos se encuentran por
**busqueda, manual y codigo de barras**, no por foto. Obs.: 21 imagenes por clase ya descargadas en
`data/images/` (Wikimedia; gitignored), pendientes de revision/confirmacion.
