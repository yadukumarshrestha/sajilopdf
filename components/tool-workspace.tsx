"use client";
import { useCallback, useRef, useState } from "react";
import { Download, FileText, Image as ImageIcon, LoaderCircle, Plus, ShieldCheck, Trash2, UploadCloud, X, CheckCircle2, AlertCircle, GripVertical, ArrowDown, FileArchive } from "lucide-react";
import { PDFDocument, degrees, StandardFonts, rgb } from "pdf-lib";
import JSZip from "jszip";
import type { Tool } from "@/lib/tools";
import { formatBytes } from "@/lib/format";

type OutputFile = { name: string; blob: Blob; size: number };
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const isImage = (file: File) => ["image/jpeg", "image/png", "image/webp"].includes(file.type) || /\.(png|jpe?g|webp)$/i.test(file.name);
const isPdf = (file: File) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

function parsePageNumbers(input: string, max: number): number[] {
  const numbers = input.split(",").map((part) => Number(part.trim())).filter((value) => Number.isInteger(value) && value >= 1 && value <= max);
  return [...new Set(numbers)].sort((a, b) => a - b);
}
function parseRanges(input: string, max: number): number[][] {
  return input.split(",").map((part) => part.trim()).filter(Boolean).map((part) => {
    const match = part.match(/^(\d+)\s*(?:-\s*(\d+))?$/);
    if (!match) throw new Error(`Invalid page range: “${part}”. Use a format like 1-3,5.`);
    const start = Number(match[1]); const end = Number(match[2] ?? match[1]);
    if (start < 1 || end < start || end > max) throw new Error(`Page range “${part}” is outside this PDF's 1–${max} page range.`);
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  });
}
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; document.body.appendChild(anchor); anchor.click(); anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}
function safeBase(name: string) { return name.replace(/\.pdf$/i, "").replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "") || "document"; }

