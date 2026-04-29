export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";

// POST /api/admin/email-trigger
// Proxy autenticado para o superadmin disparar e-mails sem expor a N8N_API_KEY no frontend

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;

  if (user?.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const body = await req.json();
  const apiKey = process.env.N8N_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: "N8N_API_KEY não configurada no servidor" }, { status: 500 });
  }

  // Chamar a rota interna com a key do servidor
  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const res = await fetch(`${baseUrl}/api/internal/email-trigger`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-n8n-api-key": apiKey,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
