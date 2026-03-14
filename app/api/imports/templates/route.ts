import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { getCsvTemplate, resolveImportScope } from "@/lib/csv-import";
import { SessionUser } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as SessionUser | undefined;

    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    await resolveImportScope(user);

    const type = req.nextUrl.searchParams.get("type");
    if (type !== "members" && type !== "songs") {
      return NextResponse.json({ error: "Tipo de template inválido" }, { status: 400 });
    }

    const template = getCsvTemplate(type);

    return new NextResponse(template.content, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename=${template.filename}`,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || "Sem permissão" }, { status: 403 });
  }
}
