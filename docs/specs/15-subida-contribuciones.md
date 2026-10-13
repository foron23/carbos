# 15 - Subida de contribuciones desde la app

> [!abstract] TL;DR
> Cierra el lado cliente de la spec 12: la app construye un `contributions.zip`
> (formato **v1 congelado**, licencia **CC0-1.0**) con **recortes sin EXIF** y el **id de clase
> confirmado**, lo encola en el dispositivo y lo sube al receptor (Cloudflare Worker + R2). El
> consentimiento es **por foto** por defecto, con un **toggle global** opcional en Ajustes para 0
> friccion. Sin cuentas, sin identificadores, nunca subida silenciosa sin consentimiento.

El receptor (Worker + R2), el importador (`tools/data/import_contributions.py`) y las herramientas
de revision ya existen ([`12-feedback.md`](12-feedback.md), D38). Esta spec define **el unico tramo
que falta**: la generacion y subida del bundle desde la app.

## Contexto

La promesa del producto es "la foto nunca sale del dispositivo" (D11); la contribucion es un acto
**explicito y opt-in** que la excepciona (spec 12). Hoy la app captura la foto (ya sin EXIF: se
dibuja en canvas, `src/capture/image.ts`), detecta regiones (`DetectionResult` con `box` y
`classId`) y el usuario confirma/corrige la clase (D34). Ese par **(recorte, id de clase
confirmado)** es exactamente la etiqueta de calidad que el dataset necesita.

Lo que falta es: recortar la region confirmada, guardarla en una cola local, empaquetarla en el
formato v1 y subirla.

## Alcance

**Entra**: consentimiento (por foto + toggle global), recorte, cola en IndexedDB, construccion del
zip, subida con reintentos, i18n, borrado por el usuario.

**No entra**: la publicacion/redistribucion del dataset (diferida, D38); el endpoint en
`carbos.foron.dev/api/*` (opcional, ver `workers/contrib/README.md`); la app no decide el destino
del dataset.

## Diseno

### Consentimiento (D38)

- **Por foto (por defecto)**: en el panel de deteccion / borrador, un boton
  **"compartir esta foto"** encola los recortes confirmados de esa foto.
- **Toggle global (Ajustes)**: "compartir automaticamente las fotos que confirme". Si esta activo,
  al **registrar** una comida de origen `photo` se encolan sus recortes sin pedir nada mas
  (**0 friccion**), pero el consentimiento ya se dio **una vez** de forma explicita y es
  **revocable** (al desactivarlo no se encola nada nuevo; lo ya encolado se puede borrar).
- **Nunca** subida silenciosa sin ningun consentimiento.

### Recorte

- Fuente: la `CapturedImage.dataUrl` (canvas; sin EXIF) y el `box` normalizado del
  `DetectionResult`.
- Se dibuja la region (con el mismo margen que el clasificador) en un canvas y se codifica a
  **JPEG** (~calidad 0.8). El canvas **no conserva metadatos**: el recorte sale limpio por
  construccion.
- Solo se recortan items con `classId` del catalogo (los anadidos a mano no tienen etiqueta).

### Cola en el dispositivo

- Nuevo store IndexedDB `contributions` (via `src/core/db.ts`) con estado:
  `pending | sent | failed`, `blob` (JPEG), `classId`, `createdAt`, `attempts`.
- Visible en Ajustes: "N fotos en cola", con **borrar** (todo o por item). El usuario manda.

### Bundle (formato v1 congelado)

`src/contrib/bundle.ts` construye un zip **STORE** (sin compresion, **sin dependencias**; ~60
lineas de escritor zip) con la estructura congelada en la spec 12:

```
consent.json   {"format":"carbos-contrib","version":1,"license":"CC0-1.0",
                "granted_at":"...","app_version":"...","images":N}
metadata.csv   path,class_id
images/<class_id>/<hash>.<ext>
```

- `<hash>` = sha256 corto del JPEG (ayuda al dedupe; el importador rehashea igual).
- El zip se construye **en memoria** y se sube; no se escribe a disco.

### Subida

- `src/contrib/upload.ts`: `POST` del zip al endpoint con `fetch` (`Content-Type:
application/zip`). El navegador pone el `Origin`; el Worker lo valida por allowlist
  (`carbos.foron.dev`).
