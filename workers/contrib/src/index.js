// Receptor de contribuciones de usuarios (spec 12 / D38) en Cloudflare Workers + R2.
//
// POST /api/contrib  con el bundle `contributions-<ts>.zip` en el cuerpo.
// Guarda el zip en R2 como `contrib/<YYYY-MM-DD>/<uuid>.zip` y responde {ok,id,key}.
// No valida el contenido del bundle: eso lo hace `tools/data/import_contributions.py`
// al descargarlo (consentimiento CC0, EXIF, dedupe). Aqui solo se comprueba que es un
// zip y que no supera MAX_BYTES.

function corsHeaders(origin, allowed) {
  const ok = allowed.length === 0 || allowed.includes(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin || '*' : allowed[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Consent',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const cors = corsHeaders(origin, allowed);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    if (url.pathname === '/' || url.pathname === '/health') {
      return json({ ok: true, service: 'carbos-contrib' }, 200, cors);
    }
    if (url.pathname !== '/api/contrib') return json({ ok: false, error: 'not found' }, 404, cors);
    if (request.method !== 'POST') return json({ ok: false, error: 'method' }, 405, cors);
    if (allowed.length && !allowed.includes(origin)) {
      return json({ ok: false, error: 'origin no permitido' }, 403, cors);
    }

    const max = Number(env.MAX_BYTES || 26214400);
    const declared = Number(request.headers.get('Content-Length') || 0);
    if (declared > max) return json({ ok: false, error: 'demasiado grande' }, 413, cors);

    const body = await request.arrayBuffer();
    if (body.byteLength === 0) return json({ ok: false, error: 'cuerpo vacio' }, 400, cors);
    if (body.byteLength > max) return json({ ok: false, error: 'demasiado grande' }, 413, cors);

    const bytes = new Uint8Array(body);
    const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b; // "PK"
    if (!isZip) return json({ ok: false, error: 'no es un zip' }, 415, cors);

    // Tope duro de coste: si el bucket ya tiene MAX_OBJECTS, se rechaza. Con
    // MAX_OBJECTS * MAX_BYTES por debajo de los 10 GB gratis de R2, es imposible
    // incurrir en sobrecoste (y la regla de ciclo de vida borra lo viejo).
    const maxObjects = Number(env.MAX_OBJECTS || 300);
    const listing = await env.CONTRIB.list({ limit: maxObjects });
    if (listing.truncated) {
      return json({ ok: false, error: 'cuota de almacenamiento alcanzada' }, 507, cors);
    }

    const day = new Date().toISOString().slice(0, 10);
    const id = crypto.randomUUID();
    const key = `contrib/${day}/${id}.zip`;
    await env.CONTRIB.put(key, body, { httpMetadata: { contentType: 'application/zip' } });

    return json({ ok: true, id, key }, 200, cors);
  },
};
