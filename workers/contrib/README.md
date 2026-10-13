# Receptor de contribuciones (Cloudflare Workers + R2)

Endpoint **sin servidor que mantener** que recibe los bundles de contribuciones
(`contributions-<ts>.zip`, spec 12 / D38) y los guarda en R2. Luego el mantenedor
los descarga e importa con `tools/data/import_contributions.py`.

Plan gratuito de sobra: R2 da **10 GB** de almacenamiento y **1 M operaciones
Clase A / 10 M Clase B** al mes; Workers, **100 000 peticiones/día**.

## Pasos (una sola vez)

1. **Instala y autentica wrangler** (CLI de Cloudflare):

   ```bash
   npm i -g wrangler      # o usa `npx wrangler ...`
   wrangler login
   ```

2. **Crea el bucket R2**:

   ```bash
   wrangler r2 bucket create carbos-contributions
   ```

3. **Configura** `workers/contrib/wrangler.toml`:
   - `ALLOWED_ORIGINS`: el origen de la app (por defecto `https://foron23.github.io`).
   - `MAX_BYTES`: tamaño máximo del bundle (por defecto 25 MB).
   - (Opcional) descomenta `routes` para servirlo en tu dominio (`contrib.TUDOMINIO/api/*`).

4. **Despliega**:

   ```bash
   cd workers/contrib
   wrangler deploy
   ```

   Te dará una URL tipo `https://carbos-contrib.TU-SUBDOMINIO.workers.dev`.
   Si definiste `routes`, también responde en `https://carbos.foron.dev/api/contrib`.

   > **Ruta en tu dominio**: `carbos.foron.dev` sirve la app por nginx (tras Cloudflare).
   > Para que `/api/contrib` llegue al Worker hay que **crear la ruta** en la zona
   > `foron.dev`: descomenta `routes` en `wrangler.toml`
   > (`{ pattern = "carbos.foron.dev/api/*", zone_name = "foron.dev" }`) y vuelve a
   > `wrangler deploy`. Mientras no exista la ruta, el POST lo atiende nginx (405).

5. **(Recomendado) Retención**: borra automáticamente lo viejo (privacidad):

   ```bash
   wrangler r2 bucket lifecycle add carbos-contributions --name expirar --expire-days 90
   ```

   (o en el panel de R2: _Object lifecycle rules_).

## Probar

```bash
# health
curl https://carbos-contrib.TU-SUBDOMINIO.workers.dev/health

# subir un bundle (simula la app)
curl -X POST \
  -H "Origin: https://foron23.github.io" \
  -H "Content-Type: application/zip" \
  --data-binary @contributions-2026-10-13.zip \
  https://carbos-contrib.TU-SUBDOMINIO.workers.dev/api/contrib
# -> {"ok":true,"id":"...","key":"contrib/2026-10-13/....zip"}
```

## Descargar e importar

```bash
wrangler r2 object get carbos-contributions/contrib/2026-10-13/<id>.zip --file contrib.zip
python3 tools/data/import_contributions.py --bundle contrib.zip
```

Para lotes, `rclone` con el backend `r2` (descarga el prefijo `contrib/`) y un bucle
sobre `import_contributions.py`.

## Limitar al tier gratuito (sin sobrecoste)

- **Workers en plan Free**: al pasar de 100 000 peticiones/día **falla** (no factura).
  Comprueba que el proyecto está en **Free**, no en Paid (si estuviera en Paid, sí habría
  sobrecoste). El Worker no necesita nada de pago.
- **R2**: el tier gratuito es **10 GB** de almacenamiento + **1 M ops Clase A / 10 M Clase B**
  al mes. Para que sea **imposible** pasarse, el Worker impone un **tope duro de objetos**
  (`MAX_OBJECTS`, por defecto 300): si el bucket ya está lleno, responde **507** y no guarda
  nada. Con `MAX_OBJECTS × MAX_BYTES` por debajo de 10 GB, no hay sobrecoste posible.
- **Retencion**: la regla de ciclo de vida (`--expire-days 90`) borra lo viejo, así el bucket
  se mantiene lejos del tope.
- **Canario**: activa una **notificación** de Cloudflare (Billing → Notifications / R2 usage)
  por si el uso se acerca a los límites; es solo aviso, el tope duro ya evita el gasto.

## Notas

- El Worker **no** valida el contenido: eso lo hace `import_contributions.py`
  (consentimiento CC0, EXIF fuera, dedupe por sha256).
- CORS: solo el/los orígenes de `ALLOWED_ORIGINS`; preflight `OPTIONS` soportado.
- Privacidad: solo llega el zip con recortes sin EXIF y el id de clase; sin cuentas ni
  identificadores. La retención se controla con la regla de ciclo de vida.
- Licencia de la contribución: **CC0-1.0** (D38).
