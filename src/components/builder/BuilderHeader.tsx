"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAppBuilder } from "@/context/AppBuilderContext";
import { useAuth } from "@/context/AuthContext";
import { Button, IconButton } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/FormControls";
import { ShareModal } from "./ShareModal";
import { DiscussAiModal } from "./DiscussAiModal";
import { AppIcon } from "@/components/ui/AppIcon";
import { ExternalLink, ArrowLeft, Check, Undo2, Redo2, Share2, Rocket, Loader2, AlertTriangle, ShieldAlert, MessageSquare } from "lucide-react";
import { getLiveAppUrl, getBuilderUrl } from "@/lib/utils/routes";

export const BuilderHeader: React.FC = () => {
  const { currentApp, isDirty, saving, lastSavedText, canUndo, canRedo, undo, redo, publish, healthIssues, updateCurrentApp } = useAppBuilder();
  const { user } = useAuth();
  const router = useRouter();
  const [shareOpen, setShareOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [discussOpen, setDiscussOpen] = useState(false);

  if (!currentApp) return null;
  const errors = healthIssues.filter((i) => i.severity === "error").length;
  const warnings = healthIssues.filter((i) => i.severity === "warning").length;
  const accent = currentApp.settings?.accentColor || "#2563eb";

  return (
    <header className="h-14 border-b border-slate-200 bg-white px-4 flex items-center justify-between sticky top-0 z-30 shadow-2xs gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <Link href="/builder" className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg" title="Back to applications"><ArrowLeft className="w-4 h-4" /></Link>
        <div className="h-4 w-px bg-slate-200" />
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-md flex items-center justify-center text-white shadow-2xs text-sm shrink-0" style={{ background: accent }}><AppIcon icon={currentApp.settings?.icon} name={currentApp.name} size={15} /></div>
          <div className="flex items-baseline gap-2 min-w-0">
            <h1 className="text-sm font-semibold text-slate-900 truncate">{currentApp.name}</h1>
            <span className="text-[11px] font-mono px-1.5 py-0.5 rounded-sm bg-slate-100 text-slate-500 border border-slate-200 hidden md:inline">/{currentApp.linkName}</span>
          </div>
        </div>
        <div className="hidden lg:flex items-center gap-0.5 ml-2">
          <IconButton onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)"><Undo2 className="w-4 h-4" /></IconButton>
          <IconButton onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Y)"><Redo2 className="w-4 h-4" /></IconButton>
        </div>
      </div>

      <div className="flex items-center gap-2 md:gap-3">
        <div className="hidden md:flex items-center gap-2 text-xs">
          {saving ? (
            <span className="flex items-center gap-1.5 text-slate-500 font-medium bg-slate-50 px-2.5 py-1 rounded-full border border-slate-200"><Loader2 className="w-3.5 h-3.5 animate-spin" />Saving…</span>
          ) : isDirty ? (
            <span className="flex items-center gap-1.5 text-amber-600 font-medium bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200"><span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />Unsaved</span>
          ) : (
            <span className="flex items-center gap-1.5 text-emerald-600 font-medium bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200"><Check className="w-3.5 h-3.5" />{lastSavedText}</span>
          )}
          {(errors > 0 || warnings > 0) && (
            <button type="button" onClick={() => router.push(getBuilderUrl(currentApp.linkName, { tab: "health" }))} className={`flex items-center gap-1.5 font-medium px-2.5 py-1 rounded-full border ${errors ? "text-rose-700 bg-rose-50 border-rose-200" : "text-amber-700 bg-amber-50 border-amber-200"}`} title="Open health check">
              {errors ? <ShieldAlert className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}{errors ? `${errors} error${errors > 1 ? "s" : ""}` : `${warnings} warning${warnings > 1 ? "s" : ""}`}
            </button>
          )}
        </div>

        <Button variant="outline" size="sm" onClick={() => setDiscussOpen(true)} icon={<MessageSquare className="w-3.5 h-3.5 text-indigo-600" />} title="Ask what is possible and let AI do it"><span className="hidden md:inline">Discuss with AI</span><span className="md:hidden">AI</span></Button>
        <Button variant="outline" size="sm" onClick={() => setShareOpen(true)} icon={<Share2 className="w-3.5 h-3.5 text-slate-500" />}>Share<span className="hidden md:inline">&nbsp;· {currentApp.members.length}</span></Button>
        <Link href={getLiveAppUrl(currentApp.linkName)} target="_blank" rel="noopener noreferrer"><Button variant="outline" size="sm" icon={<ExternalLink className="w-3.5 h-3.5 text-slate-500" />}><span className="hidden md:inline">Preview</span></Button></Link>
        <Button variant="primary" size="sm" onClick={() => setPublishOpen(true)} icon={<Rocket className="w-3.5 h-3.5" />} title="Publish a version members will use">Publish{currentApp.publishedVersion ? <span className="hidden md:inline text-white/70">&nbsp;v{currentApp.publishedVersion}</span> : null}</Button>
      </div>

      {shareOpen && <ShareModal app={currentApp} onClose={() => setShareOpen(false)} onChange={(next) => updateCurrentApp(() => next, { skipHistory: true })} />}
      <DiscussAiModal isOpen={discussOpen} onClose={() => setDiscussOpen(false)} app={currentApp} audience="owner" />

      <Modal isOpen={publishOpen} onClose={() => setPublishOpen(false)} title="Publish application" description="Members always use the latest published version. Your draft stays editable; you can roll back any time from Versions." maxWidth="md" icon={<Rocket className="w-4 h-4" />}
        footer={<><Button variant="outline" onClick={() => setPublishOpen(false)}>Cancel</Button><Button loading={publishing} onClick={async () => { setPublishing(true); await publish(label.trim() || undefined); setPublishing(false); setPublishOpen(false); setLabel(""); }}>Publish v{(currentApp.publishedVersion || 0) + 1}</Button></>}>
        <div className="space-y-3">
          <Input label="Version label (optional)" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Added GRN form & stock ledger" />
          {errors > 0 && <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3 flex items-start gap-2"><ShieldAlert className="w-4 h-4 shrink-0" />Health check found {errors} error(s). You can still publish, but broken lookups or scripts may fail for users.</div>}
          <p className="text-[11px] text-slate-500">Publishing by <span className="font-semibold">{user?.email}</span>. Records are shared between draft and published versions.</p>
        </div>
      </Modal>
    </header>
  );
};
