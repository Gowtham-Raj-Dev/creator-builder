"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { Icon } from "@/components/ui/IconPicker";
import { DOCS, DocBlock } from "@/lib/docs/reference";
import { Layers, Search, LogIn, ArrowRight, Copy, Check, Info, AlertTriangle, Lightbulb, Menu, X, Home } from "lucide-react";

const CodeBlock: React.FC<{ block: DocBlock }> = ({ block }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(block.code || ""); setCopied(true); setTimeout(() => setCopied(false), 1200); } catch { /* ignore */ } };
  return (
    <div className="rounded-xl overflow-hidden border border-slate-800 bg-slate-950 text-slate-100 my-3">
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900 border-b border-slate-800">
        <span className="text-[11px] font-semibold text-slate-300">{block.title || (block.lang === "js" ? "JavaScript" : "Expression")}</span>
        <button type="button" onClick={copy} className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1">{copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}{copied ? "Copied" : "Copy"}</button>
      </div>
      <pre className="p-3 text-[12px] leading-relaxed overflow-x-auto font-mono whitespace-pre">{block.code}</pre>
    </div>
  );
};

const Block: React.FC<{ block: DocBlock }> = ({ block }) => {
  switch (block.kind) {
    case "p": return <p className="text-sm text-slate-700 leading-relaxed my-2">{block.text}</p>;
    case "note": {
      const tone = block.tone === "warn" ? "bg-amber-50 border-amber-200 text-amber-900" : block.tone === "tip" ? "bg-emerald-50 border-emerald-200 text-emerald-900" : "bg-blue-50 border-blue-200 text-blue-900";
      const I = block.tone === "warn" ? AlertTriangle : block.tone === "tip" ? Lightbulb : Info;
      return <div className={`my-3 rounded-lg border px-3.5 py-2.5 text-xs leading-relaxed flex gap-2 ${tone}`}><I className="w-4 h-4 shrink-0 mt-0.5" /><span>{block.text}</span></div>;
    }
    case "code": return <CodeBlock block={block} />;
    case "steps": return <ol className="my-3 space-y-2">{(block.items || []).map((s, i) => <li key={i} className="flex gap-3 text-sm text-slate-700"><span className="w-6 h-6 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0">{i + 1}</span><span className="leading-relaxed">{s}</span></li>)}</ol>;
    case "list": return <ul className="my-3 space-y-1.5 list-disc pl-5 text-sm text-slate-700">{(block.items || []).map((s, i) => <li key={i} className="leading-relaxed">{s}</li>)}</ul>;
    case "table": return (
      <div className="my-3 overflow-x-auto rounded-xl border border-slate-200">
        {block.title && <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-500 bg-slate-50 border-b border-slate-200">{block.title}</div>}
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-600 border-b border-slate-200"><tr>{(block.headers || []).map((h) => <th key={h} className="px-3 py-2 text-left font-semibold whitespace-nowrap">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100">{(block.rows || []).map((r, i) => <tr key={i} className="align-top hover:bg-slate-50/70">{r.map((c, j) => <td key={j} className={`px-3 py-2 leading-relaxed ${j === 0 ? "font-semibold text-slate-900 whitespace-nowrap" : "text-slate-700"} ${/[(){}=<>"`]|\.\w+\(/.test(c) && j === 1 ? "font-mono text-[11px] text-indigo-800" : ""}`}>{c}</td>)}</tr>)}</tbody>
        </table>
      </div>
    );
    default: return null;
  }
};

export default function DocsPage() {
  const { user, loading, isOwner } = useAuth();
  const [q, setQ] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const workspace = isOwner ? "/builder" : "/app";

  // simple full-text filter over topics
  const chapters = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return DOCS;
    const hit = (b: DocBlock) => [b.text, b.title, b.code, ...(b.items || []), ...(b.headers || []), ...(b.rows || []).flat()].some((x) => x && x.toLowerCase().includes(s));
    return DOCS.map((c) => ({ ...c, topics: c.topics.filter((t) => t.title.toLowerCase().includes(s) || t.blocks.some(hit)) })).filter((c) => c.topics.length);
  }, [q]);

  const nav = (
    <nav className="space-y-4 text-xs">
      {chapters.map((c) => (
        <div key={c.id}>
          <a href={`#${c.id}`} onClick={() => setMenuOpen(false)} className="flex items-center gap-2 font-bold text-slate-900 hover:text-blue-700"><Icon name={c.icon} className="w-3.5 h-3.5 text-blue-600" />{c.title}</a>
          <ul className="mt-1 ml-5 space-y-0.5 border-l border-slate-200">{c.topics.map((t) => <li key={t.id}><a href={`#${t.id}`} onClick={() => setMenuOpen(false)} className="block pl-3 py-0.5 text-slate-600 hover:text-blue-700 hover:border-l-2 hover:border-blue-500 -ml-px">{t.title}</a></li>)}</ul>
        </div>
      ))}
      {chapters.length === 0 && <p className="text-slate-400">No matches.</p>}
    </nav>
  );

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-[1400px] mx-auto px-6 xl:px-10 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <Link href="/" className="flex items-center gap-2.5 shrink-0"><span className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white"><Layers className="w-5 h-5" /></span><span className="whitespace-nowrap"><span className="block text-sm font-bold tracking-tight">YourBuilder</span><span className="hidden md:block text-[10px] text-slate-400 -mt-0.5">Documentation</span></span></Link>
            <div className="relative hidden sm:block"><Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search docs… (e.g. increment, aging, required-if)" className="w-72 lg:w-96 text-xs pl-9 pr-3 py-2 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/25" /></div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link href="/" className="hidden md:inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 px-3 py-2 rounded-lg hover:bg-slate-100"><Home className="w-3.5 h-3.5" /> Home</Link>
            {!loading && user ? <Link href={workspace} className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg">Open workspace <ArrowRight className="w-3.5 h-3.5" /></Link> : <Link href="/login" className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg"><LogIn className="w-3.5 h-3.5" /> Sign in</Link>}
            <button type="button" onClick={() => setMenuOpen((o) => !o)} className="lg:hidden p-2 rounded-lg hover:bg-slate-100">{menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}</button>
          </div>
        </div>
        {menuOpen && <div className="lg:hidden border-t border-slate-100 bg-white px-6 py-4 max-h-[70vh] overflow-y-auto"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search docs…" className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg mb-3" />{nav}</div>}
      </header>

      <div className="max-w-[1400px] mx-auto px-6 xl:px-10 grid lg:grid-cols-[260px_1fr] gap-10 py-10">
        <aside className="hidden lg:block"><div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto pr-3">{nav}</div></aside>

        <main className="min-w-0 space-y-16">
          <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-8">
            <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-blue-600">Documentation</div>
            <h1 className="text-3xl font-extrabold tracking-tight mt-2">What to do — and what happens</h1>
            <p className="text-sm text-slate-600 mt-3 max-w-3xl leading-relaxed">Every field, report view, widget, trigger and script function of the builder, with the exact setting to change and the result you get. Code samples are copy-paste ready — the function tables are generated from the engine itself, so they always match what runs.</p>
            <div className="flex flex-wrap gap-2 mt-5">{DOCS.map((c) => <a key={c.id} href={`#${c.id}`} className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-white border border-slate-200 hover:border-blue-300 hover:text-blue-700"><Icon name={c.icon} className="w-3.5 h-3.5 text-blue-600" />{c.title}</a>)}</div>
          </div>

          {chapters.map((c) => (
            <section key={c.id} id={c.id} className="scroll-mt-24">
              <div className="flex items-start gap-3 border-b border-slate-200 pb-4 mb-6">
                <span className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0"><Icon name={c.icon} className="w-5 h-5" /></span>
                <div><h2 className="text-2xl font-bold tracking-tight">{c.title}</h2><p className="text-sm text-slate-500 mt-0.5">{c.summary}</p></div>
              </div>
              <div className="space-y-10">
                {c.topics.map((t) => (
                  <article key={t.id} id={t.id} className="scroll-mt-24">
                    <h3 className="text-lg font-bold text-slate-900 mb-1 flex items-center gap-2"><span className="w-1.5 h-5 rounded-full bg-blue-600" />{t.title}</h3>
                    {t.blocks.map((b, i) => <Block key={i} block={b} />)}
                  </article>
                ))}
              </div>
            </section>
          ))}
          {chapters.length === 0 && <div className="text-center text-slate-400 py-20 text-sm">Nothing matches “{q}”.</div>}
        </main>
      </div>

      <footer className="border-t border-slate-200 text-xs text-slate-500">
        <div className="max-w-[1400px] mx-auto px-6 xl:px-10 py-6 flex flex-col sm:flex-row items-center justify-between gap-2"><span>© {new Date().getFullYear()} YourBuilder · Documentation</span><span className="flex gap-4"><Link href="/" className="hover:text-slate-900">Home</Link><Link href="/login" className="hover:text-slate-900">Sign in</Link></span></div>
      </footer>
    </div>
  );
}
