"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function EnsaiosCalendarioPage() {
  const [month, setMonth] = useState(new Date());
  const [rehearsals, setRehearsals] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/rehearsals")
      .then((res) => res.json())
      .then((data) => setRehearsals(data ?? []))
      .catch(() => setRehearsals([]));
  }, []);

  const days = useMemo(() => eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) }), [month]);

  const rehearsalForDay = (day: Date) => rehearsals.find((r) => isSameDay(new Date(r.dateTime), day));

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Calendário de ensaios</h1>
        <Link href="/ensaios/novo"><Button>Novo ensaio</Button></Link>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <Button variant="outline" onClick={() => setMonth(subMonths(month, 1))}>Anterior</Button>
            <CardTitle className="capitalize">{format(month, "MMMM yyyy", { locale: ptBR })}</CardTitle>
            <Button variant="outline" onClick={() => setMonth(addMonths(month, 1))}>Próximo</Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-2 text-xs text-center mb-2">
            {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => <div key={d}>{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-2">
            {Array(startOfMonth(month).getDay()).fill(null).map((_, i) => <div key={`empty-${i}`} />)}
            {days.map((day) => {
              const rehearsal = rehearsalForDay(day);
              return (
                <Link key={day.toISOString()} href={rehearsal ? `/ensaios/${rehearsal.id}` : "/ensaios/novo"} className={`min-h-[86px] rounded-md border p-2 ${rehearsal ? "bg-purple-50" : "bg-white"}`}>
                  <p className="text-sm font-medium">{format(day, "d")}</p>
                  {rehearsal && (
                    <>
                      <p className="text-xs truncate">{rehearsal.type}</p>
                      <p className="text-xs truncate">{rehearsal.location || "Sem local"}</p>
                    </>
                  )}
                </Link>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
