export type Tool = {
  slug: string;
  name: string;
  description: string;
  category: "Organize PDF" | "Optimize PDF" | "Convert PDF" | "Edit PDF" | "PDF Security" | "AI PDF";
  icon: string;
  available: boolean;
  badge?: string;
};

export const tools: Tool[] = [
  { slug: "merge-pdf", name: "Merge PDF", description: "Combine multiple PDFs into one file in the order you choose.", category: "Organize PDF", icon: "merge", available: true },
  { slug: "split-pdf", name: "Split PDF", description: "Separate a PDF into smaller documents using page ranges.", category: "Organize PDF", icon: "split", available: true },
  { slug: "remove-pages", name: "Remove pages", description: "Delete selected pages from a PDF document.", category: "Organize PDF", icon: "remove", available: true },
  { slug: "extract-pages", name: "Extract pages", description: "Save selected pages as a separate PDF.", category: "Organize PDF", icon: "extract", available: true },
  { slug: "rotate-pdf", name: "Rotate PDF", description: "Rotate every page clockwise by 90°, 180° or 270°.", category: "Organize PDF", icon: "rotate", available: true },
  { slug: "page-numbers", name: "Add page numbers", description: "Add page numbers to each page of your PDF.", category: "Edit PDF", icon: "numbers", available: true },
  { slug: "images-to-pdf", name: "JPG to PDF", description: "Convert JPG, PNG or WebP images to PDF with page orientation, paper size, margins, image previews, 90° rotation and remove controls. Merge all images into one PDF or export them separately.", category: "Convert PDF", icon: "image", available: true },
  { slug: "compress-pdf", name: "Compress PDF", description: "Losslessly recompress PDF streams and document objects.", category: "Optimize PDF", icon: "compress", available: true },
  { slug: "repair-pdf", name: "Repair PDF", description: "Try to rebuild PDF structure when cross-reference data is damaged.", category: "Optimize PDF", icon: "repair", available: true },
  { slug: "ocr-pdf", name: "OCR PDF", description: "Recognize English text in scanned PDF pages and create a searchable PDF plus text file.", category: "Optimize PDF", icon: "ocr", available: true },
  { slug: "pdf-to-word", name: "PDF to Word", description: "Extract selectable PDF text into an editable Word document.", category: "Convert PDF", icon: "word", available: true },
  { slug: "word-to-pdf", name: "Word to PDF", description: "Convert DOCX paragraph text into a PDF. Complex layout and embedded media may not be preserved.", category: "Convert PDF", icon: "word", available: true },
  { slug: "pdf-to-jpg", name: "PDF to JPG", description: "Render each PDF page as a JPG image and download them together.", category: "Convert PDF", icon: "image", available: true },
  { slug: "excel-to-pdf", name: "Excel to PDF", description: "Convert worksheet cell values into a readable PDF; workbook styling may not be preserved.", category: "Convert PDF", icon: "excel", available: true },
  { slug: "ppt-to-pdf", name: "PowerPoint to PDF", description: "Convert slide text to PDF pages; original slide designs and embedded media may not be preserved.", category: "Convert PDF", icon: "slides", available: true },
  { slug: "edit-pdf", name: "Edit PDF", description: "Add a text overlay to every page or a chosen page of a PDF.", category: "Edit PDF", icon: "edit", available: true },
  { slug: "watermark-pdf", name: "Watermark PDF", description: "Place a semi-transparent text watermark over PDF pages.", category: "Edit PDF", icon: "watermark", available: true },
  { slug: "crop-pdf", name: "Crop PDF", description: "Crop the visible page area by a selected margin.", category: "Edit PDF", icon: "crop", available: true },
  { slug: "protect-pdf", name: "Protect PDF", description: "Encrypt a PDF with an open password using QPDF in WebAssembly.", category: "PDF Security", icon: "lock", available: true },
  { slug: "unlock-pdf", name: "Unlock PDF", description: "Remove PDF encryption when you know a valid password.", category: "PDF Security", icon: "unlock", available: true },
  { slug: "sign-pdf", name: "Sign PDF", description: "Upload a PNG/JPG signature, preview a PDF page, and drag the signature to the desired position. This is a visible image stamp, not a certificate-backed digital signature.", category: "PDF Security", icon: "signature", available: true },
  { slug: "summarize-pdf", name: "Summarize PDF", description: "Create a local extractive summary from selectable PDF text without sending the file to an AI service.", category: "AI PDF", icon: "sparkles", available: true },
];

export const categories = ["All tools", "Organize PDF", "Optimize PDF", "Convert PDF", "Edit PDF", "PDF Security", "AI PDF"] as const;
export const activeToolSlugs = tools.filter((tool) => tool.available).map((tool) => tool.slug);
