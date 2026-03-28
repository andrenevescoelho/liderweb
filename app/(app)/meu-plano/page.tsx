"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  CreditCard, Loader2, CheckCircle2, AlertTriangle, XCircle,
  Clock, Users, ExternalLink, RefreshCw, X, ArrowUpRight,
  Receipt, Headphones, Brain, Scissors, Zap, Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Invoice {
  id: string;
  amount: number;
  currency: string;
  status: "paid" | "open" | "void" | "uncollectible";
  description: string | null;
  paidAt: string | null;
  invoiceUrl: string | null;
  invoicePdf: string | null;
  periodStart: string | null;
  periodEnd: string | null;
}

interface SubscriptionData {
  id: string;
  status: string;
  planName: string;
  planSlug: string | null;
  price: number;
  period: string;
  userLimit: number;
  userCount: number;
  features: Record<string, any>;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  trialEndsAt: string | null;
  cancelAtPeriodEnd: boolean;
  hasStripeCustomer: boolean;
  hasStripeSubscription: boolean;
  gateway: string;
}

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(date: string | null) {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

function StatusBadge({ status, cancelAtPeriodEnd }: { status: string; cancelAtPeriodEnd: boolean }) {
  if (cancelAtPeriodEnd) return (
    <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30 gap-1">
      <Clock className="h-3 w-3" /> Cancelamento agendado
    </Badge>
  );
  switch (status) {
    case "ACTIVE":    return <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 gap-1"><CheckCircle2 className="h-3 w-3" />Ativa</Badge>;
    case "TRIALING":  return <Badge className="bg-blue-500/15 text-blue-600 border-blue-500/30 gap-1"><Clock className="h-3 w-3" />Em trial</Badge>;
    case "PAST_DUE":  return <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30 gap-1"><AlertTriangle className="h-3 w-3" />Pagamento pendente</Badge>;
    case "CANCELED":  return <Badge className="bg-red-500/15 text-red-600 border-red-500/30 gap-1"><XCircle className="h-3 w-3" />Cancelada</Badge>;
    case "INACTIVE":  return <Badge className="bg-slate-500/15 text-slate-500 border-slate-500/30 gap-1"><X className="h-3 w-3" />Inativa</Badge>;
    default: return <Badge variant="outline">{status}</Badge>;
  }
}

function InvoiceStatusBadge({ status }: { status: string }) {
  switch (status) {
    case "paid":   return <span className="text-[11px] font-medium text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-full">Pago</span>;
    case "open":   return <span className="text-[11px] font-medium text-amber-600 bg-amber-500/10 px-2 py-0.5 rounded-full">Pendente</span>;
    default:       return <span className="text-[11px] font-medium text-slate-500 bg-slate-500/10 px-2 py-0.5 rounded-full">{status}</span>;
  }
}

const FEATURE_ICONS: Record<string, any> = {
  multitracks: Headphones,
  professor:   Brain,
  splits:      Scissors,
  audio_upload: Zap,
};

export default function MeuPlanoPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const user = session?.user as any;
  const isAdmin = user?.role === "ADMIN" || user?.role === "SUPERADMIN";

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [data, setData] = useState<{ hasSubscription: boolean; isActive?: boolean; subscription?: SubscriptionData; invoices?: Invoice[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/billing/my-plan");
      const json = await res.json();
      setData(json);
    } catch {
      setError("Erro ao carregar dados da assinatura.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const doAction = async (action: string) => {
    setActionLoading(action);
    setError(null);
    try {
      const res = await fetch("/api/billing/my-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (json.url) { window.location.href = json.url; return; }
      if (!res.ok) { setError(json.error || "Erro ao executar ação"); return; }
      await load();
    } catch {
      setError("Erro de conexão.");
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) return (
    <div className="flex h-64 items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );

  const sub = data?.subscription;

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <CreditCard className="h-6 w-6 text-primary" /> Meu Plano
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Gerencie sua assinatura e histórico de pagamentos.</p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" /> {error}
        </div>
      )}

      {!data?.hasSubscription ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CreditCard className="h-12 w-12 text-muted-foreground/20 mx-auto mb-4" />
            <p className="text-muted-foreground mb-4">Você ainda não tem uma assinatura ativa.</p>
            <Button onClick={() => router.push("/planos")}>Ver planos disponíveis</Button>
          </CardContent>
        </Card>
      ) : sub ? (
        <>
          {/* Card principal — plano atual */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-lg">{sub.planName}</CardTitle>
                  <div className="flex items-center gap-2 mt-1.5">
                    <StatusBadge status={sub.status} cancelAtPeriodEnd={sub.cancelAtPeriodEnd} />
                    {sub.status === "TRIALING" && sub.trialEndsAt && (
                      <span className="text-xs text-muted-foreground">
                        Trial até {formatDate(sub.trialEndsAt)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-primary">
                    {sub.price === 0 ? "Grátis" : formatBRL(sub.price)}
                  </p>
                  {sub.price > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {sub.period === "MONTHLY" ? "/mês" : sub.period === "ANNUAL" ? "/ano" : "/período"}
                    </p>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Métricas */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Users className="h-3 w-3" />Membros</p>
                  <p className="font-semibold">{sub.userCount} <span className="text-muted-foreground font-normal text-xs">/ {sub.userLimit === 0 ? "∞" : sub.userLimit}</span></p>
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Calendar className="h-3 w-3" />Próxima cobrança</p>
                  <p className="font-semibold text-sm">{sub.cancelAtPeriodEnd ? "Não renova" : formatDate(sub.currentPeriodEnd)}</p>
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground mb-1">Gateway</p>
                  <p className="font-semibold text-sm">{sub.gateway}</p>
                </div>
              </div>

              {/* Features */}
              {Object.keys(sub.features).length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Recursos inclusos</p>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(sub.features).map(([key, value]) => {
                      const Icon = FEATURE_ICONS[key] ?? CheckCircle2;
                      const label = key === "professor" ? "Professor IA"
                        : key === "multitracks" ? `${value} Multitracks/mês`
                        : key === "splits" ? `${value} Splits/mês`
                        : key === "audio_upload" ? "Upload de áudio"
                        : key;
                      const hasIt = typeof value === "boolean" ? value : Number(value) > 0;
                      return (
                        <div key={key} className={cn("flex items-center gap-2 text-sm rounded-lg px-3 py-2",
                          hasIt ? "bg-primary/5 text-foreground" : "text-muted-foreground/50")}>
                          <Icon className={cn("h-3.5 w-3.5 flex-shrink-0", hasIt ? "text-primary" : "text-muted-foreground/30")} />
                          {label}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Cancelamento agendado */}
              {sub.cancelAtPeriodEnd && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
                  Sua assinatura será cancelada em <strong>{formatDate(sub.currentPeriodEnd)}</strong>.
                  Você pode reativar antes dessa data.
                </div>
              )}

              {/* Ações */}
              {isAdmin && (
                <div className="flex flex-wrap gap-2 pt-2 border-t border-border/60">
                  {sub.hasStripeCustomer && (
                    <Button variant="outline" size="sm" onClick={() => doAction("portal")}
                      disabled={!!actionLoading}>
                      {actionLoading === "portal" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
                      Gerenciar pagamento
                    </Button>
                  )}
                  {sub.cancelAtPeriodEnd && sub.hasStripeSubscription && (
                    <Button variant="outline" size="sm" onClick={() => doAction("reactivate")}
                      disabled={!!actionLoading} className="text-emerald-600 border-emerald-500/40 hover:bg-emerald-500/10">
                      {actionLoading === "reactivate" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                      Reativar assinatura
                    </Button>
                  )}
                  {!sub.cancelAtPeriodEnd && sub.hasStripeSubscription && sub.status === "ACTIVE" && (
                    <Button variant="outline" size="sm" onClick={() => doAction("cancel")}
                      disabled={!!actionLoading} className="text-red-500 border-red-500/40 hover:bg-red-500/10">
                      {actionLoading === "cancel" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                      Cancelar assinatura
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={() => router.push("/planos")}>
                    <ArrowUpRight className="h-3.5 w-3.5" /> Ver planos
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Histórico de pagamentos */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Receipt className="h-4 w-4 text-muted-foreground" /> Histórico de pagamentos
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!data?.invoices?.length ? (
                <p className="text-sm text-muted-foreground text-center py-6">Nenhum pagamento registrado.</p>
              ) : (
                <div className="divide-y divide-border/60">
                  {data.invoices.map((inv) => (
                    <div key={inv.id} className="flex items-center justify-between py-3 gap-4">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{inv.description || `Fatura ${inv.id.slice(-6)}`}</p>
                        <p className="text-xs text-muted-foreground">
                          {inv.periodStart && inv.periodEnd
                            ? `${formatDate(inv.periodStart)} – ${formatDate(inv.periodEnd)}`
                            : formatDate(inv.paidAt)}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <InvoiceStatusBadge status={inv.status} />
                        <p className="text-sm font-semibold">{formatBRL(inv.amount)}</p>
                        {inv.invoiceUrl && (
                          <a href={inv.invoiceUrl} target="_blank" rel="noreferrer"
                            className="text-muted-foreground hover:text-primary transition-colors">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
