"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import {
  Download, FileText, Image as ImageIcon, LoaderCircle, Plus, ShieldCheck,
  Trash2, UploadCloud, X, CheckCircle2, AlertCircle, GripVertical, ArrowDown, ArrowRight, RotateCw, RectangleVertical, RectangleHorizontal,
  FileArchive, LockKeyhole, Type, Stamp, Crop, FileSpreadsheet, Presentation,
  ScanText
} from "lucide-react";
import { PDFDocument, degrees, StandardFonts, rgb } from "pdf-lib";
import JSZip from "jszip";
import type { Tool } from "@/lib/tools";
import { ImageToPdfStudio } from "@/components/image-to-pdf-studio";
import { formatBytes } from "@/lib/format";

type OutputFile = { name: string; blob: Blob; size: number };
type PdfTextPage = { lines: string[]; width?: number; height?: number };
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MAX_RENDER_PAGES = 35;
const MAX_OCR_PAGES = 15;
const isImage = (file: File) => ["image/jpeg", "image/png", "image/webp"].includes(file.type) || /\.(png|jpe?g|webp)$/i.test(file.name);
const isPdf = (file: File) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
const isDocx = (file: File) => /\.docx$/i.test(file.name) || file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const isXlsx = (file: File) => /\.xlsx$/i.test(file.name) || file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const isPptx = (file: File) => /\.pptx$/i.test(file.name) || file.type === "application/vnd.openxmlformats-officedocument.presentationml.presentation";

function parsePageNumbers(input: string, max: number): number[] {
  const parts = input.split(",").map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return [];
  const numbers: number[] = [];
  for (const part of parts) {
    if (!/^\d+$/.test(part)) throw new Error("Use page numbers separated by commas, for example 1, 3, 5.");
    const value = Number(part);
    if (value < 1 || value > max) throw new Error("Page " + value + " is outside this PDF's 1–" + max + " page range.");
    numbers.push(value);
  }
  return [...new Set(numbers)].sort((a, b) => a - b);
}
function parseRanges(input: string, max: number): number[][] {
  return input.split(",").map((part) => part.trim()).filter(Boolean).map((part) => {
    const match = part.match(/^(\d+)\s*(?:-\s*(\d+))?$/);
    if (!match) throw new Error("Invalid page range: “" + part + "”. Use a format like 1-3,5.");
    const start = Number(match[1]); const end = Number(match[2] ?? match[1]);
    if (start < 1 || end < start || end > max) throw new Error("Page range “" + part + "” is outside this PDF's 1–" + max + " page range.");
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  });
}
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename;
  document.body.appendChild(anchor); anchor.click(); anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}
