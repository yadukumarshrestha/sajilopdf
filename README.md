# SajiloPDF

A browser-first, Next.js PDF toolbox starter with an original SajiloPDF brand and responsive UI. This project does not copy iLovePDF's code, logo, or branding; it builds similar core functionality independently.

## What's functional in this first milestone

- **Merge PDF** — merge two or more PDFs in selected order.
- **Split PDF** — split by page ranges and download each part in a ZIP.
- **Remove pages** — delete selected pages from a PDF.
- **Extract pages** — save selected pages as a new PDF.
- **Rotate PDF** — rotate all pages by 90°, 180°, or 270° clockwise.
- **Add page numbers** — add a small page number to each page.
- **JPG to PDF** — combine JPG, PNG, and WebP images into one A4 PDF.
- Responsive homepage, tool search and category filters, SEO metadata, privacy/about pages, and a roadmap catalog for future tools.

Tools marked **Planned** are intentionally not advertised as working yet. Each current tool processes documents locally in the browser. This release has a 50 MB per-file limit. It has no login, payment, cloud history or server-side processing.

## Requirements

- Node.js 20.9+ (Node.js 22 LTS recommended)
- npm

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000.

## Production build

```bash
npm run build
npm run start
```

## Deploy to Vercel

Import this folder as a new Git repository in Vercel or connect your GitHub repository. Use the default Next.js framework preset and Node.js 22.x. No environment variables are required for file processing in this milestone. Set `NEXT_PUBLIC_SITE_URL` to your real domain before production launch to generate correct canonical metadata.

## Roadmap

1. PDF rendering and image export with PDF.js.
2. Compression, repair, PDF/A and OCR using a dedicated worker/service where appropriate.
3. Word/Excel/PowerPoint conversions using a server worker with LibreOffice; verify output fidelity.
4. Editor, watermark, crop and form workflows.
5. Password-protect/unlock support with properly maintained encryption tooling.
6. Optional accounts, quotas, queue, abuse controls, temporary storage and payments.
7. Per-tool limits, privacy disclosures, automated tests and production monitoring.

## Security and privacy notes

- Current file processing happens in the browser; files are not uploaded to a SajiloPDF application server by these tools.
- File types are checked in the browser and file size is capped at 50 MB per file. These checks are UX guardrails, not a substitute for server-side validation if server upload is added later.
- Do not add a server endpoint for document uploads without file signature validation, resource/time limits, malware/abuse protections, and documented deletion behavior.
- Before adding analytics, auth, ads, AI or server-side tools, update the privacy notice to match actual behavior.

## Project structure

```text
app/                   App Router pages, metadata, and global styles
components/             Site header, tool cards, icons, and file-processing UI
lib/tools.ts            Tool catalog and current feature flags
lib/format.ts           File-size formatting
public/favicon.svg      SajiloPDF icon
```