- **Endpoint configurable**: por defecto `https://carbos-contrib.forondaiker.workers.dev/api/contrib`;
  si se activa la ruta en el dominio, `https://carbos.foron.dev/api/contrib`.
- Reintentos con backoff (p. ej. 3 intentos) al abrir la app / recuperar conexion (la PWA es
  offline-first). Estado por item; un fallo no bloquea al resto.
- Respuesta `{ok:true,id,key}` -> el item pasa a `sent` y se puede purgar.

### Privacidad y textos

- Solo viaja el **recorte** y el **id de clase**; sin cuentas, sin identificadores, sin EXIF/GPS,
  sin analitica (D11).
- i18n ES/EN con las reglas de redaccion: "ayudar a mejorar el reconocimiento", nunca subida
  obligatoria, nunca "seguro/preciso"; es **revocable** y **borrable**.

## Modulos y cambios

| Fichero                 | Cambio                                                                          |
| ----------------------- | ------------------------------------------------------------------------------- |
| `src/contrib/bundle.ts` | **Nuevo**: escritor zip STORE + `consent.json` + `metadata.csv`                 |
| `src/contrib/queue.ts`  | **Nuevo**: store IndexedDB `contributions` (add/list/remove/estado)             |
| `src/contrib/upload.ts` | **Nuevo**: POST al endpoint + reintentos                                        |
| `src/contrib/crop.ts`   | **Nuevo**: recorte de `dataUrl` + `box` -> JPEG                                 |
| `src/core/db.ts`        | Store nuevo y bump de `DB_VERSION`                                              |
| `src/main.ts`           | Toggle en `#settings`, boton "compartir esta foto", encolar al registrar, flush |
| `src/i18n/index.ts`     | Cadenas ES/EN (ajustes, boton, estado de cola, avisos)                          |

## Criterios de aceptacion

1. Con el toggle global **apagado**, registrar una foto **no** encola nada; solo el boton
   "compartir esta foto" encola.
2. Con el toggle **encendido**, registrar una comida `photo` encola los recortes confirmados
   (solo items con `classId`).
3. El zip resultante **valida** contra el formato v1 (el importador local lo acepta sin cambios).
4. El recorte **no contiene EXIF/GPS** y es JPEG valido.
5. Desactivar el toggle **no** borra lo ya encolado; el usuario puede **borrar** la cola a mano.
6. La subida usa `fetch` con CORS correcto y reintenta ante fallo sin duplicar items.
7. No se envia ningun identificador de usuario; el bundle solo lleva recorte + `class_id` +
   `consent.json`.
8. Todas las cadenas existen en `es` y `en` (guardas de i18n existentes).
9. `make check` verde y la app sigue funcionando **offline** (la subida es diferida).

## Tests

- **Unitarios**: `bundle.ts` (zip valido, entradas y `consent.json` correctos), `crop.ts`
  (recorte sin metadatos, tamano), `queue.ts` (estados, borrado), `upload.ts` (exito, fallo,
  reintento, sin duplicar) con `fetch` mockeado.
- **Integracion**: construir un bundle desde items de prueba y pasarlo por
  `tools/data/import_contributions.py` (receptor) -> importa sin errores.
- **Manual**: `make data-e2e DATA_ENDPOINT=<url>` sigue en verde; la app sube y el objeto aparece
  en R2.

## Referencias

- [`12-feedback.md`](12-feedback.md) (spec 12: receptor, consentimiento, formato v1).
- `docs/decisiones.md` D38 (licencia CC0, recepcion sin servidor) y D11 (nada sale del
  dispositivo salvo consentimiento explicito).
- `workers/contrib/README.md` (endpoint) y `tools/data/import_contributions.py` (receptor).

## Riesgos

- **Friccion vs promesa**: el toggle global es lo mas automatico sin romper la promesa; el texto
  debe ser claro para que el consentimiento sea informado.
- **Tamano del bundle**: se acotan N imagenes por subida (p. ej. 50) para no superar `MAX_BYTES`
  del Worker (25 MB); si se supera, se trocea en varios zips.
- **iOS/PWA**: el almacenamiento se puede borrar a los 7 dias; la cola es efimera y el aviso de
  exportar (E10) sigue aplicando.
- **Abuso**: el Worker ya limita tamano y numero de objetos; la app no necesita logica extra.
