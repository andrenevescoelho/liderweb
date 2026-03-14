"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { ptBR } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

type BirthdayMember = {
  id: string;
  name: string;
  birthDate: string;
  memberFunction?: string | null;
  leadershipRole?: string | null;
  groupName?: string | null;
  daysUntilBirthday?: number;
};

const MONTH_OPTIONS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export default function AniversariantesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const userRole = (session?.user as { role?: string } | undefined)?.role;
  const [month, setMonth] = useState<number>(new Date().getMonth() + 1);
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [days, setDays] = useState<number>(14);
  const [monthBirthdays, setMonthBirthdays] = useState<BirthdayMember[]>([]);
  const [upcomingBirthdays, setUpcomingBirthdays] = useState<BirthdayMember[]>([]);
  const [loadingMonth, setLoadingMonth] = useState<boolean>(true);
  const [loadingUpcoming, setLoadingUpcoming] = useState<boolean>(true);

  useEffect(() => {
    if (status === "loading") return;
    if (userRole === "SUPERADMIN") {
      router.replace("/dashboard");
    }
  }, [router, status, userRole]);

  useEffect(() => {
    const loadMonthBirthdays = async () => {
      setLoadingMonth(true);
      try {
        const response = await fetch(`/api/members/birthdays?month=${month}&year=${year}`, { cache: "no-store" });
        const data = await response.json();
        setMonthBirthdays(Array.isArray(data) ? data : []);
      } finally {
        setLoadingMonth(false);
      }
    };

    loadMonthBirthdays();
  }, [month, year]);

  useEffect(() => {
    const loadUpcomingBirthdays = async () => {
      setLoadingUpcoming(true);
      try {
        const response = await fetch(`/api/members/birthdays/upcoming?days=${days}`, { cache: "no-store" });
        const data = await response.json();
        setUpcomingBirthdays(Array.isArray(data) ? data : []);
      } finally {
        setLoadingUpcoming(false);
      }
    };

    loadUpcomingBirthdays();
  }, [days]);

  const monthLabel = useMemo(() => MONTH_OPTIONS[month - 1], [month]);

  if (status === "loading" || userRole === "SUPERADMIN") {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Aniversariantes</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Consulte aniversariantes do mês e próximos aniversários.</p>
        </div>

        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col text-sm text-gray-600 dark:text-gray-300">
            Mês
            <select
              className="mt-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
            >
              {MONTH_OPTIONS.map((label, index) => (
                <option key={label} value={index + 1}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col text-sm text-gray-600 dark:text-gray-300">
            Ano (opcional)
            <input
              type="number"
              className="mt-1 w-28 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
              value={year}
              onChange={(e) => setYear(Number(e.target.value) || new Date().getFullYear())}
            />
          </label>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Aniversariantes do mês ({monthLabel})</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingMonth ? (
            <p className="text-sm text-gray-500">Carregando aniversariantes...</p>
          ) : monthBirthdays.length === 0 ? (
            <p className="text-sm text-gray-500">Nenhum aniversariante neste mês.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {monthBirthdays.map((member) => (
                <div key={member.id} className="flex items-center gap-3 rounded-lg border border-gray-200 p-3 dark:border-gray-800">
                  <Avatar>
                    <AvatarFallback>{member.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-gray-900 dark:text-white">{member.name}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-300">{format(new Date(member.birthDate), "dd/MM", { locale: ptBR })}</p>
                    {(member.memberFunction || member.leadershipRole || member.groupName) && (
                      <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                        {member.memberFunction || member.leadershipRole || member.groupName}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Próximos aniversários</CardTitle>
          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
            Próximos
            <select
              className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-900"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
            >
              {[7, 14, 30].map((option) => (
                <option key={option} value={option}>
                  {option} dias
                </option>
              ))}
            </select>
          </label>
        </CardHeader>
        <CardContent>
          {loadingUpcoming ? (
            <p className="text-sm text-gray-500">Carregando próximos aniversários...</p>
          ) : upcomingBirthdays.length === 0 ? (
            <p className="text-sm text-gray-500">Nenhum aniversário nos próximos {days} dias.</p>
          ) : (
            <div className="space-y-2">
              {upcomingBirthdays.map((member) => (
                <div key={member.id} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-800">
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">{member.name}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-300">{format(new Date(member.birthDate), "dd/MM", { locale: ptBR })}</p>
                  </div>
                  <p className="text-sm text-purple-700 dark:text-purple-300">em {member.daysUntilBirthday ?? 0} dia(s)</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
