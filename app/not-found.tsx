import Link from "next/link";
export default function NotFound() { return <main className="simple-page"><div className="container simple-page-inner"><span className="section-kicker">404 · NOT FOUND</span><h1>That page isn't here.</h1><p>Let's get you back to the PDF toolbox.</p><Link className="button button-primary" href="/">Back to home</Link></div></main>; }
