import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { listImportHistory, resolveImportScope } from "@/lib/csv-import";
import { SessionUser } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  const user = session?.user as SessionUser | undefined;

  if (!user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    await resolveImportScope(user);
    const jobs = await listImportHistory(user);
    return NextResponse.json(jobs);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || "Sem permissão" }, { status: 403 });
  }
}
