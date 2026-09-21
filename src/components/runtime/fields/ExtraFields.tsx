"use client";

import React, { useEffect, useRef, useState } from "react";
import { FieldDefinition } from "@/types/schema";
import { useLiveApp } from "@/context/LiveAppContext";
import { storageService } from "@/lib/storage/firestoreProvider";
import { FieldLabel } from "@/components/ui/FormControls";
import { Button } from "@/components/ui/Button";
import { Star, UploadCloud, X, FileText, Image as ImageIcon, MapPin, Loader2, Eraser, Bold, Italic, List, Underline, ScanLine, Check } from "lucide-react";

const inputCls = (error?: string) =>
  `w-full bg-white border ${error ? "border-rose-400 focus:ring-rose-300/40" : "border-slate-300 focus:ring-blue-500/25 focus:border-blue-500"} text-slate-900 text-sm rounded-lg px-3 py-2 transition-all placeholder:text-slate-400 focus:outline-none focus:ring-2 shadow-2xs disabled:bg-slate-50 disabled:text-slate-500`;

const Wrap: React.FC<{ field: FieldDefinition; error?: string; children: React.ReactNode }> = ({ field, error, children }) => (
  <div className="w-full space-y-1.5">
    <FieldLabel required={field.required} tooltip={field.tooltip}>{field.label}</FieldLabel>
    {children}
    {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}
    {!error && field.description && <p className="text-[11px] text-slate-500">{field.description}</p>}
  </div>
);

// ── Rating ───────────────────────────────────────────────────────────────────
export const RatingField: React.FC<{ field: FieldDefinition; value: any; onChange: (v: any) => void; error?: string; disabled?: boolean }> = ({ field, value, onChange, error, disabled }) => {
  const max = field.ratingMax || 5;
  const [hover, setHover] = useState(0);
  return (
    <Wrap field={field} error={error}>
      <div className="flex items-center gap-1 py-1">
        {Array.from({ length: max }).map((_, i) => {
          const n = i + 1;
          const active = n <= (hover || Number(value) || 0);
          return (
            <button key={n} type="button" disabled={disabled} onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)} onClick={() => onChange(n === Number(value) ? "" : n)} className="p-0.5 disabled:cursor-not-allowed">
              <Star className={`w-6 h-6 transition-colors ${active ? "fill-amber-400 text-amber-400" : "text-slate-300"}`} />
            </button>
          );
        })}
        {value ? <span className="ml-2 text-xs text-slate-500">{value} / {max}</span> : null}
      </div>
    </Wrap>
  );
};

// ── Color ────────────────────────────────────────────────────────────────────
export const ColorField: React.FC<{ field: FieldDefinition; value: any; onChange: (v: any) => void; error?: string; disabled?: boolean }> = ({ field, value, onChange, error, disabled }) => (
  <Wrap field={field} error={error}>
    <div className="flex items-center gap-2">
      <input type="color" disabled={disabled} value={value || "#2563eb"} onChange={(e) => onChange(e.target.value)} className="w-10 h-9 rounded-lg border border-slate-300 cursor-pointer bg-white p-0.5" />
      <input type="text" disabled={disabled} value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder="#2563eb" className={`${inputCls(error)} font-mono`} />
    </div>
  </Wrap>
);

