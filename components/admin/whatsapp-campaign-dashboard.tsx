"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  CheckCircle2,
  CircleOff,
  MessageCircleReply,
  RefreshCw,
  Search,
  Send,
  SkipForward,
  UserRoundCheck,
  UserRoundX,
  Users,
  X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Conversation = {
  conversation_id: number;
  customer_id: number | null;
  name: string | null;
  email: string | null;
  telefone: string;
  segmento: string;
  estado_atual: string;
  ultimo_evento: string;
  motivo_evento: string | null;
  opt_out: boolean;
  primeiro_envio: string | null;
  ultima_interacao: string | null;
  ultima_mensagem_recebida: string | null;
};

type CampaignEvent = {
  id: number;
  customer_id: number | null;
  order_id: number | null;
  name: string | null;
  email: string | null;
  telefone: string | null;
  segmento: string | null;
  event_type: string;
  reason: string | null;
  created_at: string;
};

type DashboardData = {
  metrics: {
    enviados: number;
    pulados: number;
    eventosTotal: number;
    respostasRecebidas: number;
    taxaRespostaPercentual: number;
    naoInteressados: number;
    interessados: number;
    encaminhadosHumano: number;
    optOut: number;
  };
  states: Array<{ state: string; quantidade: number }>;
  segments: Array<{
    segmento: string;
    event_type: string;
    reason: string;
    quantidade: number;
  }>;
  conversations: Conversation[];
  events: CampaignEvent[];
};

type MetricFilter =
  | "enviados"
  | "pulados"
  | "respostas"
  | "taxa_resposta"
  | "interessados"
  | "nao_interessados"
  | "humano"
  | "opt_out";

type MetricCard = {
  key: MetricFilter;
  label: string;
  value: number | string;
  icon: typeof Send;
};

const formatDate = (value?: string | null) =>
  value
    ? new Date(value).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

const stateLabel: Record<string, string> = {
  INITIAL_MESSAGE_SENT: "Mensagem inicial enviada",
  WANTS_TO_KNOW_MORE: "Quer conhecer",
  WANTS_MORE_INFO: "Quer mais informações",
  INFO_PROVIDED: "Informações fornecidas",
  NOT_INTERESTED: "Não interessado",
  WANTS_TO_SCHEDULE: "Quer agendar",
  WANTS_HUMAN_CONTACT: "Quer atendimento humano",
  HANDED_TO_HUMAN: "Encaminhado para humano",
  OPT_OUT: "Opt-out",
};

const metricDescriptions: Record<MetricFilter, string> = {
  enviados: "Contatos que tiveram a mensagem inicial enviada.",
  pulados: "Contatos ignorados pelo fluxo, com o respectivo motivo.",
  respostas: "Conversas que já receberam ao menos uma resposta do cliente.",
  taxa_resposta: "Contatos enviados, mostrando quem já respondeu e quem ainda não respondeu.",
  interessados: "Contatos que demonstraram interesse e seguem no funil.",
  nao_interessados: "Contatos que informaram que não têm interesse.",
  humano: "Contatos encaminhados para atendimento humano.",
  opt_out: "Contatos que solicitaram sair dos envios.",
};

const interestedStates = new Set([
  "WANTS_TO_KNOW_MORE",
  "WANTS_MORE_INFO",
  "INFO_PROVIDED",
  "WANTS_TO_SCHEDULE",
  "WANTS_HUMAN_CONTACT",
]);

