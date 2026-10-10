import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { tools } from "@/lib/tools";
import { ToolWorkspace } from "@/components/tool-workspace";
import { ImageToPdfStudio } from "@/components/image-to-pdf-studio";
import Link from "next/link";
import { ChevronRight, ShieldCheck } from "lucide-react";

export function generateStaticParams() {
  return tools.map((tool) => ({ slug: tool.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const tool = tools.find((item) => item.slug === slug);
  if (!tool) return { title: "Tool not found" };

  if (tool.slug === "images-to-pdf") {
    return {
      title: "JPG to PDF Converter",
      description: "Create a polished PDF from JPG, PNG and WebP images. Choose paper size, exact page margins and rotation, all in your browser.",
    };
  }
  return { title: tool.name, description: `${tool.description} Free online PDF tool from SajiloPDF.` };
}

function Breadcrumbs({ label }: { label: string }) {
  return <div className="breadcrumbs"><Link href="/">Home</Link><ChevronRight size={14}/><Link href="/#tools">All tools</Link><ChevronRight size={14}/><span>{label}</span></div>;
}

export default async function ToolPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tool = tools.find((item) => item.slug === slug);
  if (!tool) notFound();

  if (tool.slug === "images-to-pdf") {
    return <main className="studio-page-shell"><div className="container"><Breadcrumbs label="JPG to PDF"/><ImageToPdfStudio /></div></main>;
  }

  return <main className="workspace-page"><div className="container">
    <Breadcrumbs label={tool.name}/>
    <div className="workspace-heading"><span className="section-kicker">{tool.category.toUpperCase()}</span><h1>{tool.name}</h1><p>{tool.description}</p></div>
    {tool.available ? <ToolWorkspace tool={tool}/> : <div className="planned-panel"><div className="planned-panel-icon"><ShieldCheck size={26}/></div><span className="planned-badge large">On the roadmap</span><h2>This tool is coming soon.</h2><p>We are building each tool to do real work reliably—not just to look finished. This feature is planned for a future release.</p><Link className="button button-primary" href="/#tools">Explore available tools</Link></div>}
    <div className="workspace-note"><ShieldCheck size={18}/><p><strong>Privacy note:</strong> The available tools on this page process files locally in your browser. Files are not uploaded to a SajiloPDF server.</p></div>
  </div></main>;
}