// ── Multi select (chips) ─────────────────────────────────────────────────────
export const MultiSelectField: React.FC<{ field: FieldDefinition; value: any; onChange: (v: any) => void; error?: string; disabled?: boolean }> = ({ field, value, onChange, error, disabled }) => {
  const selected: string[] = Array.isArray(value) ? value : value ? [value] : [];
  const toggle = (opt: string) => onChange(selected.includes(opt) ? selected.filter((o) => o !== opt) : [...selected, opt]);
  return (
    <Wrap field={field} error={error}>
      <div className={`flex flex-wrap gap-1.5 p-2 rounded-lg border bg-white min-h-[42px] ${error ? "border-rose-400" : "border-slate-300"}`}>
        {(field.options || []).map((opt) => {
          const on = selected.includes(opt);
          const color = field.optionColors?.[opt];
          return (
            <button key={opt} type="button" disabled={disabled} onClick={() => toggle(opt)} className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all flex items-center gap-1 ${on ? "bg-blue-600 text-white border-blue-600" : "bg-slate-50 text-slate-700 border-slate-200 hover:border-blue-300"}`} style={on && color ? { backgroundColor: color, borderColor: color } : undefined}>
              {on && <Check className="w-3 h-3" />}
              {opt}
            </button>
          );
        })}
        {(field.options || []).length === 0 && <span className="text-xs text-slate-400">No options configured</span>}
      </div>
    </Wrap>
  );
};

// ── Users (app members) ──────────────────────────────────────────────────────
export const UsersField: React.FC<{ field: FieldDefinition; value: any; onChange: (v: any) => void; error?: string; disabled?: boolean }> = ({ field, value, onChange, error, disabled }) => {
  const { app } = useLiveApp();
  const members = [...(app?.members || [])];
  if (app?.ownerEmail && !members.some((m) => m.email === app.ownerEmail)) members.unshift({ email: app.ownerEmail, name: "Owner", roleId: "", status: "active", addedAt: "" });
  return (
    <Wrap field={field} error={error}>
      <select disabled={disabled} value={value || ""} onChange={(e) => onChange(e.target.value)} className={`${inputCls(error)} cursor-pointer`}>
        <option value="">Assign to…</option>
        {members.map((m) => (
          <option key={m.email} value={m.email}>{m.name ? `${m.name} (${m.email})` : m.email}</option>
        ))}
      </select>
    </Wrap>
  );
};

// ── Address (composite) ──────────────────────────────────────────────────────
export const AddressField: React.FC<{ field: FieldDefinition; value: any; onChange: (v: any) => void; error?: string; disabled?: boolean }> = ({ field, value, onChange, error, disabled }) => {
  const v = value && typeof value === "object" ? value : {};
  const set = (k: string, val: string) => onChange({ ...v, [k]: val });
  return (
    <Wrap field={field} error={error}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 p-3 rounded-lg border border-slate-200 bg-slate-50/60">
        <input disabled={disabled} value={v.line1 || ""} onChange={(e) => set("line1", e.target.value)} placeholder="Address line 1" className={`${inputCls()} md:col-span-2`} />
        <input disabled={disabled} value={v.line2 || ""} onChange={(e) => set("line2", e.target.value)} placeholder="Address line 2 (optional)" className={`${inputCls()} md:col-span-2`} />
        <input disabled={disabled} value={v.city || ""} onChange={(e) => set("city", e.target.value)} placeholder="City" className={inputCls()} />
        <input disabled={disabled} value={v.state || ""} onChange={(e) => set("state", e.target.value)} placeholder="State" className={inputCls()} />
        <input disabled={disabled} value={v.pincode || ""} onChange={(e) => set("pincode", e.target.value)} placeholder="PIN / ZIP" className={inputCls()} />
        <input disabled={disabled} value={v.country || ""} onChange={(e) => set("country", e.target.value)} placeholder="Country" className={inputCls()} />
      </div>
    </Wrap>
  );
};

// ── Geolocation ──────────────────────────────────────────────────────────────
export const GeoField: React.FC<{ field: FieldDefinition; value: any; onChange: (v: any) => void; error?: string; disabled?: boolean }> = ({ field, value, onChange, error, disabled }) => {
  const [busy, setBusy] = useState(false);
  const v = value && typeof value === "object" ? value : {};
  const locate = () => {
    if (!navigator.geolocation) return;
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { onChange({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }); setBusy(false); },
      () => setBusy(false),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };
  return (
    <Wrap field={field} error={error}>
      <div className="flex items-center gap-2">
        <input disabled={disabled} type="number" step="any" value={v.lat ?? ""} onChange={(e) => onChange({ ...v, lat: e.target.value === "" ? "" : parseFloat(e.target.value) })} placeholder="Latitude" className={inputCls(error)} />
        <input disabled={disabled} type="number" step="any" value={v.lng ?? ""} onChange={(e) => onChange({ ...v, lng: e.target.value === "" ? "" : parseFloat(e.target.value) })} placeholder="Longitude" className={inputCls(error)} />
        <Button type="button" variant="outline" size="sm" disabled={disabled || busy} onClick={locate} icon={busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MapPin className="w-3.5 h-3.5 text-blue-600" />}>Locate</Button>
      </div>
      {v.lat !== undefined && v.lat !== "" && (
        <a href={`https://www.google.com/maps?q=${v.lat},${v.lng}`} target="_blank" rel="noreferrer" className="text-[11px] text-blue-600 hover:underline">Open in Google Maps ↗</a>
      )}
    </Wrap>
  );
};

// ── Barcode / QR ─────────────────────────────────────────────────────────────
export const BarcodeField: React.FC<{ field: FieldDefinition; value: any; onChange: (v: any) => void; error?: string; disabled?: boolean }> = ({ field, value, onChange, error, disabled }) => {
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const supported = typeof window !== "undefined" && "BarcodeDetector" in window;

  const stop = () => { streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; setScanning(false); };

  const start = async () => {
    if (!supported) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      setScanning(true);
      setTimeout(async () => {
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
        const Detector = (window as any).BarcodeDetector;
        const detector = new Detector({ formats: ["qr_code", "ean_13", "ean_8", "code_128", "code_39", "upc_a", "upc_e"] });
        const tick = async () => {
          if (!streamRef.current || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes.length) { onChange(codes[0].rawValue); stop(); return; }
          } catch { /* keep scanning */ }
          requestAnimationFrame(tick);
        };
        tick();
      }, 50);
    } catch { setScanning(false); }
  };

  useEffect(() => () => stop(), []);

  return (
    <Wrap field={field} error={error}>
      <div className="flex items-center gap-2">
        <input disabled={disabled} value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder || "Scan or type code"} className={`${inputCls(error)} font-mono`} />
        <Button type="button" variant="outline" size="sm" disabled={disabled || !supported} title={supported ? "Scan with camera" : "Camera scanning not supported in this browser"} onClick={scanning ? stop : start} icon={<ScanLine className="w-3.5 h-3.5 text-blue-600" />}>{scanning ? "Stop" : "Scan"}</Button>
      </div>
      {scanning && <video ref={videoRef} className="w-full max-w-xs rounded-lg border border-slate-300 mt-2" muted playsInline />}
    </Wrap>
  );
};

