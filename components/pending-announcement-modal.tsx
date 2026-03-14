"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Bell, Gift, Sparkles, Wrench } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const TYPE_META: Record<string, { label: string; icon: React.ReactNode; className: string }> = {
  INFO: { label: "Informação", icon: <Bell className="h-4 w-4" />, className: "bg-blue-100 text-blue-800" },
  FEATURE: { label: "Novidade", icon: <Sparkles className="h-4 w-4" />, className: "bg-purple-100 text-purple-800" },
  PROMOTION: { label: "Promoção", icon: <Gift className="h-4 w-4" />, className: "bg-green-100 text-green-800" },
  ALERT: { label: "Alerta", icon: <AlertTriangle className="h-4 w-4" />, className: "bg-orange-100 text-orange-800" },
  MAINTENANCE: { label: "Manutenção", icon: <Wrench className="h-4 w-4" />, className: "bg-slate-200 text-slate-800" },
};

export function PendingAnnouncementModal() {
  const [items, setItems] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const current = items[0];
  const typeMeta = useMemo(() => TYPE_META[current?.type] ?? TYPE_META.INFO, [current?.type]);

  useEffect(() => {
    fetch("/api/announcements/pending")
      .then((res) => res.json())
      .then((data) => {
        const list = Array.isArray(data?.announcements) ? data.announcements : [];
        setItems(list);
        setOpen(list.length > 0);
      })
      .catch(() => undefined);
  }, []);

  const handleDismiss = async () => {
    if (!current?.id) return;
    setSubmitting(true);

    try {
      await fetch(`/api/announcements/${current.id}/view`, { method: "POST" });
      setItems((prev) => {
        const next = prev.slice(1);
        setOpen(next.length > 0);
        return next;
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && current?.id && !submitting) {
          handleDismiss();
        }
      }}
    >
      <DialogContent className="sm:max-w-lg">
        {current ? (
          <>
            <DialogHeader>
              <div className="mb-2 flex items-center gap-2">
                <Badge className={typeMeta.className}>{typeMeta.icon}<span className="ml-1">{typeMeta.label}</span></Badge>
                <Badge variant="outline">Prioridade {current.priority ?? 0}</Badge>
              </div>
              <DialogTitle>{current.title}</DialogTitle>
              <DialogDescription asChild>
                <p className="whitespace-pre-wrap pt-2 text-sm text-slate-700">{current.message}</p>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:justify-end">
              {current.ctaUrl ? (
                <Button asChild variant="secondary">
                  <a href={current.ctaUrl} target="_blank" rel="noreferrer">{current.ctaLabel || "Saiba mais"}</a>
                </Button>
              ) : null}
              <Button onClick={handleDismiss} disabled={submitting}>{submitting ? "Salvando..." : "Entendi"}</Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
