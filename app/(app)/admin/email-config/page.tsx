"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Mail, Bell, CreditCard, Users, Calendar,
  CheckCircle2, XCircle, Loader2, ToggleLeft, ToggleRight,
} from "lucide-react";
import { toast } from "sonner";

const CATEGORY_ICONS: Record<string, any> = {
  Contas: Users,
  Assinaturas: CreditCard,
  Pagamentos: CreditCard,
  Escalas: Calendar,
};

const CATEGORY_COLORS: Record<string, string> = {
  Contas: "text-blue-500",
  Assinaturas: "text-purple-500",
  Pagamentos: "text-green-500",
  Escalas: "text-orange-500",
};

interface EmailConfig {
  key: string;
  label: string;
  description: string;
  category: string;
  enabled: boolean;
}

export default function EmailConfigPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const user = session?.user as any;

  const [grouped, setGrouped] = useState<Record<string, EmailConfig[]>>({});
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
    if (status === "authenticated" && user?.role !== "SUPERADMIN") router.replace("/dashboard");
  }, [status, user, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/admin/email-config")
      .then((r) => r.json())
      .then((data) => setGrouped(data.grouped ?? {}))
      .catch(() => toast.error("Erro ao carregar configurações"))
      .finally(() => setLoading(false));
  }, [status]);

  const handleToggle = async (key: string, currentEnabled: boolean) => {
    setToggling(key);
    try {
      const res = await fetch("/api/admin/email-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, enabled: !currentEnabled }),
      });
      if (!res.ok) throw new Error();

      // Atualizar estado local
      setGrouped((prev) => {
        const next = { ...prev };
        for (const cat in next) {
          next[cat] = next[cat].map((c) =>
            c.key === key ? { ...c, enabled: !currentEnabled } : c
          );
        }
        return next;
      });

      toast.success(!currentEnabled ? "Email habilitado" : "Email desabilitado");
    } catch {
      toast.error("Erro ao atualizar configuração");
    } finally {
      setToggling(null);
    }
  };

  const totalEnabled = Object.values(grouped).flat().filter((c) => c.enabled).length;
  const totalConfigs = Object.values(grouped).flat().length;

  if (loading || status === "loading") {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Mail className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-bold">Configuração de Emails</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Gerencie quais emails automáticos são enviados pela plataforma.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="flex items-center gap-1 text-green-600 dark:text-green-400 font-medium">
            <CheckCircle2 className="h-4 w-4" />
            {totalEnabled} ativos
          </span>
          <span className="text-muted-foreground">/ {totalConfigs}</span>
        </div>
      </div>

      {/* Grupos */}
      {Object.entries(grouped).map(([category, configs]) => {
        const Icon = CATEGORY_ICONS[category] ?? Bell;
        const color = CATEGORY_COLORS[category] ?? "text-primary";
        const enabledCount = configs.filter((c) => c.enabled).length;

        return (
          <div key={category} className="border border-border rounded-xl overflow-hidden">
            {/* Header da categoria */}
            <div className="flex items-center justify-between px-5 py-3 bg-muted/30 border-b border-border">
              <div className="flex items-center gap-2">
                <Icon className={`h-4 w-4 ${color}`} />
                <span className="font-semibold text-sm">{category}</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {enabledCount}/{configs.length} habilitados
              </span>
            </div>

            {/* Items */}
            <div className="divide-y divide-border">
              {configs.map((config) => (
                <div
                  key={config.key}
                  className="flex items-center justify-between px-5 py-4 hover:bg-muted/20 transition-colors"
                >
                  <div className="flex-1 min-w-0 pr-4">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm">{config.label}</p>
                      {config.enabled ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-green-600 dark:text-green-400 bg-green-500/10 border border-green-500/20 rounded-full px-2 py-0.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                          Ativo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground bg-muted border border-border rounded-full px-2 py-0.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
                          Inativo
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{config.description}</p>
                  </div>

                  <button
                    onClick={() => handleToggle(config.key, config.enabled)}
                    disabled={toggling === config.key}
                    className="flex-shrink-0 relative"
                  >
                    {toggling === config.key ? (
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    ) : config.enabled ? (
                      <ToggleRight className="h-8 w-8 text-primary hover:text-primary/80 transition-colors" />
                    ) : (
                      <ToggleLeft className="h-8 w-8 text-muted-foreground hover:text-foreground transition-colors" />
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
