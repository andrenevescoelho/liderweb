"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Heart, BookOpen, MessageCircle, HandMetal, RefreshCw, Plus, X } from "lucide-react";

const VERSES = [
  { verse: "Lança sobre o Senhor o teu peso, e ele te sustentará; nunca permitirá que o justo seja abalado.", ref: "Salmos 55:22" },
  { verse: "Não andeis ansiosos de coisa alguma; antes em tudo sejam os vossos pedidos conhecidos diante de Deus pela oração.", ref: "Filipenses 4:6" },
  { verse: "O Senhor é o meu pastor e nada me faltará.", ref: "Salmos 23:1" },
  { verse: "Tudo posso naquele que me fortalece.", ref: "Filipenses 4:13" },
  { verse: "Porque sou eu que conheço os planos que tenho para vocês, diz o Senhor, planos de fazê-los prosperar.", ref: "Jeremias 29:11" },
  { verse: "Sede fortes e corajosos. Não temais, nem vos assusteis diante deles; porque o Senhor teu Deus é quem vai contigo.", ref: "Deuteronômio 31:6" },
  { verse: "Entrega o teu caminho ao Senhor; confia nele, e ele tudo fará.", ref: "Salmos 37:5" },
];

function timeAgo(date: string) {
  const diff = (Date.now() - new Date(date).getTime()) / 1000;
  if (diff < 60) return "agora";
  if (diff < 3600) return `${Math.floor(diff / 60)} min atrás`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`;
  return `${Math.floor(diff / 86400)}d atrás`;
}

export default function SaudePage() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const [tab, setTab] = useState<"apoio" | "oracao">("apoio");

  // Versículo do dia (baseado no dia)
  const [verse, setVerse] = useState(VERSES[0]);
  useEffect(() => { setVerse(VERSES[new Date().getDate() % VERSES.length]); }, []);

  // Encorajamento IA
  const [encouragement, setEncouragement] = useState<any>(null);
  const [loadingEncouragement, setLoadingEncouragement] = useState(false);
  const [encouragementFetched, setEncouragementFetched] = useState(false);

  useEffect(() => {
    if (encouragementFetched) return;
    setEncouragementFetched(true);
    setLoadingEncouragement(true);
    fetch("/api/saude/encorajamento")
      .then(r => r.json())
      .then(d => { if (d.message) setEncouragement(d); })
      .catch(() => {})
      .finally(() => setLoadingEncouragement(false));
  }, []);

  // Pedidos de oração
  const [prayers, setPrayers] = useState<any[]>([]);
  const [loadingPrayers, setLoadingPrayers] = useState(true);
  const [showNewPrayer, setShowNewPrayer] = useState(false);
  const [newPrayerContent, setNewPrayerContent] = useState("");
  const [newPrayerAnonymous, setNewPrayerAnonymous] = useState(false);
  const [submittingPrayer, setSubmittingPrayer] = useState(false);
  const [prayingId, setPrayingId] = useState<string | null>(null);

  const fetchPrayers = async () => {
    setLoadingPrayers(true);
    try {
      const res = await fetch("/api/saude/oracao");
      const data = await res.json();
      setPrayers(Array.isArray(data) ? data : []);
    } catch {}
    finally { setLoadingPrayers(false); }
  };

  useEffect(() => { fetchPrayers(); }, []);

  const submitPrayer = async () => {
    if (!newPrayerContent.trim()) return;
    setSubmittingPrayer(true);
    try {
      const res = await fetch("/api/saude/oracao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newPrayerContent, isAnonymous: newPrayerAnonymous }),
      });
      if (res.ok) {
        setNewPrayerContent("");
        setNewPrayerAnonymous(false);
        setShowNewPrayer(false);
        fetchPrayers();
      }
    } catch {}
    finally { setSubmittingPrayer(false); }
  };

  const pray = async (id: string) => {
    setPrayingId(id);
    try {
      await fetch("/api/saude/oracao", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prayerRequestId: id, action: "pray" }),
      });
      setPrayers(prev => prev.map(p =>
        p.id === id ? { ...p, prayerCount: p.prayerCount + 1, hasPrayed: true } : p
      ));
    } catch {}
    finally { setPrayingId(null); }
  };

  const resolve = async (id: string) => {
    try {
      await fetch("/api/saude/oracao", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prayerRequestId: id, action: "resolve" }),
      });
      setPrayers(prev => prev.filter(p => p.id !== id));
    } catch {}
  };

  return (
    <div className="space-y-4 pb-8">
      <div>
        <h1 className="text-xl font-semibold">Saúde do Ministério</h1>
        <p className="text-sm text-muted-foreground">Apoio, cuidado e comunhão</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted/40 rounded-lg p-1">
        {[
          { key: "apoio", label: "Apoio & Palavra", icon: <BookOpen className="h-3.5 w-3.5" /> },
          { key: "oracao", label: "Pedidos de oração", icon: <HandMetal className="h-3.5 w-3.5" /> },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as any)}
            className={`flex-1 flex items-center justify-center gap-1.5 text-xs py-2 rounded-md transition-colors ${tab === t.key ? "bg-background text-foreground font-medium shadow-sm border border-border/50" : "text-muted-foreground hover:text-foreground"}`}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* ABA APOIO */}
      {tab === "apoio" && (
        <>
          {/* Encorajamento IA — aparece quando humor está negativo */}
          {loadingEncouragement && (
            <Card className="border-orange-200 dark:border-orange-800">
              <CardContent className="py-4 flex items-center gap-3">
                <Loader2 className="h-4 w-4 animate-spin text-orange-500 flex-shrink-0" />
                <p className="text-xs text-muted-foreground">Preparando uma palavra especial para você...</p>
              </CardContent>
            </Card>
          )}

          {encouragement?.message && (
            <Card className="border-orange-200 dark:border-orange-800 bg-gradient-to-br from-orange-50 to-yellow-50 dark:from-orange-900/20 dark:to-yellow-900/20">
              <CardContent className="py-5">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg">💙</span>
                  <p className="text-xs font-medium text-orange-700 dark:text-orange-400 uppercase tracking-widest">Palavra para você</p>
                  {encouragement.negativeStreak >= 3 && (
                    <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                      Cuidado especial
                    </span>
                  )}
                </div>
                <p className="text-sm text-orange-900 dark:text-orange-100 leading-relaxed whitespace-pre-line">
                  {encouragement.message}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Versículo do dia */}
          <Card className="border-purple-200 dark:border-purple-800 bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20">
            <CardContent className="py-5 text-center">
              <p className="text-xs font-medium text-purple-600 dark:text-purple-400 mb-3 uppercase tracking-widest">Palavra para você hoje</p>
              <p className="text-sm text-purple-900 dark:text-purple-100 leading-relaxed italic mb-2">"{verse.verse}"</p>
              <p className="text-xs font-medium text-purple-600 dark:text-purple-400">{verse.ref}</p>
            </CardContent>
          </Card>

          {/* Cards de apoio */}
          <div className="grid grid-cols-2 gap-3">
            <Card className="cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => setTab("oracao")}>
              <CardContent className="py-4 text-center">
                <HandMetal className="h-7 w-7 text-green-600 mx-auto mb-2" />
                <p className="text-sm font-medium">Pedidos de oração</p>
                <p className="text-xs text-muted-foreground mt-1">{prayers.length} ativos</p>
              </CardContent>
            </Card>
            <Card className="cursor-pointer hover:bg-muted/30 transition-colors"
              onClick={() => {
                setEncouragementFetched(false);
                setEncouragement(null);
                setLoadingEncouragement(true);
                fetch("/api/saude/encorajamento")
                  .then(r => r.json())
                  .then(d => { if (d.message) setEncouragement(d); })
                  .catch(() => {})
                  .finally(() => setLoadingEncouragement(false));
              }}>
              <CardContent className="py-4 text-center">
                <Heart className="h-7 w-7 text-orange-500 mx-auto mb-2" />
                <p className="text-sm font-medium">Encorajamento IA</p>
                <p className="text-xs text-muted-foreground mt-1">Palavra personalizada</p>
              </CardContent>
            </Card>
          </div>

          {/* Mensagem de encorajamento */}
          <Card className="border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-900/10">
            <CardContent className="py-4">
              <div className="flex items-start gap-3">
                <Heart className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-green-800 dark:text-green-300 mb-1">Você faz diferença!</p>
                  <p className="text-xs text-green-700 dark:text-green-400 leading-relaxed">
                    Cada vez que você ministra, você está servindo a Deus e às pessoas. Seu cuidado, sua dedicação e sua presença são insubstituíveis neste ministério.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Devocionais */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <BookOpen className="h-4 w-4 text-primary" />
                Reflexões
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { title: "A força vem do alto", desc: "Quando sentimos fraqueza, é justamente quando Deus mais se manifesta.", tag: "Força" },
                { title: "Ministrar com autenticidade", desc: "Deus não usa máscaras. Ele quer a sua essência, não a sua performance.", tag: "Ministério" },
                { title: "Cuidando uns dos outros", desc: "A comunhão genuína começa quando abrimos nosso coração para o próximo.", tag: "Comunhão" },
              ].map((d, i) => (
                <div key={i} className="flex items-start gap-3 py-2 border-b border-border/50 last:border-0">
                  <div className="flex-1">
                    <p className="text-sm font-medium">{d.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{d.desc}</p>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary flex-shrink-0">{d.tag}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}

      {/* ABA ORAÇÃO */}
      {tab === "oracao" && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{prayers.length} pedido(s) ativo(s)</p>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={fetchPrayers} disabled={loadingPrayers}>
                <RefreshCw className={`h-4 w-4 ${loadingPrayers ? "animate-spin" : ""}`} />
              </Button>
              <Button size="sm" onClick={() => setShowNewPrayer(true)} className="gap-1.5">
                <Plus className="h-4 w-4" /> Novo pedido
              </Button>
            </div>
          </div>

          {/* Formulário novo pedido */}
          {showNewPrayer && (
            <Card className="border-primary/30">
              <CardContent className="py-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Novo pedido de oração</p>
                  <button onClick={() => setShowNewPrayer(false)}>
                    <X className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>
                <textarea
                  value={newPrayerContent}
                  onChange={e => setNewPrayerContent(e.target.value)}
                  placeholder="Compartilhe seu pedido com a equipe..."
                  className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background resize-none h-24 focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newPrayerAnonymous}
                    onChange={e => setNewPrayerAnonymous(e.target.checked)}
                    className="rounded"
                  />
                  Compartilhar anonimamente
                </label>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => setShowNewPrayer(false)}>
                    Cancelar
                  </Button>
                  <Button size="sm" className="flex-1" onClick={submitPrayer} disabled={submittingPrayer || !newPrayerContent.trim()}>
                    {submittingPrayer ? <Loader2 className="h-4 w-4 animate-spin" /> : "Compartilhar"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Lista de pedidos */}
          {loadingPrayers ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : prayers.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center">
                <HandMetal className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Nenhum pedido de oração ativo.</p>
                <p className="text-xs text-muted-foreground mt-1">Seja o primeiro a compartilhar!</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {prayers.map((p: any) => (
                <Card key={p.id} className="border-green-100 dark:border-green-900/30">
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <span className="text-xs font-medium text-green-700 dark:text-green-400">
                          {p.isAnonymous ? "Anônimo" : p.memberName}
                        </span>
                        <span className="text-xs text-muted-foreground ml-2">{timeAgo(p.createdAt)}</span>
                      </div>
                      {p.memberId === user?.id && (
                        <button onClick={() => resolve(p.id)} className="text-xs text-muted-foreground hover:text-foreground">
                          Marcar como respondido
                        </button>
                      )}
                    </div>
                    <p className="text-sm text-foreground leading-relaxed mb-3">{p.content}</p>
                    <button
                      onClick={() => !p.hasPrayed && pray(p.id)}
                      disabled={p.hasPrayed || prayingId === p.id}
                      className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-full transition-colors ${p.hasPrayed ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 cursor-default" : "bg-muted hover:bg-green-100 hover:text-green-700 dark:hover:bg-green-900/30 dark:hover:text-green-400 text-muted-foreground"}`}
                    >
                      {prayingId === p.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <HandMetal className="h-3 w-3" />
                      )}
                      {p.hasPrayed ? "Você orou por este pedido" : `Orei por isso · ${p.prayerCount}`}
                    </button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
