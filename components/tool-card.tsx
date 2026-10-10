import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { Tool } from "@/lib/tools";
import { ToolIcon } from "@/components/tool-icon";

export function ToolCard({ tool }: { tool: Tool }) {
  return <Link href={`/tools/${tool.slug}`} className={`tool-card ${!tool.available ? "tool-card-planned" : ""}`}>
    <span className={`tool-icon icon-${tool.icon}`}><ToolIcon name={tool.icon} size={22}/></span>
    <span className="tool-card-copy"><span className="tool-card-title">{tool.name}{tool.badge && <span className="planned-badge">{tool.badge}</span>}</span><span className="tool-card-description">{tool.description}</span></span>
    <span className="tool-card-arrow"><ArrowUpRight size={17}/></span>
  </Link>;
}
