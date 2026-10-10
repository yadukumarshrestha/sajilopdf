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
  { slug: "split-pdf", name: "Split PDF", description: "Separate one PDF into smaller files by page range.", category: "Organize PDF", icon: "split", available: true },
  { slug: "remove-pages", name: "Remove pages", description: "Delete unwanted pages from a PDF document.", category: "Organize PDF", icon: "remove", available: true },
  { slug: "extract-pages", name: "Extract pages", description: "Save selected pages as a new PDF.", category: "Organize PDF", icon: "extract", available: true },
  { slug: "rotate-pdf", name: "Rotate PDF", description: "Rotate every page to the correct orientation.", category: "Organize PDF", icon: "rotate", available: true },
  { slug: "page-numbers", name: "Add page numbers", description: "Add clean page numbers to your document.", category: "Edit PDF", icon: "numbers", available: true },
  { slug: "images-to-pdf", name: "JPG to PDF", description: "Turn JPG, PNG or WebP images into one PDF.", category: "Convert PDF", icon: "image", available: true },
  { slug: "compress-pdf", name: "Compress PDF", description: "Reduce PDF file size while balancing quality.", category: "Optimize PDF", icon: "compress", available: false, badge: "Planned" },
  { slug: "repair-pdf", name: "Repair PDF", description: "Try to recover data from a damaged PDF.", category: "Optimize PDF", icon: "repair", available: false, badge: "Planned" },
  { slug: "ocr-pdf", name: "OCR PDF", description: "Make scanned documents searchable and selectable.", category: "Optimize PDF", icon: "ocr", available: false, badge: "Planned" },
  { slug: "pdf-to-word", name: "PDF to Word", description: "Convert PDF content to an editable Word document.", category: "Convert PDF", icon: "word", available: false, badge: "Planned" },
  { slug: "word-to-pdf", name: "Word to PDF", description: "Convert Word documents into PDF format.", category: "Convert PDF", icon: "word", available: false, badge: "Planned" },
  { slug: "pdf-to-jpg", name: "PDF to JPG", description: "Export PDF pages as image files.", category: "Convert PDF", icon: "image", available: false, badge: "Planned" },
  { slug: "excel-to-pdf", name: "Excel to PDF", description: "Convert spreadsheets to shareable PDF documents.", category: "Convert PDF", icon: "excel", available: false, badge: "Planned" },
  { slug: "ppt-to-pdf", name: "PowerPoint to PDF", description: "Convert presentations into PDF documents.", category: "Convert PDF", icon: "slides", available: false, badge: "Planned" },
  { slug: "edit-pdf", name: "Edit PDF", description: "Add text, shapes and annotations to a PDF.", category: "Edit PDF", icon: "edit", available: false, badge: "Planned" },
  { slug: "watermark-pdf", name: "Watermark PDF", description: "Place a text watermark on every page.", category: "Edit PDF", icon: "watermark", available: false, badge: "Planned" },
  { slug: "crop-pdf", name: "Crop PDF", description: "Adjust visible page areas to fit your needs.", category: "Edit PDF", icon: "crop", available: false, badge: "Planned" },
  { slug: "protect-pdf", name: "Protect PDF", description: "Encrypt a PDF with a password.", category: "PDF Security", icon: "lock", available: false, badge: "Planned" },
  { slug: "unlock-pdf", name: "Unlock PDF", description: "Remove a password when you have permission.", category: "PDF Security", icon: "unlock", available: false, badge: "Planned" },
  { slug: "sign-pdf", name: "Sign PDF", description: "Add a signature to your document.", category: "PDF Security", icon: "signature", available: false, badge: "Planned" },
  { slug: "summarize-pdf", name: "Summarize PDF", description: "Get the key points from a long document.", category: "AI PDF", icon: "sparkles", available: false, badge: "Planned" },
];

export const categories = ["All tools", "Organize PDF", "Optimize PDF", "Convert PDF", "Edit PDF", "PDF Security", "AI PDF"] as const;
export const activeToolSlugs = tools.filter((tool) => tool.available).map((tool) => tool.slug);
