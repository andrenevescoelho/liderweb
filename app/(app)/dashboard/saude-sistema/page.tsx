"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Activity, AlertOctagon, ArrowLeft, CircleDollarSign } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type DashboardData = {
  superadminInsights?: {
    alerts?: {
      systemErrors?: number;
      paymentIssues?: number;
      riskSubscriptions?: Array<{ id: string; groupName: string; status: string }>;
      systemHealthDetails?: Array<{
        id: string;
        category: string;
        entity: string;
        status: string;
        severity: string;
        detail: string;
      }>;
    };
  };
};

export default function SaudeSistemaPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((res) => res.json())
      .then((response) => setData(response))
      .finally(() => setLoading(false));
  }, []);

  const alerts = data?.superadminInsights?.alerts;
  const systemErrors = alerts?.systemErrors ?? 0;
  const paymentIssues = alerts?.paymentIssues ?? 0;
  const riskSubscriptions = alerts?.riskSubscriptions ?? [];
  const systemHealthDetails = useMemo(() => alerts?.systemHealthDetails ?? [], [alerts]);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard">
          <Button variant="outline" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar para dashboard
          </Button>
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Saúde do sistema</h1>
        <p className="text-gray-600 dark:text-gray-400">Visão consolidada de incidentes, riscos e falhas em formato de planilha.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card id="erros-criticos" className="bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-700 dark:text-gray-200">Erros críticos</p>
              <AlertOctagon className="w-4 h-4 text-rose-600" />
            </div>
            <p className="text-2xl font-bold mt-1">{systemErrors}</p>
          </CardContent>
        </Card>

        <Card id="falhas-pagamento" className="bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-700 dark:text-gray-200">Falhas de pagamento</p>
              <CircleDollarSign className="w-4 h-4 text-yellow-600" />
            </div>
            <p className="text-2xl font-bold mt-1">{paymentIssues}</p>
          </CardContent>
        </Card>

        <Card id="risco-cancelamento" className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-700 dark:text-gray-200">Risco de cancelamento</p>
              <Activity className="w-4 h-4 text-blue-600" />
            </div>
            <p className="text-2xl font-bold mt-1">{riskSubscriptions.length}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Detalhamento consolidado de saúde</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-gray-500">Carregando dados...</p>
          ) : systemHealthDetails.length === 0 ? (
            <p className="text-sm text-gray-500">Nenhum evento crítico encontrado.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Entidade</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Severidade</TableHead>
                  <TableHead>Detalhe</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {systemHealthDetails.map((item) => (
                  <TableRow key={`${item.id}-${item.category}`}>
                    <TableCell className="font-medium">{item.category}</TableCell>
                    <TableCell>{item.entity}</TableCell>
                    <TableCell>{item.status}</TableCell>
                    <TableCell>
                      <Badge variant={item.severity === "ALTA" ? "danger" : "warning"}>{item.severity}</Badge>
                    </TableCell>
                    <TableCell>{item.detail}</TableCell>
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
