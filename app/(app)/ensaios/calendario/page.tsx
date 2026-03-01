"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSession } from "next-auth/react";

export default function EnsaiosCalendarioPage() {
  const { data: session } = useSession() || {};
  const userRole = (session?.user as any)?.role ?? "MEMBER";
  const canManage = userRole === "SUPERADMIN" || userRole === "ADMIN";
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
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Calendar className="w-8 h-8 text-purple-600" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Calendário de ensaios</h1>
        </div>
        {canManage && (
          <Link href="/ensaios/novo">
            <Button>
              <Plus className="w-4 h-4 mr-2" /> Novo ensaio
            </Button>
          </Link>
        )}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <Button variant="ghost" onClick={() => setMonth(subMonths(month, 1))}>
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <CardTitle className="text-center capitalize">{format(month, "MMMM yyyy", { locale: ptBR })}</CardTitle>
            <Button variant="ghost" onClick={() => setMonth(addMonths(month, 1))}>
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-1 mb-2">
            {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
              <div key={d} className="text-center text-sm font-medium text-gray-500 py-2">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array(startOfMonth(month).getDay()).fill(null).map((_, i) => <div key={`empty-${i}`} className="p-2" />)}
            {days.map((day) => {
              const rehearsal = rehearsalForDay(day);
              return (
                <Link
                  key={day.toISOString()}
                  href={rehearsal ? `/ensaios/${rehearsal.id}` : (canManage ? "/ensaios/novo" : "/ensaios")}
                  className={`p-2 min-h-[80px] rounded-lg text-left transition-colors ${
                    rehearsal
                      ? "bg-purple-100 dark:bg-purple-900/50 hover:bg-purple-200 dark:hover:bg-purple-800"
                      : "bg-gray-50 dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                >
                  <p className={`text-sm font-medium ${rehearsal ? "text-purple-700 dark:text-purple-300" : "text-gray-700 dark:text-gray-300"}`}>
                    {format(day, "d")}
                  </p>
                  {rehearsal && (
                    <div className="mt-1 rounded-full bg-purple-600/75 px-2 py-1 text-xs text-white truncate" title={`${rehearsal.type} · ${rehearsal.location || "Sem local"}`}>
                      {rehearsal.type} • {rehearsal.location || "Sem local"}
                    </div>
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
