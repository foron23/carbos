#!/usr/bin/env python3
"""Servidor local de etiquetado (spec 12): revisa la cola en el navegador.

Levanta un servidor HTTP **solo en 127.0.0.1** que sirve una pagina para revisar
la cola de etiquetas: muestra la imagen, la clase de la carpeta y las propuestas
del teacher; con un clic (o teclado) confirmas, eliges otra, buscas en el catalogo,
rechazas o saltas. Las decisiones van a `data/confirmed` con `reviewed:true`.

Reutiliza la logica de `confirm_labels.py` (misma materializacion y log), asi que
la cola es compatible entre CLI y servidor.

Uso:
    python3 tools/data/label_server.py                 # cola L/14 por defecto
    python3 tools/data/label_server.py --class paella,croquetas --open
    python3 tools/data/label_server.py --port 8765 --limit 100
"""

from __future__ import annotations

import argparse
import json
import mimetypes
import sys
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, str(Path(__file__).resolve().parent))
from confirm_labels import (  # noqa: E402
    REJECT_LABEL,
    append_log,
    build_catalog_index,
    dest_name,
    load_decided,
    load_queue,
    materialize,
    now_iso,
    record,
    resolve_src,
    search_catalog,
)
from fetch_images import load_foods  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CATALOG = ROOT / "src/catalog/catalog.ts"
_L14_QUEUE = ROOT / "data/labels/l14/review.queue.jsonl"
DEFAULT_QUEUE = _L14_QUEUE if _L14_QUEUE.exists() else ROOT / "data/labels/review.queue.jsonl"
DEFAULT_OUT = ROOT / "data/confirmed"
DEFAULT_LOG = ROOT / "data/labels/confirmed.jsonl"

