# Catalogo de alimentos (190 clases)

> [!abstract] TL;DR
> Catalogo curado (**190 clases**) generado con `make catalog`
> (`tools/catalog/build_catalog.py`) desde **Ciqual 2020** y, para las ampliaciones, desde **USDA
> FoodData Central (CC0)** y **recetas propias**. Esta es la **tabla por grupos** con las imagenes de
> entrenamiento disponibles (`data/images`) por clase. **negrita = hueco de datos** (<8 imagenes).
> Los huecos estructurales estan al final. Diagnostico de modelo y detector en
> [`specs/18-modelo-deteccion.md`](specs/18-modelo-deteccion.md).

El catalogo vive en `src/catalog/catalog.ts` (id, nombre ES/EN, sinonimos, `carbsPer100g`,
`defaultPortionGrams`, `source`). El modelo publico se mapea al catalogo por `classmap.ts` (D31); el
clasificador propio emite directamente estos ids (mapa identidad, SPEC 18). Fuentes de datos: Ciqual
2020 (Licence Ouverte) para la base, USDA FoodData Central (CC0) y recetas propias (composicion de
ingredientes, cifra publicada como **rango**) para las ampliaciones de platos cocinados.

## A. Cereales, tuberculos y feculas (15)

| Clase                   | id               | imgs  |
| ----------------------- | ---------------- | ----- |
| Pan blanco              | `pan_blanco`     | 22    |
| Pan integral            | `pan_integral`   | 21    |
| Arroz blanco cocido     | `arroz_blanco`   | 21    |
| Arroz integral cocido   | `arroz_integral` | **6** |
| Arroz basmati cocido    | `arroz_basmati`  | **4** |
| Pasta cocida            | `pasta_cocida`   | 21    |
| Pasta integral cocida   | `pasta_integral` | **2** |
| Quinoa cocida           | `quinoa`         | 9     |
| Copos de avena          | `avena`          | 21    |
| Copos de maiz           | `copos_maiz`     | 21    |
| Muesli                  | `muesli`         | 13    |
| Patata cocida           | `patata_cocida`  | 21    |
| Patatas fritas de bolsa | `patata_frita`   | 21    |
| Pure de patata          | `pure_patata`    | 21    |
| Boniato                 | `boniato`        | 21    |

## B. Legumbres (8)

| Clase                  | id               | imgs  |
| ---------------------- | ---------------- | ----- |
| Lentejas cocidas       | `lentejas`       | 9     |
| Garbanzos cocidos      | `garbanzos`      | 19    |
| Judias blancas cocidas | `judias_blancas` | **5** |
| Judias pintas cocidas  | `judias_pintas`  | 12    |
| Guisantes cocidos      | `guisantes`      | 13    |
| Habas cocidas          | `habas`          | 10    |
| Soja                   | `soja`           | 21    |
| Hummus                 | `hummus`         | 11    |

## C. Verduras y hortalizas (28)

| Clase          | id               | imgs  |     | Clase        | id             | imgs  |
| -------------- | ---------------- | ----- | --- | ------------ | -------------- | ----- |
| Tomate         | `tomate`         | 12    |     | Espinacas    | `espinacas`    | **4** |
| Tomate cherry  | `tomate_cherry`  | **4** |     | Champinon    | `champinon`    | 19    |
| Lechuga        | `lechuga`        | 8     |     | Maiz dulce   | `maiz_dulce`   | 12    |
| Cebolla        | `cebolla`        | 21    |     | Calabaza     | `calabaza`     | 16    |
| Ajo            | `ajo`            | 14    |     | Puerro       | `puerro`       | **5** |
| Zanahoria      | `zanahoria`      | 12    |     | Alcachofa    | `alcachofa`    | 9     |
| Pimiento rojo  | `pimiento_rojo`  | 17    |     | Esparragos   | `esparragos`   | 18    |
| Pimiento verde | `pimiento_verde` | 15    |     | Aguacate     | `aguacate`     | 21    |
| Calabacin      | `calabacin`      | 21    |     | Remolacha    | `remolacha`    | 15    |
| Berenjena      | `berenjena`      | 12    |     | Apio         | `apio`         | 21    |
| Pepino         | `pepino`         | 13    |     | Repollo      | `repollo`      | **7** |
| Brocoli        | `brocoli`        | 20    |     | Col lombarda | `col_lombarda` | **5** |
| Coliflor       | `coliflor`       | **4** |     | Acelgas      | `acelgas`      | 19    |
|                |                  |       |     | Nabos        | `nabos`        | 15    |
|                |                  |       |     | Judia verde  | `judia_verde`  | 21    |

