export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { processNextDownloadJob } from "@/lib/multitracks-download";

// Chave interna para proteger a rota de chamadas externas
const WORKER_SECRET = process.env.WORKER_SECRET ?? "liderweb-worker-internal";

export async function POST(req: NextRequest) {
  try {
    // Validar chamada interna
    const secret = req.headers.get("x-worker-secret");
    if (secret !== WORKER_SECRET) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const result = await processNextDownloadJob();
    return NextResponse.json({ result });
  } catch (error: any) {
    console.error("[worker route] erro:", error);
    return NextResponse.json({ error: error?.message ?? "Erro interno" }, { status: 500 });
  }
}
