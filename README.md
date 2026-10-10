# SajiloPDF

SajiloPDF is an independent, browser-first toolbox for everyday PDF and document tasks. It has its own branding and implementation; it does not copy iLovePDF source code or branding.

## Tools currently available

### Organize PDFs
- Merge PDFs in chosen order
- Split a PDF by ranges and download parts in a ZIP
- Remove pages and extract selected pages
- Rotate all pages
- Add page numbers

### Optimize and OCR
- Lossless PDF stream/object recompression with QPDF WebAssembly (actual savings depend on the PDF)
- Best-effort PDF structure repair (severely damaged files may not be recoverable)
- English OCR for scanned PDFs; creates a raster-backed searchable PDF plus extracted text
- OCR currently allows up to 15 pages per run

### Convert documents
- JPG, PNG and WebP to PDF
- PDF to JPG pages in a ZIP
- PDF selectable text to DOCX
- DOCX paragraphs to a raster-rendered PDF
- XLSX worksheet cell values to a raster-rendered PDF
- PPTX slide text to landscape PDF pages
- Text-first Office conversions intentionally do not promise original layout, fonts, charts, media, formulas or animation fidelity

### Edit and protect
- Add a text overlay to a selected page or all pages
- Apply angled text watermarks
- Crop the visible page area
- Password-protect a PDF with QPDF AES-256 encryption
- Remove encryption when the correct password is supplied and the user has authorization
- Upload a PNG/JPG signature image, preview a PDF page, drag the signature to the desired position, resize it, and place it on a selected page. The result is a visible image stamp, **not** a certificate-backed cryptographic digital signature.

### Summarize
- Local extractive summary from selectable PDF text. This is a sentence-scoring heuristic, not an AI-generated summary; scanned documents should be OCR'd first.

## Important limits

- File processing happens in the browser. SajiloPDF does not upload document contents to an application server for these tools.
- QPDF WebAssembly and the English OCR engine/language data may be downloaded by the browser on first use. This downloads tooling, not the user's PDF.
- File size limit: 50 MB per file. Large files can still exceed the browser's available memory.
- PDF-to-JPG exports are limited to 35 pages per run. OCR is limited to 15 pages per run.
- Text overlays/watermarks/signature marks use standard PDF fonts and are most reliable for basic Latin/English text. They do not provide font embedding or full document editing.
- Compression is lossless; PDFs dominated by already-compressed images may not get smaller.
- Repair is best-effort and cannot restore missing content or recover every corrupted PDF.
- DOCX/XLSX/PPTX conversions extract text and render it into PDF images; original styling and embedded content can be lost. Validate any converted document before relying on it.
- OCR is English-only in this release and depends on scan clarity. The OCR PDF's invisible text layer skips words the standard font cannot encode; the accompanying TXT contains the OCR engine's full recognized output.
- Browser-side type/size checks are UX guardrails, not server-side security controls. There is no login, payment, cloud file history or server upload in this release.

## Requirements

- Node.js 20.9+ (Node.js 22 LTS recommended)
- npm

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Verify and build

```bash
npm run typecheck
npm run build
npm run start
```

## Deploy to Vercel

Connect `yadukumarshrestha/sajilopdf` on Vercel and use the Next.js preset. Set `NEXT_PUBLIC_SITE_URL` to the canonical production domain when a custom domain is configured.

## Privacy and operational notes

- The original files stay in the browser for the tools described above. Browser memory is used during processing; closing/reloading the tab clears app-held file data.
- OCR and QPDF may fetch their engine assets from their package/CDN locations. PDF/document contents are processed on-device by the tool code.
- Before adding analytics, login, cloud storage, ads, AI APIs or server uploads, update the privacy notice to match the actual data flows.
- Before production-scale use, add browser automation and sample-file regression tests for every tool, track dependency updates, and run the tools on malformed, password-protected and large documents.

## Project structure

- `app/`: Next.js App Router pages, metadata and styles
- `components/tool-workspace.tsx`: browser-side document processing UI
- `lib/tools.ts`: tool catalog and capabilities
- `lib/format.ts`: file size formatting
- `public/favicon.svg`: SajiloPDF favicon