// ── Signature ────────────────────────────────────────────────────────────────
export const SignatureField: React.FC<{ field: FieldDefinition; value: any; onChange: (v: any) => void; error?: string; disabled?: boolean }> = ({ field, value, onChange, error, disabled }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, c.width, c.height);
    if (value) { const img = new Image(); img.onload = () => ctx.drawImage(img, 0, 0); img.src = value; }
  }, [value]);

  const pos = (e: React.PointerEvent) => { const r = canvasRef.current!.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * canvasRef.current!.width, y: ((e.clientY - r.top) / r.height) * canvasRef.current!.height }; };
  const down = (e: React.PointerEvent) => { if (disabled) return; drawing.current = true; const ctx = canvasRef.current!.getContext("2d")!; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
  const move = (e: React.PointerEvent) => { if (!drawing.current) return; const ctx = canvasRef.current!.getContext("2d")!; const p = pos(e); ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.strokeStyle = "#0f172a"; ctx.lineTo(p.x, p.y); ctx.stroke(); };
  const up = () => { if (!drawing.current) return; drawing.current = false; onChange(canvasRef.current!.toDataURL("image/png")); };
  const clear = () => { const c = canvasRef.current!; c.getContext("2d")!.clearRect(0, 0, c.width, c.height); onChange(""); };

  return (
    <Wrap field={field} error={error}>
      <div className="relative inline-block w-full max-w-md">
        <canvas ref={canvasRef} width={480} height={160} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} className={`w-full h-40 bg-white rounded-lg border-2 border-dashed ${error ? "border-rose-300" : "border-slate-300"} touch-none ${disabled ? "opacity-60" : "cursor-crosshair"}`} />
        {!disabled && (
          <button type="button" onClick={clear} className="absolute top-2 right-2 p-1 rounded-md bg-white/90 border border-slate-200 text-slate-500 hover:text-rose-600" title="Clear"><Eraser className="w-3.5 h-3.5" /></button>
        )}
        {!value && <span className="absolute bottom-2 left-3 text-[11px] text-slate-400 pointer-events-none">Sign here</span>}
      </div>
    </Wrap>
  );
};

// ── Rich text (contentEditable with basic toolbar) ───────────────────────────
export const RichTextField: React.FC<{ field: FieldDefinition; value: any; onChange: (v: any) => void; error?: string; disabled?: boolean }> = ({ field, value, onChange, error, disabled }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current && ref.current.innerHTML !== (value || "")) ref.current.innerHTML = value || ""; }, [value]);
  const exec = (cmd: string) => { document.execCommand(cmd); ref.current?.focus(); onChange(ref.current?.innerHTML || ""); };
  return (
    <Wrap field={field} error={error}>
      <div className={`rounded-lg border bg-white ${error ? "border-rose-400" : "border-slate-300"}`}>
        {!disabled && (
          <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-slate-100 bg-slate-50/70 rounded-t-lg">
            {[{ c: "bold", i: <Bold className="w-3.5 h-3.5" /> }, { c: "italic", i: <Italic className="w-3.5 h-3.5" /> }, { c: "underline", i: <Underline className="w-3.5 h-3.5" /> }, { c: "insertUnorderedList", i: <List className="w-3.5 h-3.5" /> }].map((b) => (
              <button key={b.c} type="button" onMouseDown={(e) => { e.preventDefault(); exec(b.c); }} className="p-1.5 rounded text-slate-500 hover:bg-slate-200 hover:text-slate-800">{b.i}</button>
            ))}
          </div>
        )}
        <div ref={ref} contentEditable={!disabled} suppressContentEditableWarning onInput={() => onChange(ref.current?.innerHTML || "")} className="min-h-[110px] p-3 text-sm text-slate-800 focus:outline-none prose prose-sm max-w-none [&_ul]:list-disc [&_ul]:pl-5" data-placeholder={field.placeholder || "Write something…"} />
      </div>
    </Wrap>
  );
};