function safeBase(name: string) { return name.replace(/\.[^.]+$/, "").replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "") || "document"; }
function imageFileKey(file: File) { return file.name + "::" + file.size + "::" + file.lastModified; }
async function canvasBlob(canvas: HTMLCanvasElement, type = "image/png"): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("The browser could not export this page image.")), type, 0.94));
}
async function getPdfJs() {
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
  return pdfjs;
}
async function extractPdfText(file: File): Promise<PdfTextPage[]> {
  const pdfjs = await getPdfJs();
  const loading = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), useSystemFonts: true });
  const doc = await loading.promise;
  try {
    const pages: PdfTextPage[] = [];
    for (let pageNo = 1; pageNo <= doc.numPages; pageNo += 1) {
      const page = await doc.getPage(pageNo);
      const result = await page.getTextContent();
      const items = (result.items as any[]).filter((item) => typeof item.str === "string" && item.str.trim());
      const rows: { y: number; pieces: { x: number; text: string }[] }[] = [];
      for (const item of items) {
        const x = Number(item.transform?.[4] ?? 0);
        const y = Number(item.transform?.[5] ?? 0);
        let row = rows.find((candidate) => Math.abs(candidate.y - y) < 3);
        if (!row) { row = { y, pieces: [] }; rows.push(row); }
        row.pieces.push({ x, text: item.str });
      }
      rows.sort((a, b) => b.y - a.y);
      const lines = rows.map((row) => row.pieces.sort((a, b) => a.x - b.x).map((piece) => piece.text).join(" ").replace(/\s+/g, " ").trim()).filter(Boolean);
      pages.push({ lines });
    }
    return pages;
  } finally {
    await doc.destroy();
  }
}
async function readDocxParagraphs(file: File): Promise<string[]> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const entry = zip.file("word/document.xml");
  if (!entry) throw new Error("This DOCX file does not contain a readable Word document.");
  const xml = new DOMParser().parseFromString(await entry.async("text"), "application/xml");
  if (xml.querySelector("parsererror")) throw new Error("The Word document XML is invalid or damaged.");
  const paragraphs = Array.from(xml.getElementsByTagNameNS("*", "p")).map((paragraph) =>
    Array.from(paragraph.getElementsByTagNameNS("*", "t")).map((node) => node.textContent ?? "").join("")
  );
  const output = paragraphs.map((value) => value.trimEnd()).filter((value, index) => value || index === 0);
  if (!output.some((value) => value.trim())) throw new Error("No readable text was found in this DOCX file.");
  return output;
}
function columnIndex(ref: string): number {
  const letters = (ref.match(/^[A-Z]+/i)?.[0] ?? "A").toUpperCase();
  let result = 0;
  for (const letter of letters) result = result * 26 + letter.charCodeAt(0) - 64;
  return result - 1;
}
async function readXlsxRows(file: File): Promise<{ title: string; lines: string[] }[]> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const sharedEntry = zip.file("xl/sharedStrings.xml");
  const shared: string[] = [];
  if (sharedEntry) {
    const sharedXml = new DOMParser().parseFromString(await sharedEntry.async("text"), "application/xml");
    Array.from(sharedXml.getElementsByTagNameNS("*", "si")).forEach((entry) => {
      shared.push(Array.from(entry.getElementsByTagNameNS("*", "t")).map((node) => node.textContent ?? "").join(""));
    });
  }
  const sheetFiles = Object.keys(zip.files).filter((path) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(path)).sort((a, b) => Number(a.match(/sheet(\d+)/i)?.[1]) - Number(b.match(/sheet(\d+)/i)?.[1]));
  if (!sheetFiles.length) throw new Error("No worksheets were found. Upload a valid .xlsx workbook.");
  const sheets: { title: string; lines: string[] }[] = [];
  for (let i = 0; i < sheetFiles.length; i += 1) {
    const entry = zip.file(sheetFiles[i]);
    if (!entry) continue;
    const xml = new DOMParser().parseFromString(await entry.async("text"), "application/xml");
    const rows = Array.from(xml.getElementsByTagNameNS("*", "row"));
    const lines = rows.map((row) => {
      const cells = Array.from(row.getElementsByTagNameNS("*", "c")).map((cell) => {
        const type = cell.getAttribute("t") ?? "";
        const ref = cell.getAttribute("r") ?? "A1";
        const valueNode = cell.getElementsByTagNameNS("*", "v")[0];
        let value = valueNode?.textContent ?? "";
        if (type === "s") value = shared[Number(value)] ?? value;
        if (type === "inlineStr") value = Array.from(cell.getElementsByTagNameNS("*", "t")).map((node) => node.textContent ?? "").join("");
        return { column: columnIndex(ref), value: value.trim() };
      }).filter((cell) => cell.value);
      cells.sort((a, b) => a.column - b.column);
      return cells.map((cell) => String.fromCharCode(65 + (cell.column % 26)) + ": " + cell.value).join("  |  ");
    }).filter(Boolean);
    sheets.push({ title: "Worksheet " + (i + 1), lines });
  }
  if (!sheets.some((sheet) => sheet.lines.length)) throw new Error("No readable cell values were found in this workbook.");
  return sheets;
}
async function readPptxSlides(file: File): Promise<{ title: string; lines: string[] }[]> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const paths = Object.keys(zip.files).filter((path) => /^ppt\/slides\/slide\d+\.xml$/i.test(path)).sort((a, b) => Number(a.match(/slide(\d+)/i)?.[1]) - Number(b.match(/slide(\d+)/i)?.[1]));
  if (!paths.length) throw new Error("No readable slides were found. Upload a valid .pptx presentation.");
  const slides: { title: string; lines: string[] }[] = [];
  for (let i = 0; i < paths.length; i += 1) {
    const entry = zip.file(paths[i]);
    if (!entry) continue;
    const xml = new DOMParser().parseFromString(await entry.async("text"), "application/xml");
    const paragraphs = Array.from(xml.getElementsByTagNameNS("*", "p")).map((paragraph) =>
      Array.from(paragraph.getElementsByTagNameNS("*", "t")).map((node) => node.textContent ?? "").join("").trim()
    ).filter(Boolean);
    slides.push({ title: "Slide " + (i + 1), lines: paragraphs });
  }
  return slides;
}
async function renderTextToPdf(sections: { title: string; lines: string[]; landscape?: boolean }[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  for (const section of sections) {
    const landscape = Boolean(section.landscape);
    const widthPt = landscape ? 842 : 595;
    const heightPt = landscape ? 595 : 842;
    const canvas = document.createElement("canvas");
    canvas.width = landscape ? 1684 : 1190;
    canvas.height = landscape ? 1190 : 1684;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Your browser does not support document conversion.");
    const margin = 92;
    const maxWidth = canvas.width - margin * 2;
    const lineHeight = landscape ? 34 : 38;
    let y = 105;
    const paintHeader = (continued: boolean) => {
      ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#22243a"; ctx.font = "bold 34px Arial, sans-serif";
      ctx.fillText((continued ? section.title + " (continued)" : section.title).slice(0, 72), margin, y = 100);
      ctx.strokeStyle = "#dadce8"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(margin, 126); ctx.lineTo(canvas.width - margin, 126); ctx.stroke();
      ctx.fillStyle = "#3a3a46"; ctx.font = "24px Arial, sans-serif"; y = 174;
    };
    paintHeader(false);
    const wrappedLines: string[] = [];
    for (const raw of section.lines) {
      const trimmed = raw.replace(/\s+/g, " ").trim();
      if (!trimmed) { wrappedLines.push(""); continue; }
      let current = "";
      for (const word of trimmed.split(" ")) {
        const candidate = current ? current + " " + word : word;
        if (current && ctx.measureText(candidate).width > maxWidth) { wrappedLines.push(current); current = word; }
        else current = candidate;
      }
      if (current) wrappedLines.push(current);
    }
    let continued = false;
    for (const line of wrappedLines) {
      if (y > canvas.height - 78) {
        const blob = await canvasBlob(canvas, "image/jpeg");
        const image = await pdf.embedJpg(new Uint8Array(await blob.arrayBuffer()));
        const page = pdf.addPage([widthPt, heightPt]); page.drawImage(image, { x: 0, y: 0, width: widthPt, height: heightPt });
        continued = true; paintHeader(continued);
      }
      if (line) ctx.fillText(line, margin, y, maxWidth);
      y += lineHeight;
    }
    const blob = await canvasBlob(canvas, "image/jpeg");
    const image = await pdf.embedJpg(new Uint8Array(await blob.arrayBuffer()));
    const page = pdf.addPage([widthPt, heightPt]); page.drawImage(image, { x: 0, y: 0, width: widthPt, height: heightPt });
  }
  return pdf.save();
}
async function runQpdf(file: File, argsForPaths: (inputPath: string, outputPath: string, data: Uint8Array) => string[]): Promise<Uint8Array> {
  const imported = await import("@neslinesli93/qpdf-wasm");
  const createModule = imported.default as (options: any) => Promise<any>;
  const qpdf: any = await createModule({
    locateFile: () => "https://cdn.jsdelivr.net/npm/@neslinesli93/qpdf-wasm@0.3.0/dist/qpdf.wasm",
    noInitialRun: true,
  });
  const inputPath = "/sajilopdf-input.pdf";
  const outputPath = "/sajilopdf-output.pdf";
  const data = new Uint8Array(await file.arrayBuffer());
  try {
    qpdf.FS.writeFile(inputPath, data);
    try {
      qpdf.callMain(argsForPaths(inputPath, outputPath, data));
    } catch (error) {
      const status = typeof error === "object" && error !== null && "status" in error ? Number((error as { status: unknown }).status) : undefined;
      const exists = qpdf.FS.analyzePath(outputPath).exists;
      if (!(exists && status === 0)) throw error;
    }
    const output = qpdf.FS.readFile(outputPath);
    if (!output || output.byteLength === 0) throw new Error("The PDF engine did not produce an output. The file may be encrypted, damaged beyond recovery or unsupported.");
    return new Uint8Array(output);
  } finally {
    try { qpdf.FS.unlink(inputPath); } catch { /* The virtual input may already be gone. */ }
    try { qpdf.FS.unlink(outputPath); } catch { /* The output may not have been created. */ }
  }
}
function extractiveSummary(pages: PdfTextPage[]): string {
  const fullText = pages.map((page) => page.lines.join(" ")).join("\n").replace(/\s+/g, " ").trim();
  if (!fullText) throw new Error("No selectable text was found. Run OCR PDF first for scanned documents.");
  const sentences = fullText.match(/[^.!?]+[.!?]?/g)?.map((sentence) => sentence.trim()).filter((sentence) => sentence.length > 24) ?? [];
  if (!sentences.length) return fullText.slice(0, 1400);
  const stop = new Set("the a an and or but if then than of to in on for with as by is are was were be been being it this that these those from at into about can may might will would should we you your their our they them he she his her not".split(" "));
  const frequency = new Map<string, number>();
  for (const word of fullText.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []) if (!stop.has(word)) frequency.set(word, (frequency.get(word) ?? 0) + 1);
  const scored = sentences.map((sentence, index) => {
    const words = sentence.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [];
    const score = words.reduce((sum, word) => sum + (stop.has(word) ? 0 : (frequency.get(word) ?? 0)), 0) / Math.max(1, Math.sqrt(words.length));
    return { sentence, index, score };
  });
  return scored.sort((a, b) => b.score - a.score).slice(0, Math.min(5, scored.length)).sort((a, b) => a.index - b.index).map((item) => "• " + item.sentence).join("\n");
}

function LegacyToolWorkspace({ tool }: { tool: Tool }) {
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [pageInput, setPageInput] = useState("1-3");
  const [angle, setAngle] = useState("90");
  const [customText, setCustomText] = useState("SajiloPDF");
  const [password, setPassword] = useState("");
  const [cropMargin, setCropMargin] = useState("24");
  const [targetPage, setTargetPage] = useState("all");
  const [position, setPosition] = useState("center");
  const [outputs, setOutputs] = useState<OutputFile[]>([]);
  const [imageOrientation, setImageOrientation] = useState<"portrait" | "landscape">("portrait");
  const [imagePageSize, setImagePageSize] = useState<"fit" | "a3" | "a4" | "a5" | "letter" | "legal">("a4");
  const [imageMargin, setImageMargin] = useState(10);
  const [imageDimensions, setImageDimensions] = useState<Record<string, { width: number; height: number }>>({});
  const [mergeImages, setMergeImages] = useState(true);
  const [imageRotations, setImageRotations] = useState<Record<string, number>>({});
  const [imagePreviews, setImagePreviews] = useState<{ key: string; file: File; url: string }[]>([]);
  const [signatureFile, setSignatureFile] = useState<File | null>(null);
  const [signatureUrl, setSignatureUrl] = useState("");
  const [signatureLeft, setSignatureLeft] = useState(0.58);
  const [signatureTop, setSignatureTop] = useState(0.82);
  const [signatureWidth, setSignatureWidth] = useState(0.25);
  const [signaturePage, setSignaturePage] = useState(1);
  const [signatureAspect, setSignatureAspect] = useState(0.28);
  const [previewStatus, setPreviewStatus] = useState("Upload a PDF to preview its page.");
  const inputRef = useRef<HTMLInputElement>(null);
  const signatureInputRef = useRef<HTMLInputElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const signaturePreviewRef = useRef<HTMLDivElement>(null);
  const signatureDragOffsetRef = useRef<{ x: number; y: number } | null>(null);

  const needsMultiple = tool.slug === "merge-pdf" || tool.slug === "images-to-pdf";
  const acceptedFormats = tool.slug === "images-to-pdf" ? "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
    : tool.slug === "word-to-pdf" ? ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    : tool.slug === "excel-to-pdf" ? ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    : tool.slug === "ppt-to-pdf" ? ".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
    : ".pdf,application/pdf";
  const expectedType = tool.slug === "images-to-pdf" ? "image" : tool.slug === "word-to-pdf" ? "DOCX" : tool.slug === "excel-to-pdf" ? "XLSX" : tool.slug === "ppt-to-pdf" ? "PPTX" : "PDF";
  const needsText = ["edit-pdf", "watermark-pdf"].includes(tool.slug);
  const addFiles = useCallback((incoming: FileList | File[]) => {
    setError(""); setSuccess(""); setOutputs([]);
    const list = Array.from(incoming); const good: File[] = [];
    for (const file of list) {
      if (file.size > MAX_FILE_BYTES) { setError(file.name + " is larger than the 50 MB per-file limit."); continue; }
      const valid = tool.slug === "images-to-pdf" ? isImage(file) : tool.slug === "word-to-pdf" ? isDocx(file) : tool.slug === "excel-to-pdf" ? isXlsx(file) : tool.slug === "ppt-to-pdf" ? isPptx(file) : isPdf(file);
      if (!valid) { setError(file.name + " is not a supported " + expectedType + " file. Please use the file type shown above."); continue; }
      good.push(file);
    }
    setFiles((current) => {
      const next = needsMultiple ? [...current, ...good].filter((file, index, arr) => arr.findIndex((candidate) => candidate.name === file.name && candidate.size === file.size && candidate.lastModified === file.lastModified) === index) : good.slice(0, 1);
      return next;
    });
    setPageCount(null);
  }, [tool.slug, needsMultiple, expectedType]);
  const removeFile = (idx: number) => {
    const removed = files[idx];
    if (removed && tool.slug === "images-to-pdf") {
      const key = imageFileKey(removed);
      setImageRotations((current) => { const next = { ...current }; delete next[key]; return next; });
      setImageDimensions((current) => { const next = { ...current }; delete next[key]; return next; });
    }
    setFiles((current) => current.filter((_, i) => i !== idx)); setError(""); setSuccess(""); setOutputs([]); setPageCount(null);
  };

  useEffect(() => {
    if (tool.slug !== "images-to-pdf") { setImagePreviews([]); return; }
    const previews = files.filter(isImage).map((file) => ({ key: imageFileKey(file), file, url: URL.createObjectURL(file) }));
    setImagePreviews(previews);
    return () => previews.forEach((preview) => URL.revokeObjectURL(preview.url));
  }, [tool.slug, files]);

  useEffect(() => {
    if (tool.slug !== "sign-pdf") return;
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    if (!files.length) {
      canvas.width = 0;
      canvas.height = 0;
      setPageCount(null);
      setPreviewStatus("Upload a PDF to preview its page.");
      return;
    }

    let cancelled = false;
    let documentProxy: any;
    let renderTask: any;
    setPreviewStatus("Rendering PDF preview…");
    (async () => {
      const pdfjs = await getPdfJs();
      if (cancelled) return;
      const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await files[0].arrayBuffer()) });
      documentProxy = await loadingTask.promise;
      if (cancelled) { await documentProxy.destroy(); return; }
      setPageCount(documentProxy.numPages);
      const pageNo = Math.max(1, Math.min(signaturePage, documentProxy.numPages));
      if (pageNo !== signaturePage) {
        setSignaturePage(pageNo);
        return;
      }
      const page = await documentProxy.getPage(pageNo);
      const baseViewport = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(1, 720 / baseViewport.width) });
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Your browser could not render the PDF preview.");
      renderTask = page.render({ canvas, canvasContext: context, viewport });
      await renderTask.promise;
      if (!cancelled) setPreviewStatus("Page " + pageNo + " of " + documentProxy.numPages + " · Drag the signature to position it.");
    })().catch((cause) => {
      if (!cancelled) {
        const message = cause instanceof Error ? cause.message : "The PDF preview could not be rendered.";
        setPreviewStatus("Preview unavailable: " + message.slice(0, 180));
      }
    });
    return () => {
      cancelled = true;
      try { renderTask?.cancel(); } catch { /* A completed render has nothing to cancel. */ }
      try { void documentProxy?.destroy(); } catch { /* The document may already be closed. */ }
    };
  }, [tool.slug, files, signaturePage]);

  useEffect(() => {
    return () => {
      if (signatureUrl) URL.revokeObjectURL(signatureUrl);
    };
  }, [signatureUrl]);

  function handleSignatureUpload(file?: File) {
    if (!file) return;
    const isPng = file.type === "image/png" || /\\.png$/i.test(file.name);
    const isJpeg = file.type === "image/jpeg" || /\\.jpe?g$/i.test(file.name);
    if (!isPng && !isJpeg) {
      setError("Upload a PNG or JPG/JPEG signature image. Transparent PNG is recommended.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Signature image must be 5 MB or smaller.");
      return;
    }
    const url = URL.createObjectURL(file);
    setSignatureFile(file);
    setSignatureUrl(url);
    setSignatureLeft(0.58);
    setSignatureTop(0.82);
    setSignatureWidth(0.25);
    setError("");
    setSuccess("");
    setOutputs([]);
  }

  function startSignatureDrag(event: ReactPointerEvent<HTMLImageElement>) {
    const imageRect = event.currentTarget.getBoundingClientRect();
    signatureDragOffsetRef.current = { x: event.clientX - imageRect.left, y: event.clientY - imageRect.top };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function moveSignatureDrag(event: ReactPointerEvent<HTMLImageElement>) {
    const offset = signatureDragOffsetRef.current;
    const stage = signaturePreviewRef.current;
    if (!offset || !stage) return;
    const stageRect = stage.getBoundingClientRect();
    const imageRect = event.currentTarget.getBoundingClientRect();
    if (!stageRect.width || !stageRect.height) return;
    const maxLeft = Math.max(0, 1 - imageRect.width / stageRect.width);
    const maxTop = Math.max(0, 1 - imageRect.height / stageRect.height);
    const left = Math.max(0, Math.min(maxLeft, (event.clientX - stageRect.left - offset.x) / stageRect.width));
    const top = Math.max(0, Math.min(maxTop, (event.clientY - stageRect.top - offset.y) / stageRect.height));
    setSignatureLeft(left);
    setSignatureTop(top);
  }

  function finishSignatureDrag() {
    signatureDragOffsetRef.current = null;
  }

  async function imageToJpegBytes(file: File, rotation = 0): Promise<{ bytes: Uint8Array; width: number; height: number }> {
    const url = URL.createObjectURL(file);
    try {
      const image = new Image(); image.src = url;
      await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("Could not open image " + file.name + ".")); });
      const turn = ((rotation % 360) + 360) % 360;
      const swapsDimensions = turn === 90 || turn === 270;
      const canvas = document.createElement("canvas");
      canvas.width = swapsDimensions ? image.naturalHeight : image.naturalWidth;
      canvas.height = swapsDimensions ? image.naturalWidth : image.naturalHeight;
      const context = canvas.getContext("2d"); if (!context) throw new Error("Your browser could not prepare this image.");
      context.fillStyle = "#ffffff"; context.fillRect(0, 0, canvas.width, canvas.height);
      context.translate(canvas.width / 2, canvas.height / 2);
      context.rotate(turn * Math.PI / 180);
      context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
      const blob = await canvasBlob(canvas, "image/jpeg");
      return { bytes: new Uint8Array(await blob.arrayBuffer()), width: canvas.width, height: canvas.height };
    } finally { URL.revokeObjectURL(url); }
  }

  function setImageRotation(file: File, degreesClockwise: number) {
    const key = imageFileKey(file);
    const normalized = ((degreesClockwise % 360) + 360) % 360;
    setImageRotations((current) => ({ ...current, [key]: normalized }));
    setError(""); setSuccess(""); setOutputs([]);
  }

  async function makeOutput() {
    setError(""); setSuccess(""); setOutputs([]);
    if (!files.length) { setError("Choose a file first to continue."); return; }
    if (tool.slug === "merge-pdf" && files.length < 2) { setError("Add at least two PDF files to merge."); return; }
    if (["protect-pdf", "unlock-pdf"].includes(tool.slug) && !password.trim()) { setError("Enter the PDF password to continue."); return; }
    if (tool.slug === "sign-pdf" && !signatureFile) { setError("Upload your signature image first."); return; }
    if (needsText && !customText.trim()) { setError("Enter the text you want to place on the PDF."); return; }
    setBusy(true);
    try {
      const resultFiles: OutputFile[] = [];
      let successMessage = "Your file is ready to download.";
      if (tool.slug === "images-to-pdf") {
        const millimetersToPoints = 72 / 25.4;
        const marginPoints = imageMargin * millimetersToPoints;
        const standardPageSizesMm: Record<"a3" | "a4" | "a5" | "letter" | "legal", [number, number]> = {
          a3: [297, 420], a4: [210, 297], a5: [148, 210], letter: [215.9, 279.4], legal: [215.9, 355.6],
        };
        const addImagePage = async (pdf: PDFDocument, file: File) => {
          const converted = await imageToJpegBytes(file, imageRotations[imageFileKey(file)] ?? 0);
          const image = await pdf.embedJpg(converted.bytes);
          let pageWidth: number; let pageHeight: number;
          if (imagePageSize === "fit") {
            pageWidth = converted.width * 0.75 + marginPoints * 2;
            pageHeight = converted.height * 0.75 + marginPoints * 2;
          } else {
            const [widthMm, heightMm] = standardPageSizesMm[imagePageSize];
            pageWidth = widthMm * millimetersToPoints;
            pageHeight = heightMm * millimetersToPoints;
          }
          if (imageOrientation === "landscape" && pageHeight > pageWidth) [pageWidth, pageHeight] = [pageHeight, pageWidth];
          if (imageOrientation === "portrait" && pageWidth > pageHeight) [pageWidth, pageHeight] = [pageHeight, pageWidth];
          const availableWidth = pageWidth - marginPoints * 2; const availableHeight = pageHeight - marginPoints * 2;
          if (availableWidth <= 0 || availableHeight <= 0) throw new Error("The chosen margin is too large for this image/page size. Choose a smaller margin or a paper size.");
          const scale = Math.min(availableWidth / image.width, availableHeight / image.height);
          const width = image.width * scale; const height = image.height * scale;
          const page = pdf.addPage([pageWidth, pageHeight]);
          page.drawImage(image, { x: (pageWidth - width) / 2, y: (pageHeight - height) / 2, width, height });
        };
        if (mergeImages) {
          const pdf = await PDFDocument.create();
          for (const file of files) await addImagePage(pdf, file);
          const bytes = await pdf.save(); resultFiles.push({ name: "images-combined.pdf", blob: new Blob([bytes as BlobPart], { type: "application/pdf" }), size: bytes.byteLength });
          successMessage = "All selected images have been merged into one PDF, with one image per page.";
        } else {
          for (const file of files) {
            const pdf = await PDFDocument.create(); await addImagePage(pdf, file);
            const bytes = await pdf.save();
            resultFiles.push({ name: safeBase(file.name) + "-converted.pdf", blob: new Blob([bytes as BlobPart], { type: "application/pdf" }), size: bytes.byteLength });
          }
          successMessage = "Created one PDF for each selected image.";
        }
      } else if (tool.slug === "merge-pdf") {
        const merged = await PDFDocument.create();
        for (const file of files) { const source = await PDFDocument.load(await file.arrayBuffer()); const pages = await merged.copyPages(source, source.getPageIndices()); pages.forEach((page) => merged.addPage(page)); }
        const bytes = await merged.save(); resultFiles.push({ name: "merged.pdf", blob: new Blob([bytes as BlobPart], { type: "application/pdf" }), size: bytes.byteLength });
      } else if (tool.slug === "compress-pdf") {
        const before = files[0].size;
        const bytes = await runQpdf(files[0], (input, output) => ["--compress-streams=y", "--decode-level=generalized", "--recompress-flate", "--compression-level=9", "--object-streams=generate", input, output]);
        const reduced = before - bytes.byteLength;
        const pct = before > 0 ? (Math.abs(reduced) / before * 100).toFixed(1) : "0.0";
        successMessage = reduced > 0 ? "PDF optimized: file size reduced by " + pct + "% (" + formatBytes(before) + " to " + formatBytes(bytes.byteLength) + ")." : "PDF structure optimized. The output is " + pct + "% " + (reduced < 0 ? "larger" : "the same size") + "; lossless optimization cannot reduce every PDF.";
        resultFiles.push({ name: safeBase(files[0].name) + "-compressed.pdf", blob: new Blob([bytes as BlobPart], { type: "application/pdf" }), size: bytes.byteLength });
      } else if (tool.slug === "repair-pdf") {
        const bytes = await runQpdf(files[0], (input, output) => [input, output]);
        resultFiles.push({ name: safeBase(files[0].name) + "-repaired.pdf", blob: new Blob([bytes as BlobPart], { type: "application/pdf" }), size: bytes.byteLength });
        successMessage = "QPDF rebuilt the document structure where recoverable. Files with missing or unrecoverable data may still be incomplete.";
      } else if (tool.slug === "protect-pdf") {
        const bytes = await runQpdf(files[0], (input, output) => ["--encrypt", password, password + "-owner-" + crypto.randomUUID(), "256", "--", input, output]);
        resultFiles.push({ name: safeBase(files[0].name) + "-protected.pdf", blob: new Blob([bytes as BlobPart], { type: "application/pdf" }), size: bytes.byteLength });
        successMessage = "Password protection applied with 256-bit encryption. Keep your password safe; it cannot be recovered by SajiloPDF.";
      } else if (tool.slug === "unlock-pdf") {
        const bytes = await runQpdf(files[0], (input, output) => ["--password=" + password, "--decrypt", input, output]);
        resultFiles.push({ name: safeBase(files[0].name) + "-unlocked.pdf", blob: new Blob([bytes as BlobPart], { type: "application/pdf" }), size: bytes.byteLength });
      } else if (tool.slug === "pdf-to-jpg") {
        const pdfjs = await getPdfJs();
        const doc = await pdfjs.getDocument({ data: new Uint8Array(await files[0].arrayBuffer()) }).promise;
        try {
          if (doc.numPages > MAX_RENDER_PAGES) throw new Error("This file has " + doc.numPages + " pages. Export up to " + MAX_RENDER_PAGES + " pages at a time to protect browser memory.");
          const zip = new JSZip();
          for (let pageNo = 1; pageNo <= doc.numPages; pageNo += 1) {
            const page = await doc.getPage(pageNo); const viewport = page.getViewport({ scale: 1.5 });
            const canvas = document.createElement("canvas"); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
            const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Your browser does not support PDF page rendering.");
            ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
            await page.render({ canvas, canvasContext: ctx, viewport }).promise;
            const blob = await canvasBlob(canvas, "image/jpeg");
            zip.file("page-" + String(pageNo).padStart(3, "0") + ".jpg", new Uint8Array(await blob.arrayBuffer()));
          }
          const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
          resultFiles.push({ name: safeBase(files[0].name) + "-pages-jpg.zip", blob, size: blob.size });
        } finally { await doc.destroy(); }
      } else if (tool.slug === "pdf-to-word") {
        const pages = await extractPdfText(files[0]);
        const textPages = pages.filter((page) => page.lines.length > 0);
        if (!textPages.length) throw new Error("No selectable text was found. For a scanned PDF, run OCR PDF first.");
        const { Document, Packer, Paragraph } = await import("docx");
        const paragraphs: InstanceType<typeof Paragraph>[] = [];
        textPages.forEach((page, pageIndex) => page.lines.forEach((line, lineIndex) => paragraphs.push(new Paragraph({ text: line, pageBreakBefore: pageIndex > 0 && lineIndex === 0 }))));
        const docx = new Document({ sections: [{ properties: { page: { margin: { top: 900, right: 900, bottom: 900, left: 900 } } }, children: paragraphs }] });
        const blob = await Packer.toBlob(docx);
        resultFiles.push({ name: safeBase(files[0].name) + ".docx", blob, size: blob.size });
        successMessage = "Word document created from selectable PDF text. Complex page layout, images and fonts may not be preserved.";
      } else if (tool.slug === "word-to-pdf") {
        const paragraphs = await readDocxParagraphs(files[0]);
        const bytes = await renderTextToPdf([{ title: files[0].name.replace(/\.docx$/i, ""), lines: paragraphs }]);
        resultFiles.push({ name: safeBase(files[0].name) + ".pdf", blob: new Blob([bytes as BlobPart], { type: "application/pdf" }), size: bytes.byteLength });
        successMessage = "PDF created from DOCX paragraph text. Original fonts, tables, images and complex layout are not fully preserved.";
      } else if (tool.slug === "excel-to-pdf") {
        const sheets = await readXlsxRows(files[0]);
        const sections = sheets.map((sheet) => ({ title: sheet.title, lines: sheet.lines }));
        const bytes = await renderTextToPdf(sections);
        resultFiles.push({ name: safeBase(files[0].name) + ".pdf", blob: new Blob([bytes as BlobPart], { type: "application/pdf" }), size: bytes.byteLength });
        successMessage = "PDF generated from worksheet cell values. Original cell styling, charts, formulas and workbook layout may not be preserved.";
      } else if (tool.slug === "ppt-to-pdf") {
        const slides = await readPptxSlides(files[0]);
        const sections = slides.map((slide) => ({ title: slide.title, lines: slide.lines, landscape: true }));
        const bytes = await renderTextToPdf(sections);
        resultFiles.push({ name: safeBase(files[0].name) + ".pdf", blob: new Blob([bytes as BlobPart], { type: "application/pdf" }), size: bytes.byteLength });
        successMessage = "PDF generated from slide text. Original themes, diagrams, slide layout, audio, video and embedded media are not preserved.";
      } else if (tool.slug === "ocr-pdf") {
        const pdfjs = await getPdfJs();
        const doc = await pdfjs.getDocument({ data: new Uint8Array(await files[0].arrayBuffer()) }).promise;
        const { createWorker } = await import("tesseract.js");
        let worker: Awaited<ReturnType<typeof createWorker>> | undefined;
        try {
          if (doc.numPages > MAX_OCR_PAGES) throw new Error("OCR is resource-intensive. Run up to " + MAX_OCR_PAGES + " pages at a time.");
          worker = await createWorker("eng");
          const outPdf = await PDFDocument.create();
          const font = await outPdf.embedFont(StandardFonts.Helvetica);
          const textPages: string[] = [];
          for (let pageNo = 1; pageNo <= doc.numPages; pageNo += 1) {
            const sourcePage = await doc.getPage(pageNo); const scale = 1.5; const viewport = sourcePage.getViewport({ scale });
            const canvas = document.createElement("canvas"); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
            const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Your browser does not support OCR canvas rendering.");
            await sourcePage.render({ canvas, canvasContext: ctx, viewport }).promise;
            const result = await worker.recognize(canvas);
            textPages.push((result.data.text ?? "").trim());
            const imageBlob = await canvasBlob(canvas, "image/png");
            const image = await outPdf.embedPng(new Uint8Array(await imageBlob.arrayBuffer()));
            const width = viewport.width / scale; const height = viewport.height / scale;
            const page = outPdf.addPage([width, height]); page.drawImage(image, { x: 0, y: 0, width, height });
            for (const word of ((result.data as any).words ?? []) as any[]) {
              const wordText = String(word.text ?? "").trim();
              if (!wordText || /[^\x20-\x7E]/.test(wordText)) continue;
              const box = word.bbox;
              const size = Math.max(4, Math.min(18, (box.y1 - box.y0) / scale));
              try { page.drawText(wordText, { x: Math.max(0, box.x0 / scale), y: Math.max(0, height - box.y1 / scale), size, font, color: rgb(0, 0, 0), opacity: 0 }); } catch { /* Skip words the standard font cannot encode. */ }
            }
          }
          const bytes = await outPdf.save();
          resultFiles.push({ name: safeBase(files[0].name) + "-searchable.pdf", blob: new Blob([bytes as BlobPart], { type: "application/pdf" }), size: bytes.byteLength });
          const textBlob = new Blob([textPages.map((text, index) => "PAGE " + (index + 1) + "\n" + text).join("\n\n")], { type: "text/plain;charset=utf-8" });
          resultFiles.push({ name: safeBase(files[0].name) + "-ocr.txt", blob: textBlob, size: textBlob.size });
          successMessage = "OCR completed using English recognition. Download the searchable PDF and raw text; OCR quality depends on scan quality.";
        } finally {
          if (worker) await worker.terminate();
          await doc.destroy();
        }
      } else {
        const file = files[0]; const pdf = await PDFDocument.load(await file.arrayBuffer());
        const total = pdf.getPageCount(); setPageCount(total);
        if (tool.slug === "rotate-pdf") {
          const rotation = Number(angle); pdf.getPages().forEach((page) => page.setRotation(degrees((page.getRotation().angle + rotation) % 360)));
          const bytes = await pdf.save(); resultFiles.push({ name: safeBase(file.name) + "-rotated.pdf", blob: new Blob([bytes as BlobPart], { type: "application/pdf" }), size: bytes.byteLength });
        } else if (tool.slug === "remove-pages") {
          const numbers = parsePageNumbers(pageInput, total); if (!numbers.length) throw new Error("Enter page numbers from 1 to " + total + ", separated by commas.");
          if (numbers.length === total) throw new Error("You cannot remove every page. Keep at least one page in the PDF.");
          numbers.sort((a, b) => b - a).forEach((page) => pdf.removePage(page - 1));
          const bytes = await pdf.save(); resultFiles.push({ name: safeBase(file.name) + "-pages-removed.pdf", blob: new Blob([bytes as BlobPart], { type: "application/pdf" }), size: bytes.byteLength });
        } else if (tool.slug === "extract-pages") {
          const numbers = parsePageNumbers(pageInput, total); if (!numbers.length) throw new Error("Enter page numbers from 1 to " + total + ", separated by commas.");
          const extracted = await PDFDocument.create(); const pages = await extracted.copyPages(pdf, numbers.map((page) => page - 1)); pages.forEach((page) => extracted.addPage(page));
          const bytes = await extracted.save(); resultFiles.push({ name: safeBase(file.name) + "-extracted.pdf", blob: new Blob([bytes as BlobPart], { type: "application/pdf" }), size: bytes.byteLength });
        } else if (tool.slug === "split-pdf") {
          const groups = parseRanges(pageInput, total); if (!groups.length) throw new Error("Enter one or more page ranges, such as 1-3,4-6.");
          const zip = new JSZip();
          for (let i = 0; i < groups.length; i += 1) {
            const segment = await PDFDocument.create(); const pages = await segment.copyPages(pdf, groups[i].map((page) => page - 1)); pages.forEach((page) => segment.addPage(page));
            zip.file(safeBase(file.name) + "-part-" + (i + 1) + ".pdf", await segment.save());
          }
          const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" }); resultFiles.push({ name: safeBase(file.name) + "-split.zip", blob, size: blob.size });
        } else if (tool.slug === "page-numbers") {
          const font = await pdf.embedFont(StandardFonts.Helvetica); const pages = pdf.getPages();
          pages.forEach((page, index) => { const { width } = page.getSize(); const text = String(index + 1); const size = 10; page.drawText(text, { x: (width - font.widthOfTextAtSize(text, size)) / 2, y: 18, size, font, color: rgb(0.34, 0.37, 0.45) }); });
          const bytes = await pdf.save(); resultFiles.push({ name: safeBase(file.name) + "-numbered.pdf", blob: new Blob([bytes as BlobPart], { type: "application/pdf" }), size: bytes.byteLength });
        } else if (tool.slug === "watermark-pdf") {
          const font = await pdf.embedFont(StandardFonts.HelveticaBold);
          pdf.getPages().forEach((page) => { const { width, height } = page.getSize(); const size = Math.min(42, Math.max(22, width / 15)); const textWidth = font.widthOfTextAtSize(customText, size); page.drawText(customText, { x: Math.max(12, (width - textWidth) / 2), y: height / 2, size, font, color: rgb(0.45, 0.45, 0.52), opacity: 0.22, rotate: degrees(35) }); });
          const bytes = await pdf.save(); resultFiles.push({ name: safeBase(file.name) + "-watermarked.pdf", blob: new Blob([bytes as BlobPart], { type: "application/pdf" }), size: bytes.byteLength });
        } else if (tool.slug === "crop-pdf") {
          const margin = Number(cropMargin); if (!Number.isFinite(margin) || margin < 0) throw new Error("Crop margin must be a non-negative number of PDF points.");
          pdf.getPages().forEach((page) => { const { width, height } = page.getSize(); if (margin * 2 >= Math.min(width, height)) throw new Error("Crop margin is too large for one or more pages."); page.setCropBox(margin, margin, width - margin * 2, height - margin * 2); });
          const bytes = await pdf.save(); resultFiles.push({ name: safeBase(file.name) + "-cropped.pdf", blob: new Blob([bytes as BlobPart], { type: "application/pdf" }), size: bytes.byteLength });
        } else if (tool.slug === "edit-pdf") {
          const font = await pdf.embedFont(StandardFonts.Helvetica); const pages = pdf.getPages();
          const selected = targetPage === "all" ? pages.map((_, index) => index) : [Number(targetPage) - 1];
          if (selected.some((index) => !Number.isInteger(index) || index < 0 || index >= pages.length)) throw new Error("Choose a valid page number from 1 to " + pages.length + ".");
          selected.forEach((index) => { const page = pages[index]; const { width, height } = page.getSize(); const size = 16; let x = 36; let y = height - 48; if (position === "center") { x = Math.max(24, (width - font.widthOfTextAtSize(customText, size)) / 2); y = height / 2; } else if (position === "bottom") { x = 36; y = 32; } page.drawText(customText, { x, y, size, font, color: rgb(0.12, 0.15, 0.28), maxWidth: width - 72 }); });
          const bytes = await pdf.save(); resultFiles.push({ name: safeBase(file.name) + "-edited.pdf", blob: new Blob([bytes as BlobPart], { type: "application/pdf" }), size: bytes.byteLength });
          successMessage = "Text overlay added. This basic editor adds new text; it does not change existing PDF text.";
        } else if (tool.slug === "sign-pdf") {
          if (!signatureFile) throw new Error("Upload a PNG or JPG signature image first.");
          const signatureBytes = new Uint8Array(await signatureFile.arrayBuffer());
          const isPngSignature = signatureFile.type === "image/png" || /\\.png$/i.test(signatureFile.name);
          const signatureImage = isPngSignature ? await pdf.embedPng(signatureBytes) : await pdf.embedJpg(signatureBytes);
          const pages = pdf.getPages();
          const selectedPageIndex = signaturePage - 1;
          if (!Number.isInteger(signaturePage) || selectedPageIndex < 0 || selectedPageIndex >= pages.length) {
            throw new Error("Select a valid page number from 1 to " + pages.length + ".");
          }
          const page = pages[selectedPageIndex];
          const { width: pageWidth, height: pageHeight } = page.getSize();
          const drawWidth = pageWidth * signatureWidth;
          const drawHeight = drawWidth * (signatureImage.height / signatureImage.width);
          const x = Math.max(0, Math.min(pageWidth - drawWidth, pageWidth * signatureLeft));
          const topFromPage = Math.max(0, Math.min(pageHeight - drawHeight, pageHeight * signatureTop));
          page.drawImage(signatureImage, { x, y: pageHeight - topFromPage - drawHeight, width: drawWidth, height: drawHeight });
          const bytes = await pdf.save();
          resultFiles.push({ name: safeBase(file.name) + "-signed.pdf", blob: new Blob([bytes as BlobPart], { type: "application/pdf" }), size: bytes.byteLength });
          successMessage = "Uploaded signature image placed on page " + signaturePage + " at the position shown in the preview. This visible mark is not a certificate-backed digital signature.";
        } else if (tool.slug === "summarize-pdf") {
          const textPages = await extractPdfText(file);
          const summary = extractiveSummary(textPages);
          const blob = new Blob(["SajiloPDF — Local extractive summary\n\nThis summary is generated from selectable text using sentence scoring; it is not AI-generated and may miss context.\n\n" + summary + "\n"], { type: "text/plain;charset=utf-8" });
          resultFiles.push({ name: safeBase(file.name) + "-summary.txt", blob, size: blob.size });
          successMessage = "Local text summary created. No document was sent to an AI service.";
        }
        if (!resultFiles.length && !["ocr-pdf", "pdf-to-jpg", "pdf-to-word", "word-to-pdf", "excel-to-pdf", "ppt-to-pdf", "compress-pdf", "repair-pdf", "protect-pdf", "unlock-pdf"].includes(tool.slug)) {
          throw new Error("This tool could not create an output for this file. Please verify the file and try again.");
        }
      }
      setOutputs(resultFiles); setSuccess(successMessage);
    } catch (unknownError) {
      const message = unknownError instanceof Error ? unknownError.message : "Something went wrong while processing this file. Please try another file.";
      setError(message.length > 500 ? message.slice(0, 500) : message);
    } finally { setBusy(false); }
  }

  const previewPageDimensionsMm = (() => {
    const pointsToMillimeters = 25.4 / 72;
    const fixedSizes: Record<"a3" | "a4" | "a5" | "letter" | "legal", [number, number]> = {
      a3: [297, 420], a4: [210, 297], a5: [148, 210], letter: [215.9, 279.4], legal: [215.9, 355.6],
    };
    let widthMm: number; let heightMm: number;
    if (imagePageSize === "fit") {
      const first = imagePreviews[0];
      const dimensions = first ? imageDimensions[first.key] : undefined;
      if (dimensions) {
        const rotation = first ? imageRotations[first.key] ?? 0 : 0;
        const swaps = rotation === 90 || rotation === 270;
        const pixelWidth = swaps ? dimensions.height : dimensions.width;
        const pixelHeight = swaps ? dimensions.width : dimensions.height;
        widthMm = pixelWidth * 0.75 * pointsToMillimeters + imageMargin * 2;
        heightMm = pixelHeight * 0.75 * pointsToMillimeters + imageMargin * 2;
      } else { widthMm = 210; heightMm = 297; }
    } else { [widthMm, heightMm] = fixedSizes[imagePageSize]; }
    if (imageOrientation === "landscape" && heightMm > widthMm) [widthMm, heightMm] = [heightMm, widthMm];
    if (imageOrientation === "portrait" && widthMm > heightMm) [widthMm, heightMm] = [heightMm, widthMm];
    return { width: widthMm, height: heightMm };
  })();

  return <div className={"tool-workspace" + (tool.slug === "images-to-pdf" ? " tool-workspace-images" + (files.length > 0 ? " has-image-files" : "") : "")}>
    {tool.slug === "images-to-pdf" && <div className={"image-flow-steps" + (files.length > 0 ? " image-flow-steps-editing" : "")} aria-label="Conversion steps">
      <div className={"image-flow-step" + (files.length === 0 ? " is-current" : " is-done")}><span>{files.length === 0 ? "01" : "✓"}</span><div><strong>Add images</strong><small>JPG, PNG or WebP</small></div></div>
      <div className={"image-flow-step" + (files.length === 0 ? "" : outputs.length > 0 ? " is-done" : " is-current")}><span>{outputs.length > 0 ? "✓" : "02"}</span><div><strong>Arrange pages</strong><small>Preview and choose layout</small></div></div>
      <div className={"image-flow-step" + (outputs.length > 0 ? " is-done" : busy ? " is-current" : "")}><span>{outputs.length > 0 ? "✓" : "03"}</span><div><strong>Download PDF</strong><small>Ready in your browser</small></div></div>
    </div>}
    <div className={"workspace-card" + (tool.slug === "images-to-pdf" ? " workspace-card-image-editor" : "")}>
      <div className="workspace-card-top">
        <div>
          <h2>{tool.slug === "merge-pdf" ? "Add PDFs to merge" : tool.slug === "images-to-pdf" ? "Add your images" : tool.slug === "word-to-pdf" ? "Add a Word document (.docx)" : tool.slug === "excel-to-pdf" ? "Add an Excel workbook (.xlsx)" : tool.slug === "ppt-to-pdf" ? "Add a PowerPoint (.pptx)" : "Upload your PDF"}</h2>
          <p>{tool.slug === "merge-pdf" ? "Files will be combined in the order shown below." : tool.slug === "images-to-pdf" ? "Choose page orientation, paper size and margins, then preview, rotate or remove images before converting." : tool.slug === "pdf-to-jpg" ? "Each page is rendered as a high-quality JPEG and packed into a ZIP." : tool.slug === "ocr-pdf" ? "English OCR runs in your browser. First use can download the OCR engine and language data." : tool.slug === "summarize-pdf" ? "Creates a quick extractive summary from selectable text locally; scanned PDFs need OCR first." : tool.slug === "word-to-pdf" || tool.slug === "excel-to-pdf" || tool.slug === "ppt-to-pdf" ? "This lightweight converter extracts document text and renders it into a PDF. Original layout and media may not be preserved." : "Your file is processed in this browser unless the password/encryption tool loads its local WebAssembly engine."}</p>
        </div>
        <span className="local-badge"><ShieldCheck size={14}/> Local processing</span>
      </div>
      <div className={"dropzone" + (tool.slug === "images-to-pdf" ? " image-editor-upload" : "") + (dragging ? " dropzone-active" : "") + (files.length ? " dropzone-compact" : "")} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); addFiles(event.dataTransfer.files); }}>
        {files.length === 0 ? <>
          <span className="upload-symbol"><UploadCloud size={29}/></span><h3>{tool.slug === "images-to-pdf" ? "Drop your images here" : "Drop files here"}</h3><p>{tool.slug === "images-to-pdf" ? "Drag and drop images here, or browse your device below." : "or choose files from your device"}</p>
          <button type="button" className="button button-primary" onClick={() => inputRef.current?.click()}><Plus size={17}/> Choose {tool.slug === "images-to-pdf" ? "images" : tool.slug === "word-to-pdf" ? "DOCX file" : tool.slug === "excel-to-pdf" ? "XLSX file" : tool.slug === "ppt-to-pdf" ? "PPTX file" : "PDF file"}</button>
          <span className="upload-limit">{tool.slug === "images-to-pdf" ? "JPG · PNG · WebP · Up to 50 MB per image" : tool.slug === "word-to-pdf" ? "DOCX" : tool.slug === "excel-to-pdf" ? "XLSX" : tool.slug === "ppt-to-pdf" ? "PPTX" : "PDF documents"}{tool.slug === "images-to-pdf" ? "" : " · Up to 50 MB per file"}</span>
        </> : <>
          <span className="upload-symbol upload-symbol-small"><CheckCircle2 size={23}/></span><h3>{files.length} {files.length === 1 ? "image" : "images"} selected</h3><p>{tool.slug === "images-to-pdf" ? "Add more images or adjust the thumbnails below." : "Drop a replacement or use the button below."}</p>
          <button type="button" className="button button-secondary button-small" onClick={() => inputRef.current?.click()}><Plus size={16}/> {tool.slug === "images-to-pdf" ? "Add images" : "Add files"}</button>
        </>}
        <input ref={inputRef} className="visually-hidden" type="file" accept={acceptedFormats} multiple={needsMultiple} onChange={(event) => { if (event.target.files?.length) addFiles(event.target.files); event.target.value = ""; }}/>
      </div>
      {files.length > 0 && tool.slug !== "images-to-pdf" && <div className="selected-files">
        <div className="selected-files-heading"><strong>Selected files</strong><span>{files.length} {files.length === 1 ? "file" : "files"}</span></div>
        {files.map((file, index) => <div className="file-row" key={file.name + "-" + file.lastModified + "-" + index}>
          <span className="file-type-icon">{isImage(file) ? <ImageIcon size={19}/> : tool.slug === "excel-to-pdf" ? <FileSpreadsheet size={19}/> : tool.slug === "ppt-to-pdf" ? <Presentation size={19}/> : <FileText size={19}/>}</span>
          <div className="file-details"><strong>{file.name}</strong><span>{formatBytes(file.size)}{index === 0 && pageCount ? " · " + pageCount + " pages" : ""}</span></div>
          {tool.slug === "merge-pdf" && <span className="file-position" title="File order">{index + 1}<GripVertical size={14}/></span>}
          <button type="button" className="icon-button" aria-label={"Remove " + file.name} onClick={() => removeFile(index)}><X size={17}/></button>
        </div>)}
      </div>}
      {tool.slug === "images-to-pdf" && imagePreviews.length > 0 && <div className="image-preview-grid image-editor-previews" aria-label="Uploaded image previews">
        <div className="image-preview-toolbar"><div><strong>Your images</strong><span>Use Rotate or Remove on each thumbnail before converting.</span></div><button type="button" className="image-editor-add-button" onClick={() => inputRef.current?.click()}><Plus size={17}/> Add images <span className="image-editor-count">{files.length}</span></button></div>
        {imagePreviews.map((preview, index) => {
          const fileIndex = files.findIndex((file) => imageFileKey(file) === preview.key);
          const rotation = imageRotations[preview.key] ?? 0;
          return <article className="image-preview-card" key={preview.key}>
            <div className="image-preview-frame"><img src={preview.url} alt={"Preview of " + preview.file.name} onLoad={(event) => { const image = event.currentTarget; if (image.naturalWidth && image.naturalHeight) setImageDimensions((current) => ({ ...current, [preview.key]: { width: image.naturalWidth, height: image.naturalHeight } })); }} style={{ transform: "rotate(" + rotation + "deg)" }} /></div>
            <div className="image-preview-caption"><strong title={preview.file.name}>{index + 1}. {preview.file.name}</strong><span>{formatBytes(preview.file.size)} · {rotation}° clockwise</span></div>
            <div className="image-preview-actions image-rotation-actions"><label className="image-rotation-control"><RotateCw size={15}/><span>Rotate</span><select aria-label={"Clockwise rotation for " + preview.file.name} value={rotation} onChange={(event) => setImageRotation(preview.file, Number(event.target.value))}><option value={0}>0°</option><option value={90}>90°</option><option value={180}>180°</option><option value={270}>270°</option></select></label><button type="button" className="icon-button" aria-label={"Remove " + preview.file.name} title="Remove image" onClick={() => { if (fileIndex >= 0) removeFile(fileIndex); }}><Trash2 size={16}/></button></div>
          </article>;
        })}
      </div>}
      {["split-pdf", "extract-pages", "remove-pages"].includes(tool.slug) && <div className="settings-panel">
        <label htmlFor="page-range">{tool.slug === "split-pdf" ? "Page ranges" : "Page numbers"}<span className="settings-hint">{tool.slug === "split-pdf" ? "Example: 1-3, 4-6, 7" : "Example: 1, 3, 5"}</span></label>
        <input id="page-range" type="text" value={pageInput} onChange={(event) => setPageInput(event.target.value)} placeholder={tool.slug === "split-pdf" ? "1-3, 4-6" : "1, 3, 5"}/>
        <p>{tool.slug === "split-pdf" ? "Each range becomes a separate PDF inside a ZIP file." : tool.slug === "extract-pages" ? "Selected pages are kept in ascending page order." : "Every listed page will be removed from the PDF."}</p>
      </div>}
      {tool.slug === "images-to-pdf" && <div className="settings-panel image-to-pdf-settings" aria-label="Conversion settings">
        <div className="image-settings-row">
          <span className="settings-label">Page orientation</span>
          <div className="angle-options" role="group" aria-label="Page orientation">
            <button type="button" className={"orientation-option" + (imageOrientation === "portrait" ? " orientation-option-active" : "")} aria-pressed={imageOrientation === "portrait"} onClick={() => { setImageOrientation("portrait"); setOutputs([]); }}><RectangleVertical size={18}/><span>Portrait</span></button>
            <button type="button" className={"orientation-option" + (imageOrientation === "landscape" ? " orientation-option-active" : "")} aria-pressed={imageOrientation === "landscape"} onClick={() => { setImageOrientation("landscape"); setOutputs([]); }}><RectangleHorizontal size={18}/><span>Landscape</span></button>
          </div>
        </div>
        <div className="image-settings-row">
          <label htmlFor="image-page-size">Page size</label>
          <select id="image-page-size" value={imagePageSize} onChange={(event) => { setImagePageSize(event.target.value as "fit" | "a3" | "a4" | "a5" | "letter" | "legal"); setOutputs([]); }}>
            <option value="fit">Fit to image</option>
            <option value="a3">A3 — 297 × 420 mm</option>
            <option value="a4">A4 — 210 × 297 mm</option>
            <option value="a5">A5 — 148 × 210 mm</option>
            <option value="letter">US Letter — 215.9 × 279.4 mm</option>
            <option value="legal">US Legal — 215.9 × 355.6 mm</option>
          </select>
        </div>
        <div className="image-settings-row image-margin-setting">
          <div className="image-margin-heading"><label htmlFor="image-margin-mm">Page margins</label><strong>{imageMargin} mm</strong></div>
          <input id="image-margin-mm" className="image-margin-slider" type="range" min={0} max={30} step={1} value={imageMargin} aria-valuetext={imageMargin + " millimeters on all sides"} onChange={(event) => { setImageMargin(Number(event.target.value)); setOutputs([]); }}/>
          <div className="image-margin-presets" aria-label="Common page margins">{[0, 5, 10, 15, 20, 25, 30].map((value) => <button key={value} type="button" className={imageMargin === value ? "image-margin-preset is-selected" : "image-margin-preset"} aria-pressed={imageMargin === value} onClick={() => { setImageMargin(value); setOutputs([]); }}>{value}</button>)}</div>
          <p className="image-margin-help">Millimeters on each edge. This exact margin is applied to every exported page.</p>
        </div>
        <div className="page-layout-preview" aria-live="polite" aria-label="PDF page layout preview">
          <div className="page-layout-paper-wrap"><div className="page-layout-paper" style={{ width: (Math.max(0.48, Math.min(1.65, previewPageDimensionsMm.width / previewPageDimensionsMm.height)) * 90) + "px", height: (90 / Math.max(0.48, Math.min(1.65, previewPageDimensionsMm.width / previewPageDimensionsMm.height))) + "px" }}><span className="page-layout-safe-area" style={{ inset: Math.min(38, imageMargin / previewPageDimensionsMm.height * 100) + "% " + Math.min(38, imageMargin / previewPageDimensionsMm.width * 100) + "%" }}/></div></div>
          <div className="page-layout-copy"><strong>{imagePageSize === "fit" ? "Fit to image" : ({ a3: "A3", a4: "A4", a5: "A5", letter: "US Letter", legal: "US Legal" } as const)[imagePageSize]}</strong><span>{imageOrientation === "portrait" ? "Portrait" : "Landscape"} · {imageMargin} mm margins</span><small>PDF page: {previewPageDimensionsMm.width.toFixed(1)} × {previewPageDimensionsMm.height.toFixed(1)} mm</small></div>
        </div>
        <label className="merge-images-toggle"><input type="checkbox" checked={mergeImages} onChange={(event) => { setMergeImages(event.target.checked); setOutputs([]); }}/><span><strong>Merge all images in one PDF file</strong><small>{mergeImages ? "Every image becomes a page in a single PDF." : "Each image will be exported as a separate PDF."}</small></span></label>
        <p className="image-settings-note">Images are converted locally in your browser. Fit preserves the image proportions; paper sizes follow the selected orientation.</p>
        <div className="image-sidebar-footer"><div className="image-sidebar-privacy"><ShieldCheck size={16}/><span>Files stay on your device</span></div><button type="button" className="button image-convert-button" onClick={makeOutput} disabled={busy || files.length === 0}>{busy ? <><LoaderCircle size={18} className="spin"/> Converting…</> : <>Convert to PDF <ArrowRight size={18}/></>}</button></div>
      </div>}
      {tool.slug === "rotate-pdf" && <div className="settings-panel"><span className="settings-label">Rotation angle</span><div className="angle-options">{["90", "180", "270"].map((value) => <button type="button" key={value} onClick={() => setAngle(value)} className={"angle-option" + (angle === value ? " angle-option-active" : "")}>{value}°</button>)}</div><p>Rotate every page clockwise by the selected angle.</p></div>}
      {needsText && <div className="settings-panel">
        <label htmlFor="overlay-text">{tool.slug === "watermark-pdf" ? "Watermark text" : "Text to add"}</label>
        <input id="overlay-text" type="text" value={customText} maxLength={160} onChange={(event) => setCustomText(event.target.value)} placeholder="Enter text (basic Latin/English font)"/>
        {tool.slug === "edit-pdf" && <><label htmlFor="target-page" style={{ marginTop: 14 }}>Page number or all</label><input id="target-page" type="text" value={targetPage} onChange={(event) => setTargetPage(event.target.value.trim() || "all")} placeholder="all or a page number"/><label htmlFor="text-position" style={{ marginTop: 14 }}>Position</label><select id="text-position" value={position} onChange={(event) => setPosition(event.target.value)}><option value="center">Center</option><option value="top">Top</option><option value="bottom">Bottom</option></select></>}
        <p>{tool.slug === "watermark-pdf" ? "A semi-transparent angled watermark will appear on each page." : "Adds a new text overlay; it does not edit or erase existing text. Standard PDF font works best with English/Latin characters."}</p>
      </div>}
      {tool.slug === "sign-pdf" && <div className="settings-panel signature-panel">
        <div className="settings-label"><span>Signature image</span><span className="settings-hint">PNG or JPG · up to 5 MB</span></div>
        <input ref={signatureInputRef} className="visually-hidden" type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" onChange={(event) => { if (event.target.files?.[0]) handleSignatureUpload(event.target.files[0]); event.target.value = ""; }}/>
        <div className="signature-upload-row">
          <button type="button" className="button button-secondary button-small" onClick={() => signatureInputRef.current?.click()}><UploadCloud size={16}/> {signatureFile ? "Change signature" : "Upload signature"}</button>
          {signatureFile && <><span className="signature-file-name">{signatureFile.name}</span><button type="button" className="icon-button" aria-label="Remove signature image" onClick={() => { setSignatureFile(null); setSignatureUrl(""); setSuccess(""); setOutputs([]); }}><X size={17}/></button></>}
        </div>
        <p>Use a transparent PNG for the cleanest result. Your signature image is processed in this browser and is not uploaded to SajiloPDF.</p>
        <label htmlFor="signature-page">Place signature on page</label>
        <input id="signature-page" type="number" min={1} max={pageCount ?? undefined} value={signaturePage} onChange={(event) => { const next = Number(event.target.value); setSignaturePage(Number.isFinite(next) && next >= 1 ? Math.floor(next) : 1); }} disabled={!files.length}/>
        <label htmlFor="signature-size" style={{ marginTop: 12 }}>Signature size <span className="settings-hint">{Math.round(signatureWidth * 100)}% of page width</span></label>
        <input id="signature-size" type="range" min={12} max={45} step={1} value={Math.round(signatureWidth * 100)} onChange={(event) => { const nextWidth = Number(event.target.value) / 100; setSignatureWidth(nextWidth); const canvas = previewCanvasRef.current; const imageHeightRatio = canvas?.width && canvas?.height ? nextWidth * signatureAspect * (canvas.width / canvas.height) : nextWidth * signatureAspect; setSignatureTop((current) => Math.min(current, Math.max(0, 1 - imageHeightRatio))); setSignatureLeft((current) => Math.min(current, 1 - nextWidth)); }} disabled={!signatureFile}/>
        {files.length > 0 ? <div className="signature-preview-card">
          <div className="signature-preview-toolbar"><strong>PDF preview</strong><span>{signatureFile ? "Drag the signature to place it" : "Upload signature to position it"}</span></div>
          <div ref={signaturePreviewRef} className="signature-preview-stage" style={{ position: "relative", width: "100%", maxWidth: 720, margin: "0 auto", lineHeight: 0, border: "1px solid #d9ddec", background: "#f7f8fc", overflow: "hidden", borderRadius: 8 }}>
            <canvas ref={previewCanvasRef} aria-label="PDF page preview" style={{ display: "block", width: "100%", height: "auto" }}/>
            {signatureUrl && <img src={signatureUrl} alt="Signature placement preview" draggable={false} className="signature-stamp" onLoad={(event) => { const image = event.currentTarget; if (image.naturalWidth > 0) setSignatureAspect(image.naturalHeight / image.naturalWidth); }} onPointerDown={startSignatureDrag} onPointerMove={moveSignatureDrag} onPointerUp={finishSignatureDrag} onPointerCancel={finishSignatureDrag} style={{ position: "absolute", left: (signatureLeft * 100) + "%", top: (signatureTop * 100) + "%", width: (signatureWidth * 100) + "%", height: "auto", maxWidth: "none", cursor: "move", touchAction: "none", userSelect: "none", objectFit: "contain", filter: "drop-shadow(0 1px 1px rgba(20,30,60,.12))" }}/>}
          </div>
          <p className="signature-preview-status" role="status">{previewStatus}</p>
          <p>Drag the image directly on the page. The saved PDF uses the same page number, size and position shown here.</p>
        </div> : <p className="signature-preview-status">Upload the PDF first. The page preview appears here, then drag your signature to the preferred location.</p>}
        <p>Signature placement adds a visible image, not a cryptographic or certificate-backed digital signature.</p>
      </div>}
      {tool.slug === "crop-pdf" && <div className="settings-panel"><label htmlFor="crop-margin">Crop margin (PDF points)</label><input id="crop-margin" type="number" min="0" max="300" value={cropMargin} onChange={(event) => setCropMargin(event.target.value)}/><p>Removes this margin from each edge of the visible page area. 1 point equals 1/72 inch.</p></div>}
      {["protect-pdf", "unlock-pdf"].includes(tool.slug) && <div className="settings-panel">
        <label htmlFor="pdf-password"><span>{tool.slug === "protect-pdf" ? "Password for the new PDF" : "Existing PDF password"}</span><span className="settings-hint">Never share this password</span></label>
        <input id="pdf-password" type="password" value={password} autoComplete="new-password" onChange={(event) => setPassword(event.target.value)} placeholder={tool.slug === "protect-pdf" ? "Choose a strong password" : "Enter the password"} maxLength={256}/>
        <p>{tool.slug === "protect-pdf" ? "Uses QPDF's WebAssembly engine and AES-256 encryption. The password is processed locally and is not saved." : "Only unlock documents you are authorized to access. The password is processed locally and is not saved."}</p>
      </div>}
      {tool.slug === "ocr-pdf" && <div className="settings-panel"><div className="settings-label"><span>OCR language</span><span className="settings-hint">English (eng)</span></div><p>This browser OCR engine currently recognizes English only. First use requires a network connection to fetch the engine and language data. Maximum {MAX_OCR_PAGES} pages per run.</p></div>}
      {tool.slug === "pdf-to-jpg" && <div className="settings-panel"><div className="settings-label"><span>Image export</span><span className="settings-hint">JPEG · 1.5× render scale</span></div><p>Exports up to {MAX_RENDER_PAGES} pages per run into a ZIP file. Larger page sizes may use substantial browser memory.</p></div>}
      {["word-to-pdf", "excel-to-pdf", "ppt-to-pdf"].includes(tool.slug) && <div className="settings-panel"><div className="settings-label"><span>Conversion notes</span><span className="settings-hint">Text-first conversion</span></div><p>These tools extract readable text from Office Open XML files and render it into a PDF. Document themes, images, charts, formulas, animations, embedded media and exact layouts are not guaranteed to carry over.</p></div>}
      {error && <div className="alert alert-error" role="alert"><AlertCircle size={18}/><span>{error}</span></div>}
      {success && <div className="alert alert-success" role="status"><CheckCircle2 size={18}/><span>{success}</span></div>}
      <div className={"process-row" + (tool.slug === "images-to-pdf" ? " image-editor-process-hidden" : "")}><div className="process-assurance"><ShieldCheck size={17}/><span>Files stay on this device</span></div><button type="button" className="button button-primary process-button" onClick={makeOutput} disabled={busy || files.length === 0}>{busy ? <><LoaderCircle size={18} className="spin"/> Working...</> : <>{tool.slug === "images-to-pdf" ? "Convert to PDF" : "Process " + tool.name} <ArrowDown size={17}/></>}</button></div>
      {outputs.length > 0 && <div className="output-card"><div className="output-icon"><CheckCircle2 size={23}/></div><div className="output-main"><h3>Processing finished</h3><p>Review the conversion notes above, then download your output.</p>{outputs.map((output) => <div className="output-file" key={output.name}><span className="output-file-icon">{output.name.endsWith(".zip") ? <FileArchive size={20}/> : <FileText size={20}/>}</span><span className="output-file-name"><strong>{output.name}</strong><small>{formatBytes(output.size)}</small></span><button className="button button-primary button-small" type="button" onClick={() => downloadBlob(output.blob, output.name)}><Download size={16}/> Download</button></div>)}</div></div>}
      <p className="file-note">{tool.slug === "images-to-pdf" ? "JPG, PNG and WebP images · 50 MB per image · Files stay on your device." : "Supported files are limited to 50 MB each. Keep this tab open until processing finishes; large PDFs can use significant memory. OCR downloads its English engine on first use."}</p>
    </div>
  </div>;
}


export function ToolWorkspace({ tool }: { tool: Tool }) {
  if (tool.slug === "images-to-pdf") return <ImageToPdfStudio />;
  return <LegacyToolWorkspace tool={tool} />;
}
