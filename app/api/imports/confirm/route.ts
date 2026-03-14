import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { confirmImportJob } from "@/lib/csv-import";
import { SessionUser } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const user = session?.user as SessionUser | undefined;

  if (!user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const jobId = body?.jobId as string | undefined;

    if (!jobId) {
      return NextResponse.json({ error: "jobId é obrigatório" }, { status: 400 });
    }

    const result = await confirmImportJob({ jobId, user });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || "Falha ao confirmar importação" }, { status: 400 });
  }
}
