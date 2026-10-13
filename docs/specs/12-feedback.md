# SPEC 10 - Feedback de usuarios para construir dataset (DIFERIDO)

> [!abstract] TL;DR
> Mecanismo **opt-in** para que las correcciones de los usuarios generen un dataset propio,
> alineado al catalogo, sin pedirles etiquetar a mano. **Diferido**: se especifica ahora, se
> implementa mas adelante. Destino de subida **por definir**.

## Por que

El cuello de botella del reconocimiento es la **cobertura** (~28 %): ningun clasificador publico
habla el idioma del catalogo. El fine-tuning al catalogo necesita imagenes por clase, que hoy no
existen (set propio, D25). El uso real es la fuente natural de esas imagenes.

## Idea

Cuando el usuario **confirma o corrige** una clasificacion de la foto, ofrecer (opt-in, foto a
foto) contribuir esa imagen con su **etiqueta confirmada**. Se acumula un dataset real:
`clase_del_catalogo -> imagenes`.

## Diseno propuesto

- **Consentimiento por foto (por defecto)**: nada se sube sin un "compartir esta foto" claro.
  Ademas, en **ajustes** hay un **toggle global opcional** ("compartir automaticamente las fotos que
  confirme") para 0 friccion; sigue siendo consentimiento explicito (una vez) y **revocable**.
  Nunca subida silenciosa sin ningun consentimiento.
- **Cola en el dispositivo** (IndexedDB) con estado; el usuario ve que se subira y puede borrarlo.
- **Sin cuentas ni identificadores**: se sube solo la **imagen** (recortada) + el **id de clase**
  confirmado. Se **elimina EXIF** antes de subir. Nada de metadatos del usuario.
- **Destino de subida (decidido 2026-10-13, D38)**: **bundle + receptor sin servidor**. La app
  exporta un `.zip` de contribuciones (`consent.json` + `metadata.csv` + recortes sin EXIF) y el
  mantenedor lo importa con `tools/data/import_contributions.py` (valida consentimiento, licencia,
  quita EXIF, deduplica por sha256). Es la via **mas automatica sin backend**; un endpoint propio
  (Cloudflare Worker) queda para mas adelante, cuando haya volumen.
  - **Licencia de la contribucion: CC0-1.0** (la mas compatible con el proyecto AGPL-3.0; sin
    obligaciones para quien reutilice el dataset). Un bundle sin `consent.json` o con otra licencia
    se **rechaza entero**.
  - ⚠️ **Tension declarada**: "0 friccion / automatico" choca con la promesa del producto ("la foto
    nunca sale del dispositivo", D11) y con la regla de consentimiento por foto. Maximo honesto: un
    **consentimiento explicito** (por foto o un toggle global claro) y luego cola en dispositivo +
    envio en segundo plano; **nunca subida silenciosa**.
- **Generacion del dataset**: agregar, revisar y deduplicar las contribuciones en
  `dataset/<clase>/` para el pipeline de `training/` (fine-tuning al catalogo).
- **Herramientas de revision (mantenedor)**: `confirm_labels.py` (CLI interactiva) y
  `label_server.py` (**servidor local** en el navegador, `make data-label`) comparten la misma cola
  y escriben en `data/confirmed` con `reviewed:true`. Los modos automaticos escriben en
  `data/proposed` con `reviewed:false`: **propuesto no es confirmado**. El servidor agrupa por clase
  y ofrece operaciones en volumen (aceptar la clase, solo las `agree`, o saltarla).

## Formato del bundle (congelado v1)

```
contributions-<ts>.zip
  consent.json   {"format":"carbos-contrib","version":1,"license":"CC0-1.0",
                  "granted_at":"...","app_version":"...","images":N}
  metadata.csv   cabecera `path,class_id`; una fila por imagen
  images/<class_id>/<nombre>.<ext>
```

- `license` debe ser **CC0-1.0** (D38); cualquier otro valor **rechaza el bundle entero**.
- Recortes sin EXIF/GPS; sin cuentas ni identificadores.
- **Congelado**: cambios incompatibles suben `version`. El receptor
  (`tools/data/import_contributions.py`) valida este contrato.

## Recepcion en Cloudflare (R2)

Endpoint **serverless** (Cloudflare Workers + R2) que recibe el bundle y lo guarda; pasos, codigo
y pruebas en [`workers/contrib/README.md`](../../workers/contrib/README.md). Es la via **mas
automatica con mantenimiento casi nulo** (plan gratuito); alternativas sin infra (formulario,
email) quedan como plan B.

## Privacidad y riesgos

- **Privacidad**: sin cuentas, sin EXIF, opt-in por foto; el usuario puede no contribuir nunca.
- **Abuso**: moderacion minima del lado del colector (tamano, tipo, dedupe).
- **Coste**: almacenamiento y ancho de banda del colector; acotado por el opt-in.
- **Texto**: la UI lo presenta como "ayudar a mejorar el reconocimiento", nunca como subida
  obligatoria ni como analitica (D11: sin analitica).

## Estado

**Diferido en la app, pero con el receptor listo.** Decisiones cerradas el 2026-10-13 (D38):
licencia **CC0-1.0**, recepcion **sin servidor** via bundle + `tools/data/import_contributions.py`,
y **publicacion del dataset diferida** (de momento no se redistribuyen imagenes; solo se acumulan
localmente en `data/contrib/`). El **export del bundle en la app** (opt-in) se especifica en
[`15-subida-contribuciones.md`](15-subida-contribuciones.md) (D39) y se implementara cuando la app
este mas establecida.
