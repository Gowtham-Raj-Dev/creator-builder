"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AiChat, AiChatKind, AiChatMessage } from "@/types/schema";
import { storageService } from "@/lib/storage/firestoreProvider";
import { generateId } from "@/lib/utils/idGenerator";

const now = () => new Date().toISOString();

/** A title from the first prompt: first sentence-ish, max 48 chars. */
export function titleFromPrompt(prompt: string): string {
  const t = prompt.replace(/\s+/g, " ").trim();
  if (!t) return "New chat";
  const cut = t.split(/[.?!\n]/)[0].trim() || t;
  return cut.length > 48 ? cut.slice(0, 47).trimEnd() + "…" : cut;
}

/** What a generator reports back so its turn lands in the chat history. */
export interface AiLogEvent {
  /** id of the assistant message; pass the same id later to update its status */
  id: string;
  /** present on a new turn (user prompt + assistant reply) */
  prompt?: string;
  reply?: string;
  status?: AiChatMessage["status"];
  link?: string;
}

/**
 * Chat histories of one app, one list per tool kind. Loaded once, edited locally, persisted per change.
 * Persistence is best-effort — the UI never waits on Firestore.
 */
export function useAiChats(appId: string | undefined, userEmail?: string | null) {
  const [chats, setChats] = useState<AiChat[]>([]);
  const [loaded, setLoaded] = useState(false);
  const pending = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    let on = true;
    setLoaded(false);
    if (!appId) { setChats([]); return; }
    storageService.listAiChats(appId).then((list) => { if (on) { setChats(list); setLoaded(true); } }).catch(() => { if (on) setLoaded(true); });
    return () => { on = false; };
  }, [appId]);

  /** Save a chat shortly after it changes (coalesces rapid edits such as streamed replies). */
  const persist = useCallback((chat: AiChat) => {
    const prev = pending.current.get(chat.id);
    if (prev) clearTimeout(prev);
    pending.current.set(chat.id, setTimeout(() => { pending.current.delete(chat.id); storageService.saveAiChat(chat).catch((e) => console.warn("AI chat save failed", e)); }, 400));
  }, []);

  const update = useCallback((chatId: string, fn: (c: AiChat) => AiChat) => {
    setChats((prev) => prev.map((c) => {
      if (c.id !== chatId) return c;
      const next = { ...fn(c), updatedAt: now() };
      persist(next);
      return next;
    }));
  }, [persist]);

  const create = useCallback((kind: AiChatKind, title?: string): AiChat => {
    const chat: AiChat = { id: generateId("chat"), appId: appId || "", kind, title: title || "New chat", messages: [], createdAt: now(), updatedAt: now(), createdBy: userEmail || undefined };
    setChats((prev) => [chat, ...prev]);
    persist(chat);
    return chat;
  }, [appId, userEmail, persist]);

  const rename = useCallback((chatId: string, title: string) => update(chatId, (c) => ({ ...c, title: title.trim() || c.title })), [update]);

  const remove = useCallback((chatId: string) => {
    setChats((prev) => prev.filter((c) => c.id !== chatId));
    const t = pending.current.get(chatId);
    if (t) { clearTimeout(t); pending.current.delete(chatId); }
    if (appId) storageService.deleteAiChat(appId, chatId).catch((e) => console.warn("AI chat delete failed", e));
  }, [appId]);

  /** Append a user + assistant pair (or just an assistant message) and auto-title an untitled chat. */
  const append = useCallback((chatId: string, msgs: Array<Omit<AiChatMessage, "at"> & { at?: string }>) => {
    update(chatId, (c) => {
      const first = msgs.find((m) => m.role === "user");
      const title = c.title === "New chat" && first ? titleFromPrompt(first.text) : c.title;
      return { ...c, title, messages: [...c.messages, ...msgs.map((m) => ({ ...m, at: m.at || now() }))] };
    });
  }, [update]);

  const patchMessage = useCallback((chatId: string, msgId: string, patch: Partial<AiChatMessage>) => {
    update(chatId, (c) => ({ ...c, messages: c.messages.map((m) => (m.id === msgId ? { ...m, ...patch } : m)) }));
  }, [update]);

  return { chats, loaded, create, rename, remove, append, patchMessage, update };
}