export function WhatsAppCampaignDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selectedMetric, setSelectedMetric] = useState<MetricFilter | null>(null);
  const detailsRef = useRef<HTMLDivElement | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/whatsapp/dashboard", {
        cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Erro ao carregar dashboard");
      setData(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar dashboard");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const conversations = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!data || !q) return data?.conversations ?? [];
    return data.conversations.filter((row) =>
      [row.name, row.email, row.telefone, row.estado_atual, row.segmento]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q))
    );
  }, [data, search]);

  const selectedConversationRecords = useMemo(() => {
    if (!data || !selectedMetric) return [];

    switch (selectedMetric) {
      case "respostas":
        return data.conversations.filter((row) => Boolean(row.ultima_mensagem_recebida));
      case "taxa_resposta":
        return data.conversations.filter((row) => row.ultimo_evento === "SENT");
      case "interessados":
        return data.conversations.filter((row) => interestedStates.has(row.estado_atual));
      case "nao_interessados":
        return data.conversations.filter((row) => row.estado_atual === "NOT_INTERESTED");
      case "humano":
        return data.conversations.filter((row) => row.estado_atual === "HANDED_TO_HUMAN");
      case "opt_out":
        return data.conversations.filter((row) => row.estado_atual === "OPT_OUT" || row.opt_out);
      default:
        return [];
    }
  }, [data, selectedMetric]);

  const selectedEventRecords = useMemo(() => {
    if (!data || !selectedMetric) return [];

    if (selectedMetric === "enviados") {
      return data.events.filter((row) => row.event_type === "SENT");
    }

    if (selectedMetric === "pulados") {
      return data.events.filter((row) => row.event_type === "SKIPPED");
    }

    return [];
  }, [data, selectedMetric]);

  function selectMetric(metric: MetricFilter) {
    setSelectedMetric((current) => (current === metric ? null : metric));

    requestAnimationFrame(() => {
      setTimeout(() => {
        detailsRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 50);
    });
  }

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Carregando métricas do WhatsApp...</div>;
  }

  if (error || !data) {
    return (
      <div className="p-6 space-y-4">
        <h1 className="text-2xl font-semibold">Campanhas WhatsApp</h1>
        <Card>
          <CardContent className="p-6 space-y-3">
            <p className="text-sm text-red-500">{error || "Não foi possível carregar os dados."}</p>
            <Button onClick={load} variant="outline">
              <RefreshCw className="h-4 w-4 mr-2" /> Tentar novamente
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const cards: MetricCard[] = [
    { key: "enviados", label: "Enviados", value: data.metrics.enviados, icon: Send },
    { key: "pulados", label: "Pulados", value: data.metrics.pulados, icon: SkipForward },
    { key: "respostas", label: "Respostas", value: data.metrics.respostasRecebidas, icon: MessageCircleReply },
    {
      key: "taxa_resposta",
      label: "Taxa de resposta",
      value: `${data.metrics.taxaRespostaPercentual}%`,
      icon: Activity,
    },
    { key: "interessados", label: "Interessados", value: data.metrics.interessados, icon: UserRoundCheck },
    {
      key: "nao_interessados",
      label: "Não interessados",
      value: data.metrics.naoInteressados,
      icon: UserRoundX,
    },
    { key: "humano", label: "Humano", value: data.metrics.encaminhadosHumano, icon: Users },
    { key: "opt_out", label: "Opt-out", value: data.metrics.optOut, icon: CircleOff },
  ];

  const selectedCard = cards.find((card) => card.key === selectedMetric);
  const isEventMetric = selectedMetric === "enviados" || selectedMetric === "pulados";

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Campanhas WhatsApp</h1>
          <p className="text-sm text-muted-foreground">
            Métricas e auditoria do funil comercial LiderWeb.
          </p>
        </div>
        <Button onClick={load} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" /> Atualizar
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ key, label, value, icon: Icon }) => {
          const selected = selectedMetric === key;

          return (
            <Card
              key={key}
              role="button"
              tabIndex={0}
              aria-pressed={selected}
              onClick={() => selectMetric(key)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  selectMetric(key);
                }
              }}
              className={[
                "cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                selected ? "ring-2 ring-primary shadow-md" : "",
              ].join(" ")}
            >
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-2xl font-semibold mt-1">{value}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {selected ? "Clique para fechar" : "Clique para ver registros"}
                  </p>
                </div>
                <Icon className={selected ? "h-5 w-5 text-primary" : "h-5 w-5 text-muted-foreground"} />
              </CardContent>
            </Card>
          );
        })}
      </div>

      {selectedMetric && selectedCard && (
        <div ref={detailsRef} className="scroll-mt-6">
          <Card className="border-primary/30">
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="text-base">
                    Registros — {selectedCard.label}
                  </CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {metricDescriptions[selectedMetric]}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedMetric(null)}
                >
                  <X className="mr-2 h-4 w-4" />
                  Limpar filtro
                </Button>
              </div>
            </CardHeader>

            <CardContent className="overflow-x-auto">
              {isEventMetric ? (
                selectedEventRecords.length === 0 ? (
                  <p className="py-4 text-sm text-muted-foreground">
                    Nenhum registro encontrado para este indicador.
                  </p>
                ) : (
                  <table className="w-full min-w-[850px] text-sm">
                    <thead className="text-left text-muted-foreground">
                      <tr className="border-b">
                        <th className="py-3 pr-4">Cliente</th>
                        <th className="py-3 pr-4">Telefone</th>
                        <th className="py-3 pr-4">Segmento</th>
                        <th className="py-3 pr-4">Evento</th>
                        <th className="py-3 pr-4">Motivo</th>
                        <th className="py-3">Data</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedEventRecords.map((row) => (
                        <tr key={row.id} className="border-b last:border-0">
                          <td className="py-3 pr-4">
                            <div className="font-medium">{row.name || "Sem nome"}</div>
                            <div className="text-xs text-muted-foreground">{row.email || "—"}</div>
                          </td>
                          <td className="py-3 pr-4">{row.telefone || "—"}</td>
                          <td className="py-3 pr-4">{row.segmento || "—"}</td>
                          <td className="py-3 pr-4">
                            <span className={row.event_type === "SENT" ? "text-green-500" : "text-yellow-500"}>
                              {row.event_type}
                            </span>
                          </td>
                          <td className="py-3 pr-4">{row.reason || "—"}</td>
                          <td className="py-3">{formatDate(row.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              ) : selectedConversationRecords.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">
                  Nenhum registro encontrado para este indicador.
                </p>
              ) : (
                <table className="w-full min-w-[950px] text-sm">
                  <thead className="text-left text-muted-foreground">
                    <tr className="border-b">
                      <th className="py-3 pr-4">Cliente</th>
                      <th className="py-3 pr-4">Telefone</th>
                      <th className="py-3 pr-4">Segmento</th>
                      <th className="py-3 pr-4">Estado</th>
                      <th className="py-3 pr-4">Resposta</th>
                      <th className="py-3">Última interação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedConversationRecords.map((row) => (
                      <tr key={row.conversation_id} className="border-b last:border-0">
                        <td className="py-3 pr-4">
                          <div className="font-medium">{row.name || "Sem nome"}</div>
                          <div className="text-xs text-muted-foreground">{row.email || "—"}</div>
                        </td>
                        <td className="py-3 pr-4">{row.telefone}</td>
                        <td className="py-3 pr-4">{row.segmento}</td>
                        <td className="py-3 pr-4">
                          {stateLabel[row.estado_atual] ?? row.estado_atual}
                        </td>
                        <td className="py-3 pr-4">
                          {row.ultima_mensagem_recebida ? (
                            <span className="text-green-500">
                              {selectedMetric === "taxa_resposta"
                                ? "Respondeu"
                                : row.ultima_mensagem_recebida}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">Sem resposta</span>
                          )}
                        </td>
                        <td className="py-3">{formatDate(row.ultima_interacao)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Funil por estado</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.states.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma conversa ainda.</p>
            ) : (
              data.states.map((row) => (
                <div key={row.state} className="flex items-center justify-between rounded-lg border p-3">
                  <span className="text-sm">{stateLabel[row.state] ?? row.state}</span>
                  <span className="font-semibold">{row.quantidade}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Desempenho por segmento</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.segments.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum evento ainda.</p>
            ) : (
              data.segments.map((row, index) => (
                <div
                  key={`${row.segmento}-${row.event_type}-${row.reason}-${index}`}
                  className="grid grid-cols-4 gap-2 rounded-lg border p-3 text-sm"
                >
                  <span>{row.segmento || "—"}</span>
                  <span>{row.event_type}</span>
                  <span className="truncate text-muted-foreground" title={row.reason}>
                    {row.reason || "—"}
                  </span>
                  <span className="text-right font-semibold">{row.quantidade}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <CardTitle className="text-base">Conversas</CardTitle>
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cliente, e-mail, telefone..."
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="text-left text-muted-foreground">
              <tr className="border-b">
                <th className="py-3 pr-4">Cliente</th>
                <th className="py-3 pr-4">Telefone</th>
                <th className="py-3 pr-4">Segmento</th>
                <th className="py-3 pr-4">Estado</th>
                <th className="py-3 pr-4">Último evento</th>
                <th className="py-3">Última interação</th>
              </tr>
            </thead>
            <tbody>
              {conversations.map((row) => (
                <tr key={row.conversation_id} className="border-b last:border-0">
                  <td className="py-3 pr-4">
                    <div className="font-medium">{row.name || "Sem nome"}</div>
                    <div className="text-xs text-muted-foreground">{row.email || "—"}</div>
                  </td>
                  <td className="py-3 pr-4">{row.telefone}</td>
                  <td className="py-3 pr-4">{row.segmento}</td>
                  <td className="py-3 pr-4">{stateLabel[row.estado_atual] ?? row.estado_atual}</td>
                  <td className="py-3 pr-4">
                    <span className={row.ultimo_evento === "SENT" ? "text-green-500" : "text-yellow-500"}>
                      {row.ultimo_evento}
                    </span>
                  </td>
                  <td className="py-3">{formatDate(row.ultima_interacao)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Auditoria da campanha</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-sm">
            <thead className="text-left text-muted-foreground">
              <tr className="border-b">
                <th className="py-3 pr-4">Cliente</th>
                <th className="py-3 pr-4">Segmento</th>
                <th className="py-3 pr-4">Evento</th>
                <th className="py-3 pr-4">Motivo</th>
                <th className="py-3">Data</th>
              </tr>
            </thead>
            <tbody>
              {data.events.map((row) => (
                <tr key={row.id} className="border-b last:border-0">
                  <td className="py-3 pr-4">
                    <div className="font-medium">{row.name || "Sem nome"}</div>
                    <div className="text-xs text-muted-foreground">{row.email || row.telefone || "—"}</div>
                  </td>
                  <td className="py-3 pr-4">{row.segmento || "—"}</td>
                  <td className="py-3 pr-4">
                    <span className={row.event_type === "SENT" ? "text-green-500" : "text-yellow-500"}>
                      {row.event_type}
                    </span>
                  </td>
                  <td className="py-3 pr-4">{row.reason || "—"}</td>
                  <td className="py-3">{formatDate(row.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground flex items-center gap-2">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Área restrita a SUPERADMIN. Dados lidos do banco separado do funil.
      </p>
    </div>
  );
}
