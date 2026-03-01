"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { MessageCircle, SendHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SessionUser } from "@/lib/types";
import { MAX_MESSAGE_LENGTH } from "@/lib/messages";

interface ChatItem {
  id: string;
  content: string;
  createdAt: string;
  sender: {
    id: string;
    name: string;
  };
}

export default function ChatGrupoPage() {
  const { data: session } = useSession();
  const user = session?.user as SessionUser | undefined;
  const groupId = user?.groupId;

  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [items, setItems] = useState<ChatItem[]>([]);

  const canAccess = useMemo(() => Boolean(groupId), [groupId]);

  const loadMessages = async (cursor?: string | null) => {
    if (!groupId) return;

    const params = new URLSearchParams();
    params.set("take", "30");
    if (cursor) params.set("cursor", cursor);

    const response = await fetch(`/api/groups/${groupId}/messages?${params.toString()}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data?.error || "Erro ao carregar chat");
    }

    setItems((prev) => (cursor ? [...data.items, ...prev] : data.items ?? []));
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
        await loadMessages();
      } catch (err: any) {
        setError(err.message || "Erro ao carregar chat");
      } finally {
        setLoading(false);
      }
    };

    fetchInitial();
  }, [groupId]);

  useEffect(() => {
    if (!groupId) return;

    const source = new EventSource(`/api/groups/${groupId}/messages/stream`);

    source.addEventListener("message", (event) => {
      try {
        const message = JSON.parse((event as MessageEvent).data) as ChatItem;
        setItems((prev) => {
          if (prev.some((item) => item.id === message.id)) return prev;
          return [...prev, message];
        });
      } catch {
        // noop
      }
    });

    source.onerror = () => {
      source.close();
    };

    return () => {
      source.close();
    };
  }, [groupId]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!groupId || sending) return;

    setSending(true);
    setError("");

    try {
      const response = await fetch(`/api/groups/${groupId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Erro ao enviar mensagem");
      }

      setItems((prev) => {
        if (prev.some((item) => item.id === data.id)) return prev;
        return [...prev, data];
      });
      setContent("");
    } catch (err: any) {
      setError(err.message || "Erro ao enviar mensagem");
    } finally {
      setSending(false);
    }
  };

  if (!canAccess) {
    return <p className="text-sm text-slate-500">Você precisa estar associado a um grupo para acessar o chat.</p>;
  }

  return (
    <div className="h-[calc(100vh-8rem)] rounded-xl border bg-white dark:bg-slate-900 flex flex-col overflow-hidden">
      <header className="p-4 border-b flex items-center gap-2">
        <MessageCircle className="w-5 h-5 text-cyan-600" />
        <h1 className="font-semibold">Chat do Grupo</h1>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading && <p className="text-sm text-slate-500">Carregando mensagens...</p>}
        {error && <p className="text-sm text-red-500">{error}</p>}

        {nextCursor && (
          <div className="flex justify-center">
            <Button variant="outline" onClick={() => loadMessages(nextCursor)}>
              Carregar histórico
            </Button>
          </div>
        )}

        {!loading && items.length === 0 && (
          <p className="text-sm text-slate-500 text-center">Ainda não há mensagens.</p>
        )}

        {items.map((message) => {
          const ownMessage = message.sender.id === user?.id;
          return (
            <article
              key={message.id}
              className={`max-w-[80%] rounded-xl px-3 py-2 border ${
                ownMessage
                  ? "ml-auto bg-cyan-50 border-cyan-200 dark:bg-cyan-950"
                  : "mr-auto bg-slate-50 border-slate-200 dark:bg-slate-800"
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{message.sender.name}</span>
                <time className="text-[10px] text-slate-500">{new Date(message.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</time>
              </div>
              <p className="text-sm text-slate-800 dark:text-slate-100 break-words">{message.content}</p>
            </article>
          );
        })}
      </div>

      <form onSubmit={handleSubmit} className="p-3 border-t flex items-center gap-2">
        <Input
          value={content}
          onChange={(e) => setContent(e.target.value)}
          maxLength={MAX_MESSAGE_LENGTH}
          placeholder="Digite uma mensagem..."
        />
        <Button type="submit" disabled={sending || !content.trim()}>
          <SendHorizontal className="w-4 h-4" />
          <span className="sr-only">Enviar</span>
        </Button>
      </form>
    </div>
  );
}
