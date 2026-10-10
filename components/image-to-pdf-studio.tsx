"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown, ArrowRight, ArrowUp, Check, CheckCircle2, ChevronDown,
  Download, FileImage, FileText, ImagePlus, LoaderCircle, LockKeyhole,
  Plus, RotateCw, ShieldCheck, Sparkles, Trash2, UploadCloud, X
} from "lucide-react";
import { PDFDocument } from "pdf-lib";

type PaperSize = "fit" | "a3" | "a4" | "a5" | "letter" | "legal";
type Orientation = "portrait" | "landscape";
type StudioOutput = { name: string; blob: Blob; size: number; pages: number };
type ImageSize = { width: number; height: number };
type Preview = { key: string; file: File; url: string };

const MAX_IMAGE_BYTES = 50 * 1024 * 1024;
const MAX_IMAGES = 80;
const PAPER_MM: Record<Exclude<PaperSize, "fit">, [number, number]> = {
  a3: [297, 420], a4: [210, 297], a5: [148, 210],
  letter: [215.9, 279.4], legal: [215.9, 355.6],
};
const PAPER_LABEL: Record<PaperSize, string> = {
  fit: "Fit to image", a3: "A3", a4: "A4", a5: "A5",
  letter: "US Letter", legal: "US Legal",
};
const fileKey = (file: File) => file.name + "::" + file.size + "::" + file.lastModified;
const isSupportedImage = (file: File) =>
  ["image/jpeg", "image/png", "image/webp"].includes(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name);
const formatSize = (size: number) => size < 1024 * 1024
  ? Math.max(1, Math.round(size / 1024)) + " KB"
  : (size / (1024 * 1024)).toFixed(1) + " MB";
const moduloRotation = (value: number) => ((value % 360) + 360) % 360;

function toBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("The browser could not prepare this image. Try a different image file.")), type, 0.94);
  });
}