## D. Frutas (26)

| Clase       | id            | imgs  |     | Clase     | id          | imgs  |
| ----------- | ------------- | ----- | --- | --------- | ----------- | ----- |
| Manzana     | `manzana`     | 21    |     | Higo      | `higo`      | 16    |
| Platano     | `platano`     | 17    |     | Granada   | `granada`   | 20    |
| Naranja     | `naranja`     | 19    |     | Limon     | `limon`     | 10    |
| Mandarina   | `mandarina`   | 21    |     | Datil     | `datil`     | 21    |
| Pera        | `pera`        | 21    |     | Pasas     | `pasas`     | 21    |
| Uva         | `uva`         | 15    |     | Frambuesa | `frambuesa` | **6** |
| Fresa       | `fresa`       | 21    |     | Arandano  | `arandano`  | 19    |
| Sandia      | `sandia`      | 21    |     | Pomelo    | `pomelo`    | **7** |
| Melon       | `melon`       | **7** |     | Nectarina | `nectarina` | 16    |
| Kiwi        | `kiwi`        | 12    |     | Papaya    | `papaya`    | 8     |
| Pina        | `pina`        | 21    |     | Melocoton | `melocoton` | 18    |
| Albaricoque | `albaricoque` | 20    |     | Ciruela   | `ciruela`   | 18    |
| Cereza      | `cereza`      | 14    |     | Mango     | `mango`     | **3** |

## E. Lacteos y huevos (13)

| Clase               | id                    | imgs  |     | Clase        | id             | imgs |
| ------------------- | --------------------- | ----- | --- | ------------ | -------------- | ---- |
| Leche entera        | `leche_entera`        | 20    |     | Queso fresco | `queso_fresco` | 19   |
| Leche semidesnatada | `leche_semidesnatada` | **7** |     | Queso curado | `queso_curado` | 12   |
| Leche desnatada     | `leche_desnatada`     | 16    |     | Mozzarella   | `mozzarella`   | 9    |
| Yogur natural       | `yogur_natural`       | **6** |     | Petit suisse | `petit_suisse` | 21   |
| Yogur griego        | `yogur_griego`        | 16    |     | Nata         | `nata`         | 21   |
| Yogur de frutas     | `yogur_frutas`        | 14    |     | Mantequilla  | `mantequilla`  | 15   |
| Huevo               | `huevo`               | 9     |     |              |                |      |

## F. Carnes y embutidos (8)

| Clase            | id              | imgs  |
| ---------------- | --------------- | ----- |
| Pechuga de pollo | `pollo_pechuga` | 21    |
| Muslo de pollo   | `pollo_muslo`   | 14    |
| Ternera          | `ternera`       | 17    |
| Cerdo            | `cerdo`         | 10    |
| Pavo             | `pavo`          | 14    |
| Jamon serrano    | `jamon_serrano` | **4** |
| Jamon cocido     | `jamon_cocido`  | 21    |
| Chorizo          | `chorizo`       | **4** |

## G. Pescados y mariscos (4) — hueco estructural

| Clase               | id        | imgs |
| ------------------- | --------- | ---- |
| Atun en conserva    | `atun`    | 21   |
| Salmon              | `salmon`  | 20   |
| Sardina en conserva | `sardina` | 21   |
| Gambas              | `gambas`  | 21   |

## H. Platos preparados (48)

