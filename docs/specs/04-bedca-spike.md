# SPEC 04 - Spike: condiciones de uso de BEDCA (D19/D30)

> [!abstract] TL;DR
> Hallazgo: las condiciones de BEDCA (`UsoBD.pdf`) **no permiten** redistribuir sus valores en
> formato electronico sin **autorizacion expresa** de AESAN, y limitan el uso a
> personal/educativo/**no comercial**, prohibiendo modificar los datos. Eso **choca** con una app
> **AGPL-3.0** publica, cuya licencia permite a terceros uso comercial. **Decision (2026-10-12):
> plan B abierto** - no se usan valores de BEDCA; catalogo con **USDA FDC (CC0)** +
> **CIQUAL (Licence Ouverte)** + curacion propia, citando BEDCA solo como referencia.

## Decision (2026-10-12)

**Rama B: plan B abierto.** Por incompatibilidad entre las condiciones de BEDCA y la licencia
AGPL-3.0 de Carbos, se descarta incluir valores BEDCA. El catalogo (E1) se cura con fuentes
reutilizables y se cita BEDCA solo como referencia bibliografica, sin copiar sus valores.

- **Fuentes**: USDA FoodData Central (dominio publico, CC0) y CIQUAL/ANSES (Licence Ouverte);
  valores de platos espanoles curados y contrastados.
- **Atribucion**: la del `source` de cada alimento apunta a su fuente real (USDA/CIQUAL/propia).
- **Apendice**: la solicitud a AESAN se mantiene abajo por si en el futuro se quisiera BEDCA,
  pero **no se envia** ni bloquea nada.

> [!warning] Nota de honestidad
> El plan B renuncia a la tabla oficial espanola. La curacion propia debe ser **trazable** y
> contrastada; no se afirma precision que no se pueda medir (regla transversal).

## Hallazgos (2026-10-12)

### BEDCA - condiciones oficiales

Fuente: `https://www.bedca.net/bdpub/UsoBD.pdf` (condiciones de uso de AESAN/BEDCA v1.0) y
`datos.gob.es/es/solicitud-de-datos/base-de-datos-bedca`. Resumen literal de las condiciones:

- Los datos **no pueden reproducirse sin indicar la fuente**:
  "AESAN/BEDCA Base de Datos Espanola de Composicion de Alimentos v1.0 (2010)".
- **No pueden modificarse ni alterar su significado original.**
- Uso limitado a fines **personales, educativos o no comerciales**.
- "La reproduccion, traduccion o **cualquier uso que no sea personal, educacional o no
  comercial, de los datos en formato electronico, estara sujeto a la autorizacion expresa de
  AESAN/BEDCA**".
- Hay una **solicitud ciudadana de datos abiertos** abierta en `datos.gob.es` (peticion
  14/04/2026, actualizada 29/09/2026, estado "Asignado", 67 solicitantes); aun **sin resolver**.

### El conflicto con AGPL-3.0

- Carbos se distribuye **empaquetado** (D26) bajo **AGPL-3.0**, que **permite a terceros** usar y
  redistribuir, incluso comercialmente.
- BEDCA limita el uso a **no comercial** y exige autorizacion expresa para reproduccion en
  formato electronico.
- Por tanto, empaquetar valores BEDCA en el artefacto AGPL **no encaja sin autorizacion expresa**
  (y probablemente no encaje aunque la haya, si la autorizacion no admite uso comercial derivado).
- "No modificar" tambien complica derivar porciones o normalizar unidades.

### Fuentes alternativas con condiciones claras

- **USDA FoodData Central** - dominio publico (CC0): reutilizable sin restriccion.
- **CIQUAL (ANSES, Francia)** - Licence Ouverte / Etalab: reutilizable, incluido comercial.
- **BEDCA mirror** (`github.com/TerjeRu/bedca-database`, Zenodo `10.5281/zenodo.22017000`):
  957 alimentos con datos, 31.166 valores, **bajo las mismas condiciones no comerciales**; util
  solo como referencia/cruce, no como fuente redistribuible.

## Que hace falta para cerrar el spike

1. **Leer y archivar** el `UsoBD.pdf` con fecha (hecho: resumen arriba).
2. **Pedir autorizacion expresa a AESAN/BEDCA** por escrito (`bedca.adm@gmail.com`) con el caso
   de uso completo (borrador abajo). Preguntar explicitamente si cubre: (a) redistribucion en repo
   publico, (b) relicenciar como AGPL-3.0, (c) uso comercial por terceros derivado de AGPL.
3. **Decidir D19** con dos ramas:
   - **A. Autorizados**: usar BEDCA, con la atribucion exacta y respetando "no modificar".
   - **B. No autorizados o sin respuesta**: **plan B abierto** (USDA/CIQUAL + curacion propia),
     citando BEDCA solo como referencia y sin copiar valores.
4. Registrar la decision y la atribucion en `docs/decisiones.md` (D19/D30) y cerrar.

> [!warning] Bloqueante
> Hasta cerrar (2), no se producen datos de alimentos. E1 no arranca.

## Borrador de solicitud a AESAN/BEDCA

> **Asunto:** Solicitud de autorizacion de uso de BEDCA en app de codigo abierto (no comercial)
>
> Buenas tardes. Soy Foron (foron23), desarrollador de **Carbos**, una aplicacion web
> instalable (PWA) **gratuita, sin animo de lucro, sin servidores y sin recogida de datos**, que
> ayuda a contar carbohidratos a personas con diabetes tipo 1. El codigo es abierto bajo
> **AGPL-3.0**.
>
> Quisiera solicitar **autorizacion expresa** para incluir, de forma **verbatim y sin
> modificacion**, un subconjunto (150-300 alimentos y platos de consumo habitual) de valores de
> composicion (principalmente `CHO`, carbohidratos) de **AESAN/BEDCA Base de Datos Espanola de
> Composicion de Alimentos v1.0 (2010)**, con la atribucion que indiquen.
>
> Preguntas concretas:
>
> 1. ¿Autorizan la **redistribucion** de esos valores dentro de una app AGPL-3.0 y de su
>    repositorio publico?
> 2. ¿La autorizacion admite el **uso comercial por terceros** que permitiria la AGPL-3.0?
> 3. ¿Que **texto de atribucion** exacto debemos incluir?
> 4. ¿Podemos anadir metadatos **propios** (nombre en ES/EN, porcion por defecto) sin alterar los
>    valores de BEDCA?
>
> Gracias por su tiempo.

## Salida esperada

- **D19 cerrada** (rama A o B) y **texto de atribucion** para el campo `source`.
- Si rama B: fuentes permitidas (USDA FDC, CIQUAL) y formato de `source`.

## Estado

**Cerrado (2026-10-12): plan B abierto.** E1 desbloqueada con fuentes reutilizables (USDA/CIQUAL +
curacion propia). La solicitud a AESAN queda como apendice opcional, no bloquea.