PAGE = """<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Carbos - etiquetado local</title>
<style>
 :root{color-scheme:light dark}
 body{font-family:system-ui,sans-serif;margin:0;display:flex;flex-direction:column;height:100vh}
 header{padding:.5rem 1rem;display:flex;gap:1rem;align-items:center;border-bottom:1px solid #8884}
 #bar{height:6px;background:#2a7;width:0}
 main{flex:1;display:flex;gap:1rem;padding:1rem;min-height:0}
 #pic{flex:2;display:flex;align-items:center;justify-content:center;background:#8881;border-radius:8px;overflow:hidden}
 #pic img{max-width:100%;max-height:100%;object-fit:contain}
 aside{flex:1;display:flex;flex-direction:column;gap:.5rem;min-width:280px}
 button{font-size:1rem;padding:.6rem;border-radius:8px;border:1px solid #8886;background:#8881;cursor:pointer;text-align:left}
 button:hover{background:#8883}
 .k{opacity:.6;margin-right:.4rem}
 #topk button b{color:#2a7}
 #meta{font-size:.9rem;opacity:.75}
 #searchrow{display:flex;gap:.4rem}
 input{flex:1;padding:.5rem;border-radius:8px;border:1px solid #8886;background:transparent;color:inherit}
 #results{max-height:30vh;overflow:auto;display:flex;flex-direction:column;gap:.3rem}
 .row{display:flex;gap:.4rem}
 .danger{color:#c33}
 footer{padding:.4rem 1rem;font-size:.85rem;opacity:.7}
</style></head><body>
<div id="bar"></div>
<header>
  <strong>Etiquetado local</strong>
  <span id="meta">cargando...</span>
  <span style="flex:1"></span>
  <span class="k">teclas: 1-5 propuesta · a aceptar · r rechazar · n saltar · ←/→</span>
</header>
<main>
  <div id="pic"><img id="img" alt=""></div>
  <aside>
    <div id="topk"></div>
    <button id="accept">a · aceptar la carpeta</button>
    <div id="searchrow"><input id="q" placeholder="buscar en el catalogo..."><button id="find">buscar</button></div>
    <div id="results"></div>
    <div class="row">
      <button id="reject" class="danger" style="flex:1">r · rechazar</button>
      <button id="skip" style="flex:1">n · saltar</button>
    </div>
  </aside>
</main>
<footer id="foot"></footer>
<script>
let items=[], i=0, counts={};
const $=id=>document.getElementById(id);
async function load(){
  const r=await fetch('/api/queue'); const d=await r.json();
  items=d.items; counts=d.counts; i=0; render();
}
function render(){
  const it=items[i];
  $('bar').style.width = (100*(i/items.length)).toFixed(1)+'%';
  if(!it){ $('img').removeAttribute('src'); $('topk').innerHTML='<em>Cola terminada.</em>'; return; }
  $('img').src='/img?p='+encodeURIComponent(it.path);
  $('meta').textContent=`${i+1}/${items.length} · carpeta: ${it.folderClass||'(ninguna)'} · ${it.agree===true?'agree':it.agree===false?'disagree':'n/a'}`;
  $('foot').textContent=`confirmadas=${counts.accepted} rechazadas=${counts.rejected} saltadas=${counts.skipped} pendientes=${items.length-i}`;
  const tk=it.topk||[];
  $('topk').innerHTML=tk.map((p,n)=>`<button data-n="${n}" data-id="${p.id}"><span class="k">${n+1}</span>${p.id} <b>${(p.p*100).toFixed(1)}%</b></button>`).join('')
     + `<button data-n="0" data-id="${it.folderClass||''}"><span class="k">a</span>${it.folderClass||'(carpeta)'} <b>carpeta</b></button>`;
  $('topk').querySelectorAll('button').forEach(b=>b.onclick=()=>decide(b.dataset.n==='0'?'accept':'topk',b.dataset.id));
}
async function decide(action,label){
  const it=items[i]; if(!it) return;
  await fetch('/api/decide',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:it.path,action,label})});
  counts.accepted+=(action==='reject'?0:1); counts.rejected+=(action==='reject'?1:0); counts.skipped+=(action==='skip'?1:0);
  i++; render();
}
async function find(){
  const q=$('q').value.trim(); if(!q) return;
  const r=await fetch('/api/search?q='+encodeURIComponent(q)); const d=await r.json();
  $('results').innerHTML=d.matches.map(id=>`<button data-id="${id}">${id}</button>`).join('');
  $('results').querySelectorAll('button').forEach(b=>b.onclick=()=>decide('label',b.dataset.id));
}
$('accept').onclick=()=>{const it=items[i]; if(it&&it.folderClass) decide('accept',it.folderClass);};
$('reject').onclick=()=>decide('reject');
$('skip').onclick=()=>{i++;render();};
$('find').onclick=find;
$('q').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();find();}});
document.addEventListener('keydown',e=>{
  if(e.target.tagName==='INPUT') return;
  if(e.key==='a'){const it=items[i]; if(it&&it.folderClass) decide('accept',it.folderClass);}
  else if(e.key==='r') decide('reject');
  else if(e.key==='n'){i++;render();}
  else if(e.key==='ArrowRight'){i=Math.min(i+1,items.length);render();}
  else if(e.key==='ArrowLeft'){i=Math.max(i-1,0);render();}
  else if(/^[1-9]$/.test(e.key)){const b=$('topk').querySelector(`button[data-n="${e.key}"]`); if(b)b.click();}
});
load();
</script></body></html>"""


class State:
    def __init__(self, args: argparse.Namespace):
        self.args = args
        self.valid_ids = [f["id"] for f in load_foods(args.catalog)]
        self.index = build_catalog_index([f for f in load_foods(args.catalog)])
        decided = load_decided(args.log)
        rows = load_queue(args.queue)
        if args.classes:
            wanted = set(args.classes)
            rows = [r for r in rows if r.get("folderClass") in wanted]
        if args.limit and args.limit > 0:
            rows = rows[: args.limit]
        self.items = [r for r in rows if r["path"] not in decided]
        self.lock = threading.Lock()
        self.counts = {"accepted": 0, "rejected": 0, "skipped": 0, "errors": 0}

    def queue_payload(self) -> dict:
        return {"items": self.items, "counts": self.counts}

    def decide(self, path: str, action: str, label: str | None) -> dict:
        row = next((r for r in self.items if r["path"] == path), None)
        if row is None:
            return {"ok": False, "error": "fila no encontrada"}
        if action == "reject":
            label = REJECT_LABEL
        elif action == "skip":
            with self.lock:
                self.counts["skipped"] += 1
            return {"ok": True}
        if label != REJECT_LABEL and label not in self.valid_ids:
            with self.lock:
                self.counts["errors"] += 1
            return {"ok": False, "error": f"'{label}' no es id del catalogo"}
        src = resolve_src(path)
        if not src.exists():
            with self.lock:
                self.counts["errors"] += 1
            return {"ok": False, "error": "imagen origen ausente"}
        dest = self.args.out_dir / dest_name(path, label)
        with self.lock:
            if label == REJECT_LABEL:
                self.counts["rejected"] += 1
            else:
                materialize(src, dest, False)
                self.counts["accepted"] += 1
            append_log(self.args.log, record(row, label, "topk", True, "server"))
        return {"ok": True, "counts": self.counts}


