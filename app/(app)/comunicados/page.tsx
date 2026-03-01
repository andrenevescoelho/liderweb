"use client";

import { FormEvent, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Megaphone, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SessionUser } from "@/lib/types";
import { MAX_MESSAGE_LENGTH } from "@/lib/messages";

interface BroadcastItem {
  id: string;
  senderRole: string;
  content: string;
  createdAt: string;
  sender: {
    id: string;
    name: string;
  };
}

export default function ComunicadosPage() {
  const { data: session } = useSession();
  const user = session?.user as SessionUser | undefined;
  const groupId = user?.groupId;
  const canSend = user?.role === "ADMIN" || user?.role === "SUPERADMIN";

  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [items, setItems] = useState<BroadcastItem[]>([]);

  const loadBroadcasts = async (cursor?: string | null) => {
    if (!groupId) return;

    setError("");

    const params = new URLSearchParams();
    params.set("take", "20");
    if (cursor) params.set("cursor", cursor);

    const response = await fetch(`/api/groups/${groupId}/broadcasts?${params.toString()}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data?.error || "Erro ao carregar comunicados");
    }

    setItems((prev) => (cursor ? [...prev, ...(data.items ?? [])] : data.items ?? []));
    setNextCursor(data.nextCursor ?? null);
  };

  useEffect(() => {
    const fetchInitial = async () => {
      if (!groupId) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        await loadBroadcasts();
      } catch (err: any) {
        setError(err.message || "Erro ao carregar comunicados");
      } finally {
        setLoading(false);
      }
    };

    fetchInitial();
  }, [groupId]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!groupId || !canSend || sending) return;

    setSending(true);
    setError("");

    try {
      const response = await fetch(`/api/groups/${groupId}/broadcasts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Erro ao enviar comunicado");
      }

      setItems((prev) => [data, ...prev]);
      setContent("");
    } catch (err: any) {
      setError(err.message || "Erro ao enviar comunicado");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Megaphone className="w-8 h-8 text-indigo-600" />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Comunicados</h1>
      </div>

      {canSend && (
        <form onSubmit={handleSubmit} className="rounded-xl border bg-white dark:bg-slate-900 p-4 space-y-3">
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            maxLength={MAX_MESSAGE_LENGTH}
            placeholder="Escreva um comunicado para todo o grupo..."
            className="min-h-[120px]"
          />
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">{content.length}/{MAX_MESSAGE_LENGTH}</span>
            <Button type="submit" disabled={sending || !content.trim()}>
              <Send className="w-4 h-4 mr-2" />
              {sending ? "Enviando..." : "Enviar comunicado"}
            </Button>
          </div>
        </form>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}

      <section className="space-y-3">
        {loading && <p className="text-sm text-slate-500">Carregando comunicados...</p>}

        {!loading && items.length === 0 && (
          <div className="rounded-xl border p-6 text-center text-slate-500">Nenhum comunicado publicado.</div>
        )}

        {items.map((broadcast) => (
          <article key={broadcast.id} className="rounded-xl border bg-white dark:bg-slate-900 p-4">
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="font-semibold text-slate-900 dark:text-slate-100">
                {broadcast.sender.name} <span className="text-xs text-slate-500">({broadcast.senderRole})</span>
              </p>
              <time className="text-xs text-slate-500">
                {new Date(broadcast.createdAt).toLocaleString("pt-BR")}
              </time>
            </div>
            <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{broadcast.content}</p>
          </article>
        ))}

        {nextCursor && (
          <div className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => loadBroadcasts(nextCursor)}
            >
              Carregar mais
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