export function ToolWorkspace({ tool }: { tool: Tool }) {
  const [files, setFiles] = useState<File[]>([]); const [dragging, setDragging] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [success, setSuccess] = useState(""); const [pageCount, setPageCount] = useState<number | null>(null);
  const [pageInput, setPageInput] = useState("1-3"); const [angle, setAngle] = useState("90"); const [outputs, setOutputs] = useState<OutputFile[]>([]); const inputRef = useRef<HTMLInputElement>(null);
  const needsMultiple = tool.slug === "merge-pdf" || tool.slug === "images-to-pdf";
  const accept = tool.slug === "images-to-pdf" ? "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" : ".pdf,application/pdf";
  const addFiles = useCallback((incoming: FileList | File[]) => {
    setError(""); setSuccess(""); setOutputs([]);
    const list = Array.from(incoming); const good: File[] = [];
    for (const file of list) {
      if (file.size > MAX_FILE_BYTES) { setError(`${file.name} is larger than the 50 MB per-file limit.`); continue; }
      if (tool.slug === "images-to-pdf" ? !isImage(file) : !isPdf(file)) { setError(`${file.name} is not a supported ${tool.slug === "images-to-pdf" ? "image" : "PDF"} file.`); continue; }
      good.push(file);
    }
    setFiles((current) => {
      const next = needsMultiple ? [...current, ...good].filter((file, index, arr) => arr.findIndex((candidate) => candidate.name === file.name && candidate.size === file.size && candidate.lastModified === file.lastModified) === index) : good.slice(0, 1);
      return next;
    });
    setPageCount(null);
  }, [tool.slug, needsMultiple]);
  const removeFile = (idx: number) => { setFiles((current) => current.filter((_, i) => i !== idx)); setError(""); setSuccess(""); setOutputs([]); setPageCount(null); };
  async function imageToJpegBytes(file: File): Promise<Uint8Array> {
    const url = URL.createObjectURL(file);
    try {
      const image = new Image(); image.src = url;
      await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error(`Could not open image ${file.name}.`)); });
      const canvas = document.createElement("canvas"); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d"); if (!context) throw new Error("Your browser could not prepare this image.");
      context.fillStyle = "#ffffff"; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error(`Could not convert ${file.name}.`)), "image/jpeg", 0.92));
      return new Uint8Array(await blob.arrayBuffer());
    } finally { URL.revokeObjectURL(url); }
  }
  async function makeOutput() {
    setError(""); setSuccess(""); setOutputs([]);
    if (!files.length) { setError("Choose a file first to continue."); return; }
    if (tool.slug === "merge-pdf" && files.length < 2) { setError("Add at least two PDF files to merge."); return; }
    setBusy(true);
    try {
      const resultFiles: OutputFile[] = [];
      if (tool.slug === "images-to-pdf") {
        const pdf = await PDFDocument.create();
        for (const file of files) {
          const bytes = await imageToJpegBytes(file); const image = await pdf.embedJpg(bytes); const pageWidth = 595.28; const pageHeight = 841.89; const scale = Math.min(pageWidth / image.width, pageHeight / image.height); const width = image.width * scale; const height = image.height * scale;
          const page = pdf.addPage([pageWidth, pageHeight]); page.drawImage(image, { x: (pageWidth - width) / 2, y: (pageHeight - height) / 2, width, height });
        }
        const bytes = await pdf.save(); resultFiles.push({ name: "images-combined.pdf", blob: new Blob([bytes as BlobPart], { type: "application/pdf" }), size: bytes.byteLength });
      } else if (tool.slug === "merge-pdf") {
        const merged = await PDFDocument.create();
        for (const file of files) { const source = await PDFDocument.load(await file.arrayBuffer()); const pages = await merged.copyPages(source, source.getPageIndices()); pages.forEach((page) => merged.addPage(page)); }
        const bytes = await merged.save(); resultFiles.push({ name: "merged.pdf", blob: new Blob([bytes as BlobPart], { type: "application/pdf" }), size: bytes.byteLength });
      } else {
        const file = files[0]; const pdf = await PDFDocument.load(await file.arrayBuffer()); const total = pdf.getPageCount(); setPageCount(total);
        if (tool.slug === "rotate-pdf") {
          const rotation = Number(angle); pdf.getPages().forEach((page) => page.setRotation(degrees((page.getRotation().angle + rotation) % 360)));
          const bytes = await pdf.save(); resultFiles.push({ name: `${safeBase(file.name)}-rotated.pdf`, blob: new Blob([bytes as BlobPart], { type: "application/pdf" }), size: bytes.byteLength });
        } else if (tool.slug === "remove-pages") {
          const numbers = parsePageNumbers(pageInput, total); if (!numbers.length) throw new Error(`Enter page numbers from 1 to ${total}, separated by commas.`); if (numbers.length === total) throw new Error("You cannot remove every page. Keep at least one page in the PDF.");
          numbers.sort((a, b) => b - a).forEach((page) => pdf.removePage(page - 1)); const bytes = await pdf.save(); resultFiles.push({ name: `${safeBase(file.name)}-pages-removed.pdf`, blob: new Blob([bytes as BlobPart], { type: "application/pdf" }), size: bytes.byteLength });
        } else if (tool.slug === "extract-pages") {
          const numbers = parsePageNumbers(pageInput, total); if (!numbers.length) throw new Error(`Enter page numbers from 1 to ${total}, separated by commas.`);
          const extracted = await PDFDocument.create(); const pages = await extracted.copyPages(pdf, numbers.map((page) => page - 1)); pages.forEach((page) => extracted.addPage(page)); const bytes = await extracted.save(); resultFiles.push({ name: `${safeBase(file.name)}-extracted.pdf`, blob: new Blob([bytes as BlobPart], { type: "application/pdf" }), size: bytes.byteLength });
        } else if (tool.slug === "split-pdf") {
          const groups = parseRanges(pageInput, total); if (!groups.length) throw new Error("Enter one or more page ranges, such as 1-3,4-6.");
          const zip = new JSZip();
          for (let i = 0; i < groups.length; i += 1) { const segment = await PDFDocument.create(); const pages = await segment.copyPages(pdf, groups[i].map((page) => page - 1)); pages.forEach((page) => segment.addPage(page)); zip.file(`${safeBase(file.name)}-part-${i + 1}.pdf`, await segment.save()); }
          const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" }); resultFiles.push({ name: `${safeBase(file.name)}-split.zip`, blob, size: blob.size });
        } else if (tool.slug === "page-numbers") {
          const font = await pdf.embedFont(StandardFonts.Helvetica); const pages = pdf.getPages(); pages.forEach((page, index) => { const { width } = page.getSize(); const text = String(index + 1); const size = 10; page.drawText(text, { x: (width - font.widthOfTextAtSize(text, size)) / 2, y: 18, size, font, color: rgb(0.34, 0.37, 0.45) }); });
          const bytes = await pdf.save(); resultFiles.push({ name: `${safeBase(file.name)}-numbered.pdf`, blob: new Blob([bytes as BlobPart], { type: "application/pdf" }), size: bytes.byteLength });
        }
      }
      setOutputs(resultFiles); setSuccess("Your file is ready to download.");
    } catch (unknownError) { setError(unknownError instanceof Error ? unknownError.message : "Something went wrong while processing the file. Please try another file."); }
    finally { setBusy(false); }
  }
  return <div className="tool-workspace">
    <div className="workspace-card"><div className="workspace-card-top"><div><h2>{tool.slug === "merge-pdf" ? "Add PDFs to merge" : tool.slug === "images-to-pdf" ? "Add your images" : "Upload your PDF"}</h2><p>{tool.slug === "merge-pdf" ? "Files will be combined in the order shown below." : tool.slug === "images-to-pdf" ? "Images are placed on A4 pages and combined into one PDF." : "Your file is processed in this browser—no account needed."}</p></div><span className="local-badge"><ShieldCheck size={14}/> Local processing</span></div>
      <div className={`dropzone ${dragging ? "dropzone-active" : ""} ${files.length ? "dropzone-compact" : ""}`} onDragOver={(event) => {event.preventDefault();setDragging(true);}} onDragLeave={() => setDragging(false)} onDrop={(event) => {event.preventDefault();setDragging(false);addFiles(event.dataTransfer.files);}}>
        {files.length === 0 ? <><span className="upload-symbol"><UploadCloud size={29}/></span><h3>Drop files here</h3><p>or choose files from your device</p><button type="button" className="button button-primary" onClick={() => inputRef.current?.click()}><Plus size={17}/> Choose {tool.slug === "images-to-pdf" ? "images" : "PDF files"}</button><span className="upload-limit">{tool.slug === "images-to-pdf" ? "JPG, PNG, WebP" : "PDF documents"} · Up to 50 MB per file</span></> : <><span className="upload-symbol upload-symbol-small"><CheckCircle2 size={23}/></span><h3>{files.length} {files.length === 1 ? "file" : "files"} selected</h3><p>Drop more files here or use the button below.</p><button type="button" className="button button-secondary button-small" onClick={() => inputRef.current?.click()}><Plus size={16}/> Add files</button></>}
        <input ref={inputRef} className="visually-hidden" type="file" accept={accept} multiple={needsMultiple} onChange={(event) => {if (event.target.files?.length) addFiles(event.target.files);event.target.value = "";}}/>
      </div>
      {files.length > 0 && <div className="selected-files"><div className="selected-files-heading"><strong>Selected files</strong><span>{files.length} {files.length === 1 ? "file" : "files"}</span></div>{files.map((file, index) => <div className="file-row" key={`${file.name}-${file.lastModified}-${index}`}><span className="file-type-icon">{isImage(file) ? <ImageIcon size={19}/> : <FileText size={19}/>}</span><div className="file-details"><strong>{file.name}</strong><span>{formatBytes(file.size)}{index === 0 && pageCount ? ` · ${pageCount} pages` : ""}</span></div>{tool.slug === "merge-pdf" && <span className="file-position" title="File order">{index + 1}<GripVertical size={14}/></span>}<button type="button" className="icon-button" aria-label={`Remove ${file.name}`} onClick={() => removeFile(index)}><X size={17}/></button></div>)}</div>}
      {(tool.slug === "split-pdf" || tool.slug === "extract-pages" || tool.slug === "remove-pages") && <div className="settings-panel"><label htmlFor="page-range">{tool.slug === "split-pdf" ? "Page ranges" : "Page numbers"}<span className="settings-hint">{tool.slug === "split-pdf" ? "Example: 1-3, 4-6, 7" : "Example: 1, 3, 5"}</span></label><input id="page-range" type="text" value={pageInput} onChange={(event) => setPageInput(event.target.value)} placeholder={tool.slug === "split-pdf" ? "1-3, 4-6" : "1, 3, 5"}/><p>{tool.slug === "split-pdf" ? "Each range becomes a separate PDF inside a ZIP file." : tool.slug === "extract-pages" ? "Selected pages stay in the same order as the original." : "Every listed page will be removed from the PDF."}</p></div>}
      {tool.slug === "rotate-pdf" && <div className="settings-panel"><span className="settings-label">Rotation angle</span><div className="angle-options">{["90", "180", "270"].map((value) => <button type="button" key={value} onClick={() => setAngle(value)} className={`angle-option ${angle === value ? "angle-option-active" : ""}`}>{value}°</button>)}</div><p>Rotate every page clockwise by the selected angle.</p></div>}
      {error && <div className="alert alert-error" role="alert"><AlertCircle size={18}/><span>{error}</span></div>}{success && <div className="alert alert-success" role="status"><CheckCircle2 size={18}/><span>{success}</span></div>}
      <div className="process-row"><div className="process-assurance"><ShieldCheck size={17}/><span>Files stay on this device</span></div><button type="button" className="button button-primary process-button" onClick={makeOutput} disabled={busy || files.length === 0}>{busy ? <><LoaderCircle size={18} className="spin"/> Working...</> : <>Process {tool.name} <ArrowDown size={17}/></>}</button></div>
      {outputs.length > 0 && <div className="output-card"><div className="output-icon"><CheckCircle2 size={23}/></div><div className="output-main"><h3>All done!</h3><p>Your processed file is ready.</p>{outputs.map((output) => <div className="output-file" key={output.name}><span className="output-file-icon">{output.name.endsWith(".zip") ? <FileArchive size={20}/> : <FileText size={20}/>}</span><span className="output-file-name"><strong>{output.name}</strong><small>{formatBytes(output.size)}</small></span><button className="button button-primary button-small" type="button" onClick={() => downloadBlob(output.blob, output.name)}><Download size={16}/> Download</button></div>)}</div></div>}
      <p className="file-note">For the best experience, use a modern browser and keep this tab open until processing finishes. Files over 50 MB per file are not accepted in this starter version.</p>
    </div>
  </div>;
}
