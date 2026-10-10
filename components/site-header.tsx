"use client";
import Link from "next/link";
import { useState } from "react";
import { FileText, Menu, X, ArrowUpRight } from "lucide-react";

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  return <header className="site-header"><div className="container header-inner">
    <Link className="brand" href="/" aria-label="SajiloPDF home"><span className="brand-mark"><FileText size={21} strokeWidth={2.3}/></span><span>Sajilo<span className="brand-accent">PDF</span></span></Link>
    <nav className={`main-nav ${open ? "nav-open" : ""}`} aria-label="Main navigation"><Link href="/#tools" onClick={() => setOpen(false)}>All tools</Link><Link href="/#how-it-works" onClick={() => setOpen(false)}>How it works</Link><Link href="/about" onClick={() => setOpen(false)}>About</Link><Link className="nav-mobile-cta" href="/#tools" onClick={() => setOpen(false)}>Explore tools <ArrowUpRight size={16}/></Link></nav>
    <Link className="header-cta" href="/#tools">Explore tools <ArrowUpRight size={16}/></Link>
    <button className="mobile-menu" aria-label={open ? "Close menu" : "Open menu"} onClick={() => setOpen(!open)}>{open ? <X size={22}/> : <Menu size={22}/>}</button>
  </div></header>;
}
