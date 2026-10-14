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
    crop_materialize,
    dest_name,
    dest_name_box,
    load_decided,
    load_queue,
    materialize,
    now_iso,
    record,
    record_boxes,
    resolve_src,
    search_catalog,
    validate_box,
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
 #pic{flex:2;display:flex;align-items:center;justify-content:center;background:#8881;border-radius:8px;overflow:hidden;position:relative}
 #pic img{max-width:100%;max-height:100%;object-fit:contain}
 #cv{position:absolute;touch-action:none;cursor:crosshair}
 aside{flex:1;display:flex;flex-direction:column;gap:.5rem;min-width:280px}
 button{font-size:1rem;padding:.6rem;border-radius:8px;border:1px solid #8886;background:#8881;cursor:pointer;text-align:left}
 button:hover{background:#8883}
 .k{opacity:.6;margin-right:.4rem}
 #topk button b{color:#2a7}
 #topk button.active,#results button.active{outline:2px solid #2a7}
 #meta{font-size:.9rem;opacity:.75}
 #activeinfo{font-size:.85rem;opacity:.8}
 #boxlist{max-height:20vh;overflow:auto;display:flex;flex-direction:column;gap:.3rem;font-size:.9rem}
 .boxrow{display:flex;gap:.4rem;align-items:center}
 .boxrow span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
 .boxrow button{padding:.2rem .5rem}
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
  <span class="k">1-5 propuesta · a aceptar · r rechazar · n saltar · ←/→ · arrastra para dibujar cajas</span>
</header>
<main>
  <div id="pic"><img id="img" alt=""><canvas id="cv"></canvas></div>
  <aside>
    <div id="topk"></div>
    <div id="activeinfo"></div>
    <div id="boxlist"></div>
    <button id="confirm-boxes">✓ confirmar cajas</button>
    <button id="accept">a · aceptar la carpeta</button>
    <div id="searchrow"><input id="q" placeholder="buscar en el catalogo..."><button id="find">buscar</button></div>
    <div id="results"></div>
    <div class="row">
      <button id="reject" class="danger" style="flex:1">r · rechazar</button>
      <button id="skip" style="flex:1">n · saltar</button>
    </div>
    <div class="row">
      <button id="bulk-agree" style="flex:1">✓ clase: solo agree</button>
      <button id="bulk-all" style="flex:1">✓ clase: todas</button>
      <button id="bulk-skip" style="flex:1">↷ saltar clase</button>
    </div>
  </aside>
</main>
<footer id="foot"></footer>
<script>
let items=[], i=0, counts={}, boxes=[], activeClass=null, drag=null;
const $=id=>document.getElementById(id);
const cv=$('cv'), ctx=cv.getContext('2d');
function colorFor(id){
  let h=0; for(let k=0;k<id.length;k++) h=(h*31+id.charCodeAt(k))>>>0;
  return `hsl(${h%360} 70% 45%)`;
}
async function load(){
  const r=await fetch('/api/queue'); const d=await r.json();
  items=d.items; counts=d.counts; i=0; render();
}
function resizeCanvas(){
  const img=$('img');
  if(!img.naturalWidth||!img.naturalHeight){ cv.width=0; cv.height=0; return; }
  const pr=$('pic').getBoundingClientRect(), r=img.getBoundingClientRect();
  const scale=Math.min(r.width/img.naturalWidth, r.height/img.naturalHeight);
  const w=img.naturalWidth*scale, h=img.naturalHeight*scale;
  cv.style.left=(r.left-pr.left+(r.width-w)/2)+'px';
  cv.style.top=(r.top-pr.top+(r.height-h)/2)+'px';
  cv.style.width=w+'px'; cv.style.height=h+'px';
  cv.width=Math.max(1,Math.round(w)); cv.height=Math.max(1,Math.round(h));
  draw();
}
function draw(){
  const w=cv.width, h=cv.height;
  ctx.clearRect(0,0,w,h);
  for(const b of boxes){
    const [x,y,bw,bh]=b.box;
    ctx.strokeStyle=colorFor(b.label); ctx.lineWidth=2;
    ctx.strokeRect(x*w,y*h,bw*w,bh*h);
    ctx.fillStyle=colorFor(b.label); ctx.font='12px system-ui,sans-serif';
    ctx.fillText(b.label,x*w+2,y*h+12);
  }
  if(drag){
    const [x,y,bw,bh]=drag.box;
    ctx.strokeStyle='#2a7'; ctx.lineWidth=2; ctx.setLineDash([5,4]);
    ctx.strokeRect(x*w,y*h,bw*w,bh*h); ctx.setLineDash([]);
  }
}
function norm(e){
  const r=cv.getBoundingClientRect();
  const nx=(e.clientX-r.left)/r.width, ny=(e.clientY-r.top)/r.height;
  return [Math.min(1,Math.max(0,nx)),Math.min(1,Math.max(0,ny))];
}
function rectFrom(a,b){
  return [Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.abs(a[0]-b[0]),Math.abs(a[1]-b[1])];
}
function setActive(id){
  if(!id) return;
  activeClass=id;
  document.querySelectorAll('#topk button,#results button').forEach(b=>b.classList.toggle('active',b.dataset.id===id));
  $('activeinfo').textContent='clase activa: '+id;
}
function renderBoxes(){
  const el=$('boxlist');
  if(!boxes.length){ el.innerHTML='<em>sin cajas · elige clase y arrastra sobre la imagen</em>'; return; }
  el.innerHTML=boxes.map((b,n)=>`<div class="boxrow"><span style="color:${colorFor(b.label)}">${b.label}</span><button data-n="${n}">✕</button></div>`).join('');
  el.querySelectorAll('button').forEach(btn=>btn.onclick=()=>{boxes.splice(+btn.dataset.n,1);draw();renderBoxes();});
}
function resetBoxes(){ boxes=[]; drag=null; activeClass=null; }
function render(){
  const it=items[i];
  resetBoxes();
  $('bar').style.width = (100*(i/items.length)).toFixed(1)+'%';
  if(!it){ $('img').removeAttribute('src'); $('topk').innerHTML='<em>Cola terminada.</em>'; $('boxlist').innerHTML=''; $('activeinfo').textContent=''; ctx.clearRect(0,0,cv.width,cv.height); return; }
  $('img').src='/img?p='+encodeURIComponent(it.path);
  const cls=it.folderClass||'(ninguna)';
  const rem=items.filter(x=>(x.folderClass||'(ninguna)')===cls).length;
  $('meta').textContent=`${i+1}/${items.length} · carpeta: ${cls} (${rem} restantes) · ${it.agree===true?'agree':it.agree===false?'disagree':'n/a'}`;
  $('foot').textContent=`confirmadas=${counts.accepted} rechazadas=${counts.rejected} saltadas=${counts.skipped} pendientes=${items.length-i}`;
  const tk=it.topk||[];
  $('topk').innerHTML=tk.map((p,n)=>`<button data-id="${p.id}"><span class="k">${n+1}</span>${p.id} <b>${(p.p*100).toFixed(1)}%</b></button>`).join('')
     + `<button data-id="${it.folderClass||''}"><span class="k">a</span>${it.folderClass||'(carpeta)'} <b>carpeta</b></button>`;
  $('topk').querySelectorAll('button').forEach(b=>b.onclick=()=>setActive(b.dataset.id));
  $('results').innerHTML='';
  const def=it.folderClass||(tk[0]&&tk[0].id)||'';
  if(def) setActive(def); else $('activeinfo').textContent='';
  renderBoxes();
  draw();
}
cv.addEventListener('pointerdown',e=>{
  if(!$('img').naturalWidth) return;
  if(!activeClass){ $('activeinfo').textContent='elige una clase activa antes de dibujar'; return; }
  cv.setPointerCapture(e.pointerId);
  const p=norm(e); drag={start:p,box:[p[0],p[1],0,0]}; draw();
});
cv.addEventListener('pointermove',e=>{
  if(!drag) return;
  drag.box=rectFrom(drag.start,norm(e)); draw();
});
function endDrag(){
  if(!drag) return;
  const b=drag.box; drag=null;
  if(b[2]>0.005&&b[3]>0.005){ boxes.push({label:activeClass,box:b.map(v=>+v.toFixed(4))}); }
  draw(); renderBoxes();
}
cv.addEventListener('pointerup',endDrag);
cv.addEventListener('pointercancel',endDrag);
$('img').addEventListener('load',resizeCanvas);
window.addEventListener('resize',resizeCanvas);
async function decide(action,label){
  const it=items[i]; if(!it) return;
  await fetch('/api/decide',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:it.path,action,label})});
  counts.accepted+=(action==='reject'?0:1); counts.rejected+=(action==='reject'?1:0); counts.skipped+=(action==='skip'?1:0);
  i++; render();
}
async function confirmBoxes(){
  const it=items[i]; if(!it||!boxes.length) return;
  const r=await fetch('/api/decide',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:it.path,boxes})});
  const d=await r.json();
  if(d.ok){ counts.accepted+=1; i++; render(); }
  else { $('activeinfo').textContent=(d.error||'error al confirmar'); }
}
async function find(){
  const q=$('q').value.trim(); if(!q) return;
  const r=await fetch('/api/search?q='+encodeURIComponent(q)); const d=await r.json();
  $('results').innerHTML=d.matches.map(id=>`<button data-id="${id}">${id}</button>`).join('');
  $('results').querySelectorAll('button').forEach(b=>b.onclick=()=>setActive(b.dataset.id));
}
async function bulk(mode){
  const it=items[i]; if(!it||!it.folderClass) return;
  const r=await fetch('/api/bulk',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({class:it.folderClass,mode})});
  const d=await r.json();
  if(d.ok){ items=d.items||[]; counts=d.counts||counts; i=0; render(); }
}
$('confirm-boxes').onclick=confirmBoxes;
$('accept').onclick=()=>{const it=items[i]; if(it&&it.folderClass) decide('accept',it.folderClass);};
$('reject').onclick=()=>decide('reject');
$('skip').onclick=()=>{i++;render();};
$('bulk-agree').onclick=()=>bulk('accept-agree');
$('bulk-all').onclick=()=>bulk('accept');
$('bulk-skip').onclick=()=>bulk('skip');
$('find').onclick=find;
$('q').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();find();}});
document.addEventListener('keydown',e=>{
  if(e.target.tagName==='INPUT') return;
  const it=items[i];
  if(e.key==='a'){if(it&&it.folderClass) decide('accept',it.folderClass);}
  else if(e.key==='r') decide('reject');
  else if(e.key==='n'){i++;render();}
  else if(e.key==='ArrowRight'){i=Math.min(i+1,items.length);render();}
  else if(e.key==='ArrowLeft'){i=Math.max(i-1,0);render();}
  else if(/^[1-9]$/.test(e.key)){const tk=(it&&it.topk)||[]; const n=+e.key-1; if(tk[n]) decide('topk',tk[n].id);}
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
        # Agrupa por clase para revisar clase a clase (mucho mas eficiente en volumen).
        self.items.sort(key=lambda r: (r.get("folderClass") or "", r["path"]))
        self.lock = threading.Lock()
        self.counts = {"accepted": 0, "rejected": 0, "skipped": 0, "errors": 0}

    def queue_payload(self) -> dict:
        return {"items": self.items, "counts": self.counts}

    def decide(
        self,
        path: str,
        action: str,
        label: str | None = None,
        boxes: list[dict] | None = None,
    ) -> dict:
        row = next((r for r in self.items if r["path"] == path), None)
        if row is None:
            return {"ok": False, "error": "fila no encontrada"}
        if boxes is not None:
            if not isinstance(boxes, list):
                with self.lock:
                    self.counts["errors"] += 1
                return {"ok": False, "error": "'boxes' debe ser una lista"}
            valid_boxes: list[dict] = []
            for b in boxes:
                if not isinstance(b, dict):
                    with self.lock:
                        self.counts["errors"] += 1
                    return {"ok": False, "error": f"cada caja debe ser un objeto: {b!r}"}
                bid = b.get("label")
                if bid not in self.valid_ids:
                    with self.lock:
                        self.counts["errors"] += 1
                    return {"ok": False, "error": f"'{bid}' no es id del catalogo"}
                try:
                    box = validate_box(b.get("box"))
                except ValueError as exc:
                    with self.lock:
                        self.counts["errors"] += 1
                    return {"ok": False, "error": f"caja invalida: {exc}"}
                valid_boxes.append({"label": bid, "box": [box[0], box[1], box[2], box[3]]})
            if not valid_boxes:
                with self.lock:
                    self.counts["errors"] += 1
                return {"ok": False, "error": "'boxes' vacio; se omite"}
            src = resolve_src(path)
            if not src.exists():
                with self.lock:
                    self.counts["errors"] += 1
                return {"ok": False, "error": "imagen origen ausente"}
            with self.lock:
                written: list[Path] = []
                try:
                    for b in valid_boxes:
                        dest = self.args.out_dir / dest_name_box(path, b["label"], b["box"])
                        if crop_materialize(src, dest, b["box"]) == "crop":
                            written.append(dest)
                except ValueError as exc:
                    for dest in written:  # rollback: sin recortes huerfanos
                        try:
                            dest.unlink()
                        except OSError:
                            pass
                    self.counts["errors"] += 1
                    return {"ok": False, "error": f"error al recortar: {exc}"}
                append_log(self.args.log, record_boxes(row, valid_boxes, "boxes", True, "server"))
                self.counts["accepted"] += 1
                self.items = [r for r in self.items if r["path"] != path]
            return {"ok": True, "counts": self.counts}
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
            self.items = [r for r in self.items if r["path"] != path]
        return {"ok": True, "counts": self.counts}

    def bulk(self, class_id: str, mode: str) -> dict:
        """Operacion en volumen sobre todas las filas pendientes de una clase."""
        rows = [r for r in self.items if r.get("folderClass") == class_id]
        if not rows:
            return {"ok": False, "error": "clase sin filas pendientes"}
        if mode not in ("accept", "accept-agree", "skip"):
            return {"ok": False, "error": "modo invalido"}
        processed: set[str] = set()
        for row in rows:
            if mode == "accept-agree" and not row.get("agree"):
                continue
            processed.add(row["path"])
            if mode == "skip":
                with self.lock:
                    self.counts["skipped"] += 1
                continue
            src = resolve_src(row["path"])
            if not src.exists():
                with self.lock:
                    self.counts["errors"] += 1
                continue
            dest = self.args.out_dir / dest_name(row["path"], class_id)
            with self.lock:
                materialize(src, dest, False)
                self.counts["accepted"] += 1
            rec = record(row, class_id, "bulk-class", True, "server-bulk")
            rec["bulk"] = True
            append_log(self.args.log, rec)
        self.items = [r for r in self.items if r["path"] not in processed]
        return {"ok": True, "done": len(processed), "counts": self.counts, "items": self.items}


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
            path = urlparse(self.path).path
            if path not in ("/api/decide", "/api/bulk"):
                return self._send(404, b"not found", "text/plain")
            length = int(self.headers.get("Content-Length", 0))
            try:
                payload = json.loads(self.rfile.read(length) or b"{}")
            except json.JSONDecodeError:
                return self._json({"ok": False, "error": "json invalido"}, 400)
            if path == "/api/bulk":
                result = state.bulk(payload.get("class", ""), payload.get("mode", "accept"))
            else:
                result = state.decide(
                    payload.get("path", ""),
                    payload.get("action", ""),
                    payload.get("label"),
                    payload.get("boxes"),
                )
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
