import { Files, Scissors, Trash2, Copy, RotateCw, Hash, Image as ImageIcon, Shrink, Wrench, ScanText, FileType, FileImage, FileSpreadsheet, Presentation, Pencil, Stamp, Crop, LockKeyhole, LockKeyholeOpen, Signature, Sparkles, FileText, type LucideProps } from "lucide-react";
import type { ComponentType } from "react";

const iconMap: Record<string, ComponentType<LucideProps>> = {
  merge: Files, split: Scissors, remove: Trash2, extract: Copy, rotate: RotateCw, numbers: Hash, image: ImageIcon,
  compress: Shrink, repair: Wrench, ocr: ScanText, word: FileType, "pdf-to-jpg": FileImage, excel: FileSpreadsheet,
  slides: Presentation, edit: Pencil, watermark: Stamp, crop: Crop, lock: LockKeyhole, unlock: LockKeyholeOpen,
  signature: Signature, sparkles: Sparkles,
};
export function ToolIcon({ name, size = 22 }: { name: string; size?: number }) {
  const Icon = iconMap[name] ?? FileText;
  return <Icon size={size} strokeWidth={1.9} aria-hidden="true"/>;
}
