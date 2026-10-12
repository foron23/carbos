# 13 - Atajos de correccion y lectura del dia

> [!abstract] TL;DR
> Cuatro cambios de interaccion, decididos en `docs/decisiones.md` (D33-D37): **atajos por item** en el borrador (mitad, doble, cambiar por alternativa del top-k, quitar), **porciones tipicas** como botones derivadas de la porcion del catalogo, **la comida gana hora y pierde la franja** (el dia pasa a leerse como una linea temporal que mezcla comidas e insulina) y **la semana como barras de siete dias**.

## Contexto

El detector devuelve clase y probabilidad, y la interfaz ya guarda el top-k, pero el usuario solo puede abrir un desplegable de alternativas desde el panel de la foto y teclear gramos a mano. Toda la correccion de una estimacion difusa recae en el teclado, que es justo lo que se quiere evitar en un movil y a una mano (D16).

En el otro extremo, la **franja** (desayuno, comida, cena, snack) obliga a una decision que no aporta nada cuando el reloj ya la sabe, y parte el dia en dos listas separadas: el registro de comidas y el de insulina. Para quien se pone insulina, el dia se lee de una vez, no en dos columnas.

## Cambios

### A. Atajos por item del borrador (D34)

- Cada fila del borrador gana **mitad**, **doble**, **cambiar** (solo si el detector ofrece mas de una alternativa) y **quitar**.
- **Cambiar** elige entre las alternativas del top-k con su probabilidad; al elegir, se sustituyen nombre y carbohidratos por 100 g y **se conserva la cantidad**.
- Los multiplicadores actuan sobre la **cantidad actual**, redondeada, con suelo de 1 g: ninguna combinacion deja la cantidad en cero.
- Los items anadidos a mano desde el buscador no tienen top-k: ahi solo mitad, doble y quitar.
- El campo de gramos **no desaparece**: los atajos son un atajo, no un candado.

### B. Porciones tipicas (D35)

- Tres botones por item: **pequeno, mediano y grande**, con gramos = `round(porcion del catalogo x 0,7 / 1 / 1,4)`, minimo 1 g.
- **Mediano coincide con la porcion por defecto actual**, asi que ningun valor de partida cambia.
- Solo aparecen si el item viene del catalogo (`classId`). Sin tabla de datos nueva: los factores son una aproximacion declarada.

### C. Hora de la comida y fuera la franja (D36)

- `Meal` pierde `slot` y gana `time` (`HH:MM`, obligatorio). Al registrar, la hora por defecto es la actual.
- **Migracion**: los registros sin hora se rellenan desde la franja antigua (desayuno 08:00, comida 14:00, cena 21:00, snack 17:00), que es la informacion que desaparece; sube la version del esquema.
- El **import** sigue aceptando ficheros con `slot` (se mapea a la hora) pero el export deja de escribirlo.
- La **hora es editable** despues de registrar, igual que la fecha.
- El diario pasa a ser una **linea temporal del dia**: comidas e insulina ordenadas por hora. En empate, la comida antes que la insulina.
- Desaparecen el selector de franja, las claves `slot.*` y `field.slot`, y los totales por franja.

### D. Barras de la semana (D37)

- Siete barras, la semana del dia que se esta viendo, con el **dia activo marcado** y el total de la semana como numero.
- La escala es relativa al maximo de la semana; un dia sin registros se ve como barra vacia.
- Sin scroll horizontal en pantalla estrecha.

## Criterios de aceptacion

1. Un item detectado se corrige sin abrir el teclado: con mitad, doble, cambiar y quitar basta para pasar de una estimacion a un registro razonable.
2. Mitad y doble actuan sobre la cantidad actual y nunca la dejan en cero.
3. "Cambiar" solo aparece con mas de una alternativa; al elegir, los carbohidratos se recalculan y la cantidad se conserva.
4. Los botones de porcion dan 0,7 / 1 / 1,4 veces la porcion del catalogo, redondeado, y "mediano" coincide con el valor por defecto actual.
5. No queda ninguna clave de franja en el i18n y el borrador no pide franja.
6. Al registrar, la comida guarda la hora actual, y esa hora se puede corregir despues.
7. La migracion rellena la hora de los registros viejos desde su franja y no pierde ninguno.
8. El import acepta un fichero con `slot` y lo convierte; el export ya no escribe `slot`.
9. El diario muestra una sola linea temporal del dia con comidas e insulina ordenadas por hora.
10. La semana se ve como siete barras con el dia activo marcado y el total como numero.
11. Todo el texto nuevo existe en `es` y en `en`, con las guardas de tildes y traduccion ya existentes.
12. `make audit-uiux` sigue en verde (sin desborde y con todos los controles con nombre) a 390 y 320 px.

## Tests

- **Unitarios**: multiplicadores y factores de porcion (suelo de 1 g y redondeo), orden de la linea temporal, migracion con un volcado antiguo que trae `slot`, y tolerancia del import.
- **E2E** (Firefox, `make e2e`): corregir una deteccion con los atajos y registrarla; cambiar la hora de una comida; leer la linea temporal con una comida y un registro de insulina; barras de la semana; y el escenario de idioma, que sigue exigiendo cero cadenas sin cubrir.
- **Auditoria**: `make audit-uiux`.
- **Gate**: `make check`.

## Orden de implementacion

1. **Atajos por item y porciones** (UI y una regla de calculo; no toca el dominio).
2. **Hora de la comida, fuera la franja y linea temporal** (toca el dominio: tipo, validador, migracion, borrador, diario y los escenarios E2E que hoy eligen franja).
3. **Barras de la semana** (presentacion sobre el agregado que ya existe).

## Fuera de alcance

- **Chat conversacional**: reafirma D8, queda como capa de v1.1.
- **Aprender de las correcciones** (guardarlas en el dispositivo): aparcado; arrastra a su vez la porcion habitual por alimento.
- **Porciones por grupo de alimento**: los factores actuales son una aproximacion, no precision real.

## Riesgos

- El cambio de dominio es el punto delicado de este ciclo: sin test de migracion con datos viejos no se toca.
- "Cambiar" depende de que el detector devuelva mas de una alternativa; sin modelo, el boton no aparece y no estorba.
- Quitar la franja elimina un dato que podria querer un resumen por comidas del dia; se asume que la hora lo cubre.