def make_handler(state: State):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):  # silencio
            pass

        def _send(self, code: int, body: bytes, ctype: str) -> None:
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _json(self, obj, code=200) -> None:
            self._send(code, json.dumps(obj, ensure_ascii=False).encode(), "application/json")

        def do_GET(self) -> None:
            url = urlparse(self.path)
            if url.path == "/":
                return self._send(200, PAGE.encode(), "text/html; charset=utf-8")
            if url.path == "/api/queue":
                return self._json(state.queue_payload())
            if url.path == "/api/search":
                q = (parse_qs(url.query).get("q") or [""])[0]
                return self._json({"matches": search_catalog(state.index, q)})
            if url.path == "/img":
                rel = (parse_qs(url.query).get("p") or [""])[0]
                src = resolve_src(rel).resolve()
                data_root = (ROOT / "data").resolve()
                if data_root not in src.parents or not src.is_file():
                    return self._send(403, b"forbidden", "text/plain")
                ctype = mimetypes.guess_type(src.name)[0] or "application/octet-stream"
                return self._send(200, src.read_bytes(), ctype)
            return self._send(404, b"not found", "text/plain")

        def do_POST(self) -> None:
            if urlparse(self.path).path != "/api/decide":
                return self._send(404, b"not found", "text/plain")
            length = int(self.headers.get("Content-Length", 0))
            try:
                payload = json.loads(self.rfile.read(length) or b"{}")
            except json.JSONDecodeError:
                return self._json({"ok": False, "error": "json invalido"}, 400)
            result = state.decide(payload.get("path", ""), payload.get("action", ""), payload.get("label"))
            return self._json(result, 200 if result.get("ok") else 400)

    return Handler


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Servidor local de etiquetado (spec 12).")
    p.add_argument("--queue", type=Path, default=DEFAULT_QUEUE)
    p.add_argument("--out-dir", type=Path, default=DEFAULT_OUT)
    p.add_argument("--log", type=Path, default=DEFAULT_LOG)
    p.add_argument("--catalog", type=Path, default=DEFAULT_CATALOG)
    p.add_argument("--class", dest="classes", default="", help="filtra por folderClass (csv)")
    p.add_argument("--limit", type=int, default=0)
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=8765)
    p.add_argument("--open", action="store_true", help="abre el navegador")
    args = p.parse_args()
    args.classes = [c for c in args.classes.split(",") if c]
    return args


def main() -> int:
    args = parse_args()
    if args.host not in ("127.0.0.1", "localhost", "::1"):
        print("error: por privacidad solo se sirve en localhost", file=sys.stderr)
        return 2
    if not args.queue.exists():
        print(f"error: no existe la cola {args.queue}", file=sys.stderr)
        return 2
    state = State(args)
    if not state.items:
        print("no hay filas pendientes en la cola (todo revisado)")
        return 0
    httpd = ThreadingHTTPServer((args.host, args.port), make_handler(state))
    url = f"http://{args.host}:{args.port}/"
    print(f"etiquetado local en {url}  ({len(state.items)} pendientes)")
    print("Ctrl+C para parar.")
    if args.open:
        threading.Timer(0.5, lambda: webbrowser.open(url)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nparado.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
