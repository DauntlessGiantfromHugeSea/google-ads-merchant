import { useEffect, useRef, useState } from "react";

/** Unterschriften-Feld: zeichnen (Maus/Finger), Vollbild, optional Bild-Upload.
 *  Liefert eine PNG-DataURL über onChange. */
export default function SignaturePad({ onChange, allowUpload = false }:
  { onChange: (dataUrl: string) => void; allowUpload?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [full, setFull] = useState(false);
  const [uploaded, setUploaded] = useState("");

  const setup = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 2) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineWidth = 2.4; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#111";
    dirty.current = false;
  };

  useEffect(() => {
    const id = requestAnimationFrame(setup);
    const onR = () => requestAnimationFrame(setup);
    window.addEventListener("resize", onR);
    window.addEventListener("orientationchange", onR);
    return () => { cancelAnimationFrame(id); window.removeEventListener("resize", onR); window.removeEventListener("orientationchange", onR); };
  }, []);
  useEffect(() => { const id = requestAnimationFrame(setup); return () => cancelAnimationFrame(id); }, [full]);

  const pos = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const start = (e: React.PointerEvent) => {
    if (uploaded) return;
    e.preventDefault(); drawing.current = true; last.current = pos(e);
    try { canvasRef.current!.setPointerCapture(e.pointerId); } catch { /* noop */ }
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = pos(e);
    ctx.beginPath(); ctx.moveTo(last.current!.x, last.current!.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    last.current = p; dirty.current = true;
  };
  const commit = () => { if (dirty.current && canvasRef.current) onChange(canvasRef.current.toDataURL("image/png")); };
  const end = () => { if (!drawing.current) return; drawing.current = false; commit(); };
  const clear = () => {
    const c = canvasRef.current;
    if (c) c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    dirty.current = false; setUploaded(""); onChange("");
  };
  const upload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    const img = new Image();
    img.onload = () => {
      const maxW = 700, scale = Math.min(1, maxW / img.width);
      const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
      const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
      cv.getContext("2d")!.drawImage(img, 0, 0, w, h);   // Seitenverhältnis bleibt erhalten
      const d = cv.toDataURL("image/png"); setUploaded(d); onChange(d);
    };
    img.src = URL.createObjectURL(f);
    e.target.value = "";
  };

  const canvas = (cls: string, style?: React.CSSProperties) => (
    <canvas ref={canvasRef} className={cls} style={style}
      onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onPointerLeave={end} />
  );

  return (
    <div>
      {!full && (uploaded
        ? <div className="sig-preview"><img src={uploaded} alt="Unterschrift" /></div>
        : canvas("sigpad"))}

      <div className="row-inline" style={{ justifyContent: "space-between", marginTop: 4, flexWrap: "wrap" }}>
        <span className="muted" style={{ fontSize: 12 }}>{uploaded ? "Bild geladen" : "Mit Maus oder Finger unterschreiben"}</span>
        <span className="row-inline">
          {allowUpload && <label className="link-btn" style={{ cursor: "pointer" }}>Bild hochladen<input type="file" accept="image/*" style={{ display: "none" }} onChange={upload} /></label>}
          {!uploaded && <button type="button" className="link-btn" onClick={() => setFull(true)}>Vollbild</button>}
          <button type="button" className="link-btn" onClick={clear}>Leeren</button>
        </span>
      </div>

      {full && (
        <div className="sig-full">
          <div className="sig-full-head">
            <strong>Unterschrift</strong>
            <div className="row-inline">
              <button type="button" className="btn btn-ghost btn-sm" onClick={clear}>Leeren</button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => { commit(); setFull(false); }}>Fertig</button>
            </div>
          </div>
          {canvas("sigpad sig-full-canvas")}
        </div>
      )}
    </div>
  );
}
