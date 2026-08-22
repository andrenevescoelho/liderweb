"use client";

import { useEffect, useMemo, useState } from "react";
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
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

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
  conversations: Array<{
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
  }>;
  events: Array<{
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
  }>;
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

export function WhatsAppCampaignDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

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

  const cards = [
    ["Enviados", data.metrics.enviados, Send],
    ["Pulados", data.metrics.pulados, SkipForward],
    ["Respostas", data.metrics.respostasRecebidas, MessageCircleReply],
    ["Taxa de resposta", `${data.metrics.taxaRespostaPercentual}%`, Activity],
    ["Interessados", data.metrics.interessados, UserRoundCheck],
    ["Não interessados", data.metrics.naoInteressados, UserRoundX],
    ["Humano", data.metrics.encaminhadosHumano, Users],
    ["Opt-out", data.metrics.optOut, CircleOff],
  ] as const;

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
        {cards.map(([label, value, Icon]) => (
          <Card key={label}>
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-2xl font-semibold mt-1">{value}</p>
              </div>
              <Icon className="h-5 w-5 text-muted-foreground" />
            </CardContent>
          </Card>
        ))}
      </div>

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
                <div key={`${row.segmento}-${row.event_type}-${row.reason}-${index}`} className="grid grid-cols-4 gap-2 rounded-lg border p-3 text-sm">
                  <span>{row.segmento || "—"}</span>
                  <span>{row.event_type}</span>
                  <span className="truncate text-muted-foreground" title={row.reason}>{row.reason || "—"}</span>
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
