import { useEffect, useRef } from "react";

/** Einfaches Unterschriften-Feld: mit Maus/Finger zeichnen, liefert PNG-DataURL. */
export default function SignaturePad({ onChange }: { onChange: (dataUrl: string) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = ref.current!;
    // Auflösung an Anzeigegröße + DPR koppeln (scharfe Linien).
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111";
  }, []);

  const pos = (e: PointerEvent | React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: (e as PointerEvent).clientX - r.left, y: (e as PointerEvent).clientY - r.top };
  };
  const start = (e: React.PointerEvent) => {
    e.preventDefault(); drawing.current = true; last.current = pos(e);
    ref.current!.setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const ctx = ref.current!.getContext("2d")!;
    const p = pos(e);
    ctx.beginPath(); ctx.moveTo(last.current!.x, last.current!.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    last.current = p; dirty.current = true;
  };
  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    if (dirty.current) onChange(ref.current!.toDataURL("image/png"));
  };
  const clear = () => {
    const canvas = ref.current!;
    canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
    dirty.current = false; onChange("");
  };

  return (
    <div>
      <canvas ref={ref} className="sigpad" onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerLeave={end} />
      <div className="row-inline" style={{ justifyContent: "space-between", marginTop: 4 }}>
        <span className="muted" style={{ fontSize: 12 }}>Hier mit Maus oder Finger unterschreiben</span>
        <button type="button" className="link-btn" onClick={clear}>Feld leeren</button>
      </div>
    </div>
  );
}