| Clase               | id                  | imgs  |     | Clase               | id                    | imgs  |
| ------------------- | ------------------- | ----- | --- | ------------------- | --------------------- | ----- |
| Tortilla de patatas | `tortilla_patatas`  | 19    |     | Sopa de fideos      | `sopa_fideos`         | 21    |
| Tortilla francesa   | `tortilla_francesa` | 13    |     | Crema de verduras   | `crema_verduras`      | **3** |
| Paella              | `paella`            | **5** |     | Fabada              | `fabada`              | **2** |
| Gazpacho            | `gazpacho`          | 16    |     | Pisto               | `pisto`               | 13    |
| Croquetas           | `croquetas`         | 20    |     | Empanadilla         | `empanadilla`         | 21    |
| Pizza               | `pizza`             | 21    |     | Sandwich mixto      | `sandwich_mixto`      | 15    |
| Lasana              | `lasana`            | 21    |     | Hamburguesa         | `hamburguesa`         | 16    |
| Canelones           | `canelones`         | 8     |     | Espaguetis bolonesa | `espaguetis_bolonesa` | **6** |
| Albondigas en salsa | `albondigas`        | **0** |     | Cocido              | `cocido`              | **0** |
| Cuscus              | `cuscus`            | **0** |     | Arroz tres delicias | `arroz_tres_delicias` | **0** |
| Arroz con pollo     | `arroz_con_pollo`   | **0** |     | Estofado de ternera | `estofado_ternera`    | **0** |
| Ternera borgonona   | `ternera_borgonona` | **0** |     | Pollo a la vasca    | `pollo_vasca`         | **0** |
| Guiso de cordero    | `guiso_cordero`     | **0** |     | Tajin               | `tajin`               | **0** |
| Musaka              | `musaka`            | **0** |     | Pastel de carne     | `pastel_carne`        | **0** |
| Pasta al horno      | `pasta_horno`       | **0** |     | Patatas panadera    | `patatas_graten`      | **0** |
| Raviolis            | `raviolis`          | **0** |     | Sushi               | `sushi`               | **0** |
| Chili con carne     | `chili`             | **0** |     | Pollo al vino       | `pollo_al_vino`       | **0** |
| Callos              | `callos`            | **0** |     | Verdura gratinada   | `verdura_gratinada`   | **0** |
| Salmorejo           | `salmorejo`         | **0** |     | Ajoblanco           | `ajoblanco`           | **0** |
| Marmitako           | `marmitako`         | **0** |     | Zarzuela            | `zarzuela`            | **0** |
| Rabo de toro        | `rabo_toro`         | **0** |     | Migas               | `migas`               | **0** |
| Huevos rotos        | `huevos_rotos`      | **0** |     | Patatas bravas      | `patatas_bravas`      | **0** |
| Arroz a la cubana   | `arroz_cubana`      | **0** |     | Lacon con grelos    | `lacon_grelos`        | **0** |
| Empanada gallega    | `empanada_gallega`  | **0** |     | Sopa castellana     | `sopa_castellana`     | **0** |

## I. Dulces, reposteria y postres (20)

| Clase                | id                  | imgs |     | Clase          | id            | imgs |
| -------------------- | ------------------- | ---- | --- | -------------- | ------------- | ---- |
| Flan                 | `flan`              | 11   |     | Croissant      | `croissant`   | 13   |
| Natillas             | `natillas`          | 20   |     | Magdalena      | `magdalena`   | 21   |
| Arroz con leche      | `arroz_leche`       | 10   |     | Bizcocho       | `bizcocho`    | 14   |
| Chocolate negro      | `chocolate_negro`   | 16   |     | Brioche        | `brioche`     | 21   |
| Chocolate con leche  | `chocolate_leche`   | 18   |     | Donut          | `donut`       | 21   |
| Chocolate blanco     | `chocolate_blanco`  | 11   |     | Tarta de queso | `tarta_queso` | 21   |
| Crema de cacao       | `crema_cacao`       | 21   |     | Helado         | `helado`      | 18   |
| Galletas             | `galletas`          | 20   |     | Turron         | `turron`      | 16   |
| Galleta de chocolate | `galleta_chocolate` | 21   |     | Azucar         | `azucar`      | 8    |
| Miel                 | `miel`              | 21   |     | Mermelada      | `mermelada`   | 21   |

## J. Frutos secos (8)

| Clase      | id           | imgs  |
| ---------- | ------------ | ----- |
| Nueces     | `nueces`     | 19    |
| Almendras  | `almendras`  | 20    |
| Avellanas  | `avellanas`  | **4** |
| Cacahuetes | `cacahuetes` | 21    |
| Anacardos  | `anacardos`  | 0     |
| Pistachos  | `pistachos`  | 0     |
| Pipas      | `pipas`      | 0     |
| Castanas   | `castanas`   | 0     |