async function renderImage(file: File, clockwiseDegrees: number) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Could not open " + file.name + ". Try saving it as JPG, PNG or WebP."));
    });
    const angle = moduloRotation(clockwiseDegrees);
    const quarterTurn = angle === 90 || angle === 270;
    const canvas = document.createElement("canvas");
    canvas.width = quarterTurn ? image.naturalHeight : image.naturalWidth;
    canvas.height = quarterTurn ? image.naturalWidth : image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser cannot process this image. Try another browser tab.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate(angle * Math.PI / 180);
    context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
    const jpeg = await toBlob(canvas, "image/jpeg");
    return {
      bytes: new Uint8Array(await jpeg.arrayBuffer()),
      width: canvas.width,
      height: canvas.height,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function orientPage(width: number, height: number, orientation: Orientation) {
  if (orientation === "landscape" && height > width) return [height, width] as [number, number];
  if (orientation === "portrait" && width > height) return [height, width] as [number, number];
  return [width, height] as [number, number];
}

function buildPageSize(size: PaperSize, orientation: Orientation, pixelWidth: number, pixelHeight: number, marginMm: number) {
  const mmToPoints = 72 / 25.4;
  let width: number;
  let height: number;
  if (size === "fit") {
    width = pixelWidth * 0.75 + (marginMm * 2 * mmToPoints);
    height = pixelHeight * 0.75 + (marginMm * 2 * mmToPoints);
  } else {
    const dims = PAPER_MM[size];
    width = dims[0] * mmToPoints;
    height = dims[1] * mmToPoints;
  }
  return orientPage(width, height, orientation);
}

function downloadOutput(output: StudioOutput) {
  const url = URL.createObjectURL(output.blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = output.name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function ImageToPdfStudio() {
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [pageSize, setPageSize] = useState<PaperSize>("a4");
  const [orientation, setOrientation] = useState<Orientation>("portrait");
  const [marginMm, setMarginMm] = useState(10);
  const [rotations, setRotations] = useState<Record<string, number>>({});
  const [dimensions, setDimensions] = useState<Record<string, ImageSize>>({});
  const [mergeImages, setMergeImages] = useState(true);
  const [outputs, setOutputs] = useState<StudioOutput[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const previews = useMemo<Preview[]>(() => files.map((file) => ({
    key: fileKey(file), file, url: "",
  })), [files]);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    const urls: Record<string, string> = {};
    for (const file of files) urls[fileKey(file)] = URL.createObjectURL(file);
    setPreviewUrls(urls);
    return () => Object.values(urls).forEach((url) => URL.revokeObjectURL(url));
  }, [files]);

  const previewItems = previews.map((preview) => ({
    ...preview, url: previewUrls[preview.key] || "",
  })).filter((preview) => Boolean(preview.url));

  const selectedBytes = files.reduce((sum, file) => sum + file.size, 0);
  const currentPaper = (() => {
    const first = files[0];
    const firstKey = first ? fileKey(first) : "";
    const natural = dimensions[firstKey];
    const rotation = rotations[firstKey] ?? 0;
    const quarterTurn = rotation === 90 || rotation === 270;
    const naturalWidth = natural ? (quarterTurn ? natural.height : natural.width) : 595.28;
    const naturalHeight = natural ? (quarterTurn ? natural.width : natural.height) : 841.89;
    const page = buildPageSize(pageSize, orientation, naturalWidth, naturalHeight, marginMm);
    return {
      widthPoints: page[0],
      heightPoints: page[1],
      widthMm: page[0] * 25.4 / 72,
      heightMm: page[1] * 25.4 / 72,
      ratio: page[0] / page[1],
    };
  })();

  function clearResult() {
    setOutputs([]);
    setSuccess("");
  }

  function addImages(incoming: FileList | File[]) {
    setError("");
    clearResult();
    const accepted: File[] = [];
    const list = Array.from(incoming);
    const problems: string[] = [];
    for (const file of list) {
      if (!isSupportedImage(file)) {
        problems.push(file.name + " is not a JPG, PNG or WebP image.");
      } else if (file.size > MAX_IMAGE_BYTES) {
        problems.push(file.name + " exceeds the 50 MB per-image limit.");
      } else {
        accepted.push(file);
      }
    }
    setFiles((current) => {
      const next = [...current];
      for (const file of accepted) {
        const duplicate = next.some((candidate) =>
          candidate.name === file.name && candidate.size === file.size && candidate.lastModified === file.lastModified
        );
        if (!duplicate) next.push(file);
      }
      if (next.length > MAX_IMAGES) {
        problems.push("You can add up to " + MAX_IMAGES + " images per conversion.");
        return next.slice(0, MAX_IMAGES);
      }
      return next;
    });
    if (problems.length) setError(problems.slice(0, 3).join(" "));
    if (!accepted.length && list.length && !problems.length) setError("Choose at least one image to continue.");
  }

  function removeImage(index: number) {
    const removed = files[index];
    if (removed) {
      const key = fileKey(removed);
      setRotations((current) => { const next = { ...current }; delete next[key]; return next; });
      setDimensions((current) => { const next = { ...current }; delete next[key]; return next; });
    }
    setFiles((current) => current.filter((_, i) => i !== index));
    setError("");
    clearResult();
  }

  function moveImage(index: number, offset: number) {
    const target = index + offset;
    if (target < 0 || target >= files.length) return;
    setFiles((current) => {
      const next = current.slice();
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      return next;
    });
    clearResult();
  }

  function setImageRotation(file: File, angle: number) {
    setRotations((current) => ({ ...current, [fileKey(file)]: moduloRotation(angle) }));
    clearResult();
    setError("");
  }

  async function convertImages() {
    if (!files.length || busy) return;
    setBusy(true);
    setError("");
    setSuccess("");
    setOutputs([]);
    try {
      const result: StudioOutput[] = [];
      if (mergeImages) {
        const pdf = await PDFDocument.create();
        for (const file of files) {
          const imageKey = fileKey(file);
          const rendered = await renderImage(file, rotations[imageKey] ?? 0);
          const embedded = await pdf.embedJpg(rendered.bytes);
          const mmToPt = 72 / 25.4;
          const [pageWidth, pageHeight] = buildPageSize(pageSize, orientation, rendered.width, rendered.height, marginMm);
          const inset = marginMm * mmToPt;
          const availableWidth = pageWidth - (inset * 2);
          const availableHeight = pageHeight - (inset * 2);
          if (availableWidth <= 0 || availableHeight <= 0) {
            throw new Error("The selected margins leave no printable area. Reduce the margin and try again.");
          }
          const scale = Math.min(availableWidth / embedded.width, availableHeight / embedded.height);
          const width = embedded.width * scale;
          const height = embedded.height * scale;
          const page = pdf.addPage([pageWidth, pageHeight]);
          page.drawImage(embedded, {
            x: inset + (availableWidth - width) / 2,
            y: inset + (availableHeight - height) / 2,
            width, height,
          });
        }
        const bytes = await pdf.save();
        result.push({
          name: "sajilopdf-images.pdf",
          blob: new Blob([bytes as BlobPart], { type: "application/pdf" }),
          size: bytes.byteLength,
          pages: files.length,
        });
        setSuccess("Your PDF is ready. Each image is a page, in the order shown.");
      } else {
        for (const file of files) {
          const imageKey = fileKey(file);
          const rendered = await renderImage(file, rotations[imageKey] ?? 0);
          const embedded = await PDFDocument.create();
          const image = await embedded.embedJpg(rendered.bytes);
          const mmToPt = 72 / 25.4;
          const [pageWidth, pageHeight] = buildPageSize(pageSize, orientation, rendered.width, rendered.height, marginMm);
          const inset = marginMm * mmToPt;
          const availableWidth = pageWidth - (inset * 2);
          const availableHeight = pageHeight - (inset * 2);
          if (availableWidth <= 0 || availableHeight <= 0) throw new Error("The selected margins leave no printable area. Reduce the margin and try again.");
          const scale = Math.min(availableWidth / image.width, availableHeight / image.height);
          const width = image.width * scale;
          const height = image.height * scale;
          const page = embedded.addPage([pageWidth, pageHeight]);
          page.drawImage(image, { x: inset + (availableWidth - width) / 2, y: inset + (availableHeight - height) / 2, width, height });
          const bytes = await embedded.save();
          const base = file.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9-_]+/g, "-").replace(/^-+|-+$/g, "") || "image";
          result.push({
            name: base + ".pdf",
            blob: new Blob([bytes as BlobPart], { type: "application/pdf" }),
            size: bytes.byteLength,
            pages: 1,
          });
        }
        setSuccess("Created " + result.length + " PDF " + (result.length === 1 ? "file." : "files.") + " Download any file below.");
      }
      setOutputs(result);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Something went wrong while creating your PDF.";
      setError(message.length > 450 ? message.slice(0, 450) : message);
    } finally {
      setBusy(false);
    }
  }

  const step = files.length === 0 ? 1 : outputs.length ? 3 : 2;

  return (
    <div className={"sajilo-studio" + (files.length ? " has-images" : " is-empty")}>
      <section className="studio-hero">
        <div className="studio-hero-copy">
          <div className="studio-eyebrow"><span className="studio-eyebrow-mark"><Sparkles size={13}/></span> SAJILOPDF <span className="studio-eyebrow-divider">/</span> IMAGE STUDIO</div>
          <h1>{files.length ? <>Your images,<br/><em>your page rules.</em></> : <>Your images.<br/><em>One tidy PDF.</em></>}</h1>
          <p>{files.length
            ? "Arrange the image order, set your paper and margins, then export a PDF made to your specifications."
            : "A thoughtful little workspace for turning photos and scans into one well-finished PDF. No account, no upload to a server."}</p>
          <div className="studio-trust-row">
            <span><ShieldCheck size={15}/> Stays on your device</span>
            <span><CheckCircle2 size={15}/> JPG · PNG · WebP</span>
          </div>
        </div>
        {!files.length && <div className="studio-hero-art" aria-hidden="true">
          <div className="studio-art-sun"/>
          <div className="studio-art-shadow-paper"/>
          <div className="studio-art-paper studio-art-paper-back"><span/><span/><span/></div>
          <div className="studio-art-paper studio-art-paper-front">
            <div className="studio-art-photo"><i/><i/><i/></div>
            <div className="studio-art-line studio-art-line-long"/>
            <div className="studio-art-line"/>
            <div className="studio-art-line studio-art-line-short"/>
            <div className="studio-art-seal"><FileText size={19}/><b>PDF</b></div>
          </div>
          <div className="studio-art-note"><span className="studio-art-note-dot"/><span><strong>Made locally</strong><small>Private by design</small></span></div>
          <div className="studio-art-number">01 <span>/</span> 03</div>
        </div>}
      </section>

      <nav className="studio-steps" aria-label="Conversion progress">
        <div className={step >= 1 ? "studio-step is-current" : "studio-step"}><span className="studio-step-index">{files.length ? <Check size={15}/> : "01"}</span><span><strong>Add images</strong><small>Start your stack</small></span></div>
        <span className="studio-step-connector"/>
        <div className={step === 2 ? "studio-step is-current" : step > 2 ? "studio-step is-done" : "studio-step"}><span className="studio-step-index">{step > 2 ? <Check size={15}/> : "02"}</span><span><strong>Set your page</strong><small>Size, margin, angle</small></span></div>
        <span className="studio-step-connector"/>
        <div className={step === 3 ? "studio-step is-current" : "studio-step"}><span className="studio-step-index">{step > 2 ? <Check size={15}/> : "03"}</span><span><strong>Export PDF</strong><small>Download your file</small></span></div>
      </nav>

      {!files.length ? (
        <section className={"studio-upload-card" + (dragging ? " is-dragging" : "")}
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
          onDrop={(event) => { event.preventDefault(); setDragging(false); addImages(event.dataTransfer.files); }}>
          <div className="studio-upload-heading"><span className="studio-section-index">01 / GET STARTED</span><span className="studio-upload-limit">Up to 50 MB per image</span></div>
          <div className="studio-drop-content">
            <div className="studio-upload-glyph"><UploadCloud size={31}/><span><Plus size={14}/></span></div>
            <h2>Drop your images into the studio</h2>
            <p>Keep your original image order, or add more as you go.</p>
            <button type="button" className="studio-button studio-button-primary" onClick={() => inputRef.current?.click()}><ImagePlus size={18}/> Choose images <ArrowRight size={17}/></button>
            <div className="studio-file-types"><span>JPG</span><span>PNG</span><span>WEBP</span><i/> <small>Up to 80 images</small></div>
          </div>
          <div className="studio-upload-bottom"><span><LockKeyhole size={15}/> Your files never leave this browser</span><span>Drag &amp; drop supported</span></div>
          <input ref={inputRef} className="studio-visually-hidden" type="file" multiple accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" onChange={(event) => { if (event.target.files?.length) addImages(event.target.files); event.target.value = ""; }}/>
        </section>
      ) : (
        <section className="studio-editor">
          <div className="studio-canvas-column">
            <div className="studio-canvas-head">
              <div><span className="studio-section-index">02 / YOUR IMAGE STACK</span><h2>Arrange your pages</h2><p>Change each image’s angle or move it into the right order.</p></div>
              <div className="studio-stack-count"><strong>{files.length.toString().padStart(2, "0")}</strong><span>{files.length === 1 ? "image" : "images"}</span><i/></div>
            </div>
            <div className="studio-image-grid">
              {previewItems.map((preview, index) => {
                const rotation = rotations[preview.key] ?? 0;
                const quarterTurn = rotation === 90 || rotation === 270;
                const dims = dimensions[preview.key];
                return (
                  <article className="studio-image-card" key={preview.key}>
                    <div className="studio-image-card-top"><span className="studio-page-number">{String(index + 1).padStart(2, "0")}</span><span className="studio-image-card-label">{rotation === 0 ? "Original angle" : rotation + "° clockwise"}</span><button type="button" className="studio-icon-button studio-remove-button" onClick={() => removeImage(index)} title={"Remove " + preview.file.name} aria-label={"Remove " + preview.file.name}><X size={17}/></button></div>
                    <div className="studio-thumbnail-stage">
                      <div className="studio-thumbnail-paper" style={{ aspectRatio: dims ? (quarterTurn ? dims.height + " / " + dims.width : dims.width + " / " + dims.height) : "4 / 3" }}>
                        <img src={preview.url} alt={"Preview of " + preview.file.name} className={quarterTurn ? "is-quarter-turned" : ""} onLoad={(event) => { const image = event.currentTarget; setDimensions((current) => ({ ...current, [preview.key]: { width: image.naturalWidth, height: image.naturalHeight } })); }} style={{ transform: "rotate(" + rotation + "deg)" }}/>
                      </div>
                    </div>
                    <div className="studio-image-meta"><strong title={preview.file.name}>{preview.file.name}</strong><span>{formatSize(preview.file.size)}</span></div>
                    <div className="studio-image-controls">
                      <label className="studio-rotation-picker"><RotateCw size={15}/><span>Rotate</span><select value={rotation} aria-label={"Clockwise rotation for " + preview.file.name} onChange={(event) => setImageRotation(preview.file, Number(event.target.value))}><option value={0}>0°</option><option value={90}>90°</option><option value={180}>180°</option><option value={270}>270°</option></select><ChevronDown size={13}/></label>
                      <div className="studio-order-controls"><button type="button" className="studio-icon-button" disabled={index === 0} onClick={() => moveImage(index, -1)} title="Move image up" aria-label={"Move " + preview.file.name + " up"}><ArrowUp size={15}/></button><button type="button" className="studio-icon-button" disabled={index === files.length - 1} onClick={() => moveImage(index, 1)} title="Move image down" aria-label={"Move " + preview.file.name + " down"}><ArrowDown size={15}/></button></div>
                    </div>
                  </article>
                );
              })}
              <button type="button" className="studio-add-more-card" onClick={() => inputRef.current?.click()}><span><Plus size={22}/></span><strong>Add more images</strong><small>JPG, PNG or WebP</small></button>
            </div>
            <div className="studio-canvas-foot"><span><FileImage size={16}/>{files.length} image {files.length === 1 ? "selected" : "selected"} · {formatSize(selectedBytes)}</span><button type="button" className="studio-text-button" onClick={() => { setFiles([]); setRotations({}); setDimensions({}); setOutputs([]); setSuccess(""); setError(""); }}><Trash2 size={15}/> Clear all</button></div>
            <input ref={inputRef} className="studio-visually-hidden" type="file" multiple accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" onChange={(event) => { if (event.target.files?.length) addImages(event.target.files); event.target.value = ""; }}/>
          </div>

          <aside className="studio-settings">
            <div className="studio-settings-title"><span className="studio-section-index">PAGE SETTINGS</span><h2>Make it yours.</h2><p>These settings are applied to every page in the exported PDF.</p></div>
            <div className="studio-setting-block">
              <div className="studio-setting-label"><label htmlFor="studio-paper-size">Paper size</label><span>01</span></div>
              <select className="studio-select" id="studio-paper-size" value={pageSize} onChange={(event) => { setPageSize(event.target.value as PaperSize); clearResult(); }}>
                <option value="fit">Fit to image</option><option value="a3">A3 · 297 × 420 mm</option><option value="a4">A4 · 210 × 297 mm</option><option value="a5">A5 · 148 × 210 mm</option><option value="letter">US Letter · 215.9 × 279.4 mm</option><option value="legal">US Legal · 215.9 × 355.6 mm</option>
              </select>
            </div>
            <div className="studio-setting-block">
              <div className="studio-setting-label"><span>Orientation</span><span>02</span></div>
              <div className="studio-orientation" role="group" aria-label="Page orientation">
                <button type="button" className={orientation === "portrait" ? "is-selected" : ""} aria-pressed={orientation === "portrait"} onClick={() => { setOrientation("portrait"); clearResult(); }}><span className="studio-orientation-paper is-portrait"/><span>Portrait</span></button>
                <button type="button" className={orientation === "landscape" ? "is-selected" : ""} aria-pressed={orientation === "landscape"} onClick={() => { setOrientation("landscape"); clearResult(); }}><span className="studio-orientation-paper is-landscape"/><span>Landscape</span></button>
              </div>
            </div>
            <div className="studio-setting-block">
              <div className="studio-setting-label"><label htmlFor="studio-margin">Page margin</label><span>03</span></div>
              <div className="studio-margin-value"><strong>{marginMm} <small>mm</small></strong><span>Each edge</span></div>
              <input className="studio-margin-range" id="studio-margin" type="range" min={0} max={30} step={1} value={marginMm} aria-valuetext={marginMm + " millimeters on each edge"} onChange={(event) => { setMarginMm(Number(event.target.value)); clearResult(); }}/>
              <div className="studio-margin-presets">{[0, 5, 10, 15, 20, 25, 30].map((value) => <button type="button" key={value} className={marginMm === value ? "is-selected" : ""} aria-pressed={marginMm === value} onClick={() => { setMarginMm(value); clearResult(); }}>{value}</button>)}</div>
              <p className="studio-setting-helper">The exact margin is used on all four sides of every page.</p>
            </div>

            <div className="studio-page-preview">
              <div className="studio-paper-visual-wrap"><div className="studio-paper-visual" style={{ aspectRatio: Math.max(0.44, Math.min(1.72, currentPaper.ratio)) + " / 1" }}><span style={{ inset: Math.min(38, (marginMm / Math.max(1, currentPaper.heightMm)) * 100) + "% " + Math.min(38, (marginMm / Math.max(1, currentPaper.widthMm)) * 100) + "%" }}/></div></div>
              <div className="studio-paper-detail"><strong>{PAPER_LABEL[pageSize]}</strong><span>{orientation} · {marginMm} mm margin</span><small>{currentPaper.widthMm.toFixed(1)} × {currentPaper.heightMm.toFixed(1)} mm</small></div>
            </div>

            <div className="studio-merge-option"><label htmlFor="studio-merge"><span className="studio-merge-icon"><FileText size={17}/></span><span><strong>Combine into one PDF</strong><small>{mergeImages ? "All pages in one file" : "One PDF per image"}</small></span></label><button type="button" className={"studio-switch" + (mergeImages ? " is-on" : "")} role="switch" aria-checked={mergeImages} aria-label="Combine images into one PDF" onClick={() => { setMergeImages((current) => !current); clearResult(); }}><span/></button><input id="studio-merge" className="studio-visually-hidden" type="checkbox" checked={mergeImages} onChange={(event) => { setMergeImages(event.target.checked); clearResult(); }}/></div>

            {error && <div className="studio-alert studio-alert-error" role="alert"><X size={17}/><span>{error}</span></div>}
            {success && outputs.length === 0 && <div className="studio-alert studio-alert-success" role="status"><CheckCircle2 size={17}/><span>{success}</span></div>}
            <div className="studio-export-block">
              <div className="studio-export-note"><ShieldCheck size={15}/><span>Private, local conversion</span></div>
              <button type="button" className="studio-export-button" onClick={convertImages} disabled={busy || files.length === 0}>{busy ? <><LoaderCircle size={18} className="studio-spin"/> Preparing PDF…</> : <>Create PDF <ArrowRight size={18}/></>}</button>
              <small>No watermarks. No account. Just your file.</small>
            </div>
          </aside>

          {outputs.length > 0 && <section className="studio-results" aria-live="polite"><div className="studio-results-icon"><Check size={23}/></div><div className="studio-results-copy"><span className="studio-section-index">READY TO SAVE</span><h2>Your PDF is finished.</h2><p>{success || "Your file is ready to download."}</p><div className="studio-output-list">{outputs.map((output) => <div className="studio-output-row" key={output.name}><span className="studio-output-file-icon"><FileText size={20}/></span><span className="studio-output-details"><strong>{output.name}</strong><small>{output.pages} {output.pages === 1 ? "page" : "pages"} · {formatSize(output.size)}</small></span><button type="button" className="studio-download-button" onClick={() => downloadOutput(output)}><Download size={16}/> Download</button></div>)}</div></div></section>}
        </section>
      )}

      {error && !files.length && <div className="studio-global-error" role="alert"><X size={17}/><span>{error}</span></div>}
      <footer className="studio-footer-note"><span><LockKeyhole size={15}/> Files are processed locally in your browser.</span><span>Sajilo means simple. Your workflow should, too.</span></footer>
    </div>
  );
}
