import type { Metadata } from "next";
import "./globals.css";
import type { ReactNode } from "react";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: { default: "SajiloPDF — Free online PDF tools", template: "%s | SajiloPDF" },
  description: "Simple, useful PDF tools. Merge, split, rotate, extract pages and convert images to PDF right in your browser.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://sajilopdf.vercel.app"),
  applicationName: "SajiloPDF",
  keywords: ["PDF tools", "merge PDF", "split PDF", "compress PDF", "PDF converter", "free PDF tools"],
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="en"><body><SiteHeader />{children}<footer className="site-footer"><div className="container footer-inner"><a className="brand footer-brand" href="/" aria-label="SajiloPDF home"><span className="brand-mark">S</span><span>Sajilo<span className="brand-accent">PDF</span></span></a><p>Useful PDF tools, made simple.</p><div className="footer-links"><a href="/#tools">All tools</a><a href="/privacy">Privacy</a><a href="/about">About</a></div><span className="copyright">© {new Date().getFullYear()} SajiloPDF</span></div></footer></body></html>;
}