## K. Aceites, salsas y condimentos (6)

| Clase             | id               | imgs  |
| ----------------- | ---------------- | ----- |
| Aceite de oliva   | `aceite_oliva`   | **7** |
| Aceite de girasol | `aceite_girasol` | 12    |
| Tomate frito      | `tomate_frito`   | 13    |
| Mayonesa          | `mayonesa`       | 12    |
| Ketchup           | `ketchup`        | 12    |
| Aceitunas         | `aceitunas`      | **6** |

## L. Bebidas (6)

| Clase            | id              | imgs  |
| ---------------- | --------------- | ----- |
| Zumo de naranja  | `zumo_naranja`  | 21    |
| Zumo de manzana  | `zumo_manzana`  | **7** |
| Zumo de pina     | `zumo_pina`     | 10    |
| Limonada         | `limonada`      | 14    |
| Refresco de cola | `refresco_cola` | 21    |
| Cerveza          | `cerveza`       | 21    |

## Huecos

### 1. Huecos del catalogo (alimentos ausentes)

| Grupo                            | Falta                                                                                                    |
| -------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **Pescados y mariscos** (solo 4) | merluza, bacalao, lubina, dorada, trucha, calamares, pulpo, mejillones, boquerones, anchoas, atun fresco |
| **Bebidas** (solo 6)             | vino, cafe / cafe con leche, batidos, refrescos no-cola, bebidas vegetales                               |
| **Frutos secos** (8)             | faltan imagenes de anacardos, pistachos, pipas y castanas (ya en el catalogo, sin dataset)               |
| **Cereales**                     | cuscus, palomitas, tortitas de arroz/maiz, cebada, bulgur                                                |
| **Carnes**                       | cordero, conejo, morcilla, salchichas/fuet, costillas                                                    |
| **Platos cocinados**             | kebab, gyozas, burrito, tacos, ramen                                                                     |
| **Dulces**                       | churros, crepes, caramelos/gominolas, membrillo                                                          |
| **Lacteos**                      | bebidas vegetales (avena, soja, almendra), kefir, cuajada, queso azul                                    |
| **Verduras**                     | rucula, rabano, endivia/escarola, canonigos, berza/grelos                                                |

### 2. Huecos de datos (<8 imagenes, 58 de 190 clases)

Criticos: `pasta_integral` (2), `fabada` (2), `mango` (3), `crema_verduras` (3),
`arroz_basmati` / `coliflor` / `espinacas` / `tomate_cherry` / `jamon_serrano` / `chorizo` /
`avellanas` (4), `judias_blancas` / `col_lombarda` / `puerro` / `paella` (5). Ademas
`review_labels` marco ~72 % para revision: son **pocas y ruidosas**. Las **32 clases nuevas** de la
expansion (grupo H, SPEC 21) todavia no tienen imagenes.

### 3. Huecos de equilibrio

Pescado y frutos secos (4 clases cada uno) son marginales frente a dulces (20) o verduras (28): el
modelo aprende mucho de postres y poco de pescado/marisco. Los **platos cocinados/guisos** (grupo H,
48 clases tras la expansion SPEC 21, pero 32 de ellas sin imagenes) siguen siendo el hueco
cualitativo: hay buen soporte de **ingredientes sueltos** pero menor de **combinados**. Ver
investigacion en [`specs/20-platos-cocinados.md`](specs/20-platos-cocinados.md) y el plan de expansion
en [`specs/21-expansion-catalogo.md`](specs/21-expansion-catalogo.md).

> [!note] Expansion en curso (SPEC 21)
> El grupo H suma **32 clases nuevas** (F1 con codigo Ciqual directo + F2 por USDA/composicion
> propia; ver [`specs/21-expansion-catalogo.md`](specs/21-expansion-catalogo.md)). **F3 (imagenes +
> re-destilado del clasificador) queda pendiente**: estas clases ya entran en el buscador por
> sinonimos, pero todavia no tienen fotos ni recall medido.