// ── File / Image upload (Firebase Storage) ───────────────────────────────────
export interface UploadedFile { url: string; name: string; size: number; type: string; path: string }

export const FileField: React.FC<{ field: FieldDefinition; value: any; onChange: (v: any) => void; error?: string; disabled?: boolean }> = ({ field, value, onChange, error, disabled }) => {
  const { app } = useLiveApp();
  const [progress, setProgress] = useState<number | null>(null);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const isImage = field.type === "image";
  const multiple = Boolean(field.multipleFiles);
  const files: UploadedFile[] = Array.isArray(value) ? value : value?.url ? [value] : [];
  const maxMb = field.validation?.maxFileSizeMb || 10;

  const upload = async (list: FileList | null) => {
    if (!list || !app) return;
    const picked = Array.from(list).slice(0, multiple ? 10 : 1);
    const out: UploadedFile[] = [];
    for (const f of picked) {
      if (f.size > maxMb * 1024 * 1024) { alert(`${f.name} exceeds ${maxMb} MB`); continue; }
      if (isImage && !f.type.startsWith("image/")) { alert(`${f.name} is not an image`); continue; }
      const allowed = field.validation?.allowedFileTypes;
      if (allowed?.length && !allowed.some((ext) => f.name.toLowerCase().endsWith(ext.toLowerCase().replace(/^\*?\.?/, ".")))) { alert(`${f.name}: type not allowed`); continue; }
      setProgress(0);
      try { out.push(await storageService.uploadFile(app.id, f, setProgress)); }
      catch (err) { console.error(err); alert("Upload failed. Check Firebase Storage rules."); }
    }
    setProgress(null);
    if (out.length === 0) return;
    onChange(multiple ? [...files, ...out] : out[0]);
  };

  const remove = (idx: number) => { const next = files.filter((_, i) => i !== idx); onChange(multiple ? next : next[0] || ""); };

  return (
    <Wrap field={field} error={error}>
      <div
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); if (!disabled) upload(e.dataTransfer.files); }}
        onClick={() => !disabled && inputRef.current?.click()}
        className={`rounded-xl border-2 border-dashed p-4 text-center transition-all ${disabled ? "bg-slate-50 opacity-70" : "cursor-pointer hover:border-blue-400 hover:bg-blue-50/40"} ${drag ? "border-blue-500 bg-blue-50" : error ? "border-rose-300" : "border-slate-300"}`}
      >
        <input ref={inputRef} type="file" hidden multiple={multiple} accept={isImage ? "image/*" : field.validation?.allowedFileTypes?.join(",")} onChange={(e) => upload(e.target.files)} disabled={disabled} />
        {progress !== null ? (
          <div className="space-y-1.5">
            <div className="text-xs text-slate-600 flex items-center justify-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading… {progress}%</div>
            <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden"><div className="h-full bg-blue-600 transition-all" style={{ width: `${progress}%` }} /></div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1 text-slate-500">
            {isImage ? <ImageIcon className="w-6 h-6 text-blue-500" /> : <UploadCloud className="w-6 h-6 text-blue-500" />}
            <span className="text-xs font-medium text-slate-700">{isImage ? "Drop image or click to upload" : "Drop file or click to upload"}</span>
            <span className="text-[10px] text-slate-400">Max {maxMb} MB{multiple ? " · multiple allowed" : ""}</span>
          </div>
        )}
      </div>
      {files.length > 0 && (
        <div className={`grid gap-2 ${isImage ? "grid-cols-2 md:grid-cols-4" : "grid-cols-1"}`}>
          {files.map((f, i) => (
            <div key={f.path || i} className="relative group rounded-lg border border-slate-200 bg-white overflow-hidden">
              {isImage || f.type?.startsWith("image/") ? (
                <a href={f.url} target="_blank" rel="noreferrer"><img src={f.url} alt={f.name} className="w-full h-28 object-cover" /></a>
              ) : (
                <a href={f.url} target="_blank" rel="noreferrer" className="flex items-center gap-2.5 p-2.5 text-xs text-slate-700 hover:bg-slate-50">
                  <FileText className="w-4 h-4 text-blue-500 shrink-0" />
                  <span className="truncate flex-1">{f.name}</span>
                  <span className="text-[10px] text-slate-400">{(f.size / 1024).toFixed(0)} KB</span>
                </a>
              )}
              {!disabled && (
                <button type="button" onClick={(e) => { e.stopPropagation(); remove(i); }} className="absolute top-1 right-1 p-1 rounded-md bg-white/90 border border-slate-200 text-slate-500 hover:text-rose-600 opacity-0 group-hover:opacity-100 transition-opacity"><X className="w-3 h-3" /></button>
              )}
            </div>
          ))}
        </div>
      )}
    </Wrap>
  );
};
