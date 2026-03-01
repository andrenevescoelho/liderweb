"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, CreditCard, TrendingDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type DashboardData = {
  superadminInsights?: {
    alerts?: {
      lowActivityGroups?: Array<{ id: string; name: string }>;
      riskSubscriptions?: Array<{ id: string; groupName: string; status: string }>;
      paymentIssues?: number;
      engagementDrop?: number;
    };
  };
};

export default function AlertasInteligentesPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((res) => res.json())
      .then((response) => setData(response))
      .finally(() => setLoading(false));
  }, []);

  const lowActivityGroups = useMemo(() => data?.superadminInsights?.alerts?.lowActivityGroups ?? [], [data]);
  const riskSubscriptions = useMemo(() => data?.superadminInsights?.alerts?.riskSubscriptions ?? [], [data]);
  const paymentIssues = data?.superadminInsights?.alerts?.paymentIssues ?? 0;
  const engagementDrop = data?.superadminInsights?.alerts?.engagementDrop ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard">
          <Button variant="outline" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar para dashboard
          </Button>
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Alertas inteligentes</h1>
        <p className="text-gray-600 dark:text-gray-400">Dados consolidados para agir rápido nos riscos da plataforma.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-700 dark:text-gray-200">Igrejas com baixa atividade</p>
              <AlertTriangle className="w-4 h-4 text-yellow-600" />
            </div>
            <p className="text-2xl font-bold mt-1">{lowActivityGroups.length}</p>
          </CardContent>
        </Card>

        <Card className="bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-700 dark:text-gray-200">Falhas de pagamento</p>
              <CreditCard className="w-4 h-4 text-rose-600" />
            </div>
            <p className="text-2xl font-bold mt-1">{paymentIssues}</p>
          </CardContent>
        </Card>

        <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-700 dark:text-gray-200">Queda de engajamento</p>
              <TrendingDown className="w-4 h-4 text-blue-600" />
            </div>
            <p className="text-2xl font-bold mt-1">{engagementDrop}%</p>
          </CardContent>
        </Card>
      </div>

      <Card id="igrejas-baixa-atividade">
        <CardHeader>
          <CardTitle>Igrejas com baixa atividade (últimos 30 dias)</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-gray-500">Carregando dados...</p>
          ) : lowActivityGroups.length === 0 ? (
            <p className="text-sm text-gray-500">Nenhuma igreja com baixa atividade no momento.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Igreja</TableHead>
                  <TableHead className="w-[180px]">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lowActivityGroups.map((group) => (
                  <TableRow key={group.id}>
                    <TableCell className="font-medium">{group.name}</TableCell>
                    <TableCell>
                      <Badge variant="warning">Baixa atividade</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card id="risco-pagamento">
        <CardHeader>
          <CardTitle>Risco de cancelamento / falha de pagamento</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-gray-500">Carregando dados...</p>
          ) : riskSubscriptions.length === 0 ? (
            <p className="text-sm text-gray-500">Nenhuma assinatura em risco no momento.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Igreja</TableHead>
                  <TableHead className="w-[180px]">Status da assinatura</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {riskSubscriptions.map((subscription) => (
                  <TableRow key={subscription.id}>
                    <TableCell className="font-medium">{subscription.groupName}</TableCell>
                    <TableCell>
                      <Badge variant="danger">{subscription.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
