import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import {
  confirmImportJob,
  createImportJob,
  logImportStarted,
  markImportFailed,
  previewCsvImport,
  resolveImportScope,
} from "@/lib/csv-import";
import { SessionUser } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const user = session?.user as SessionUser | undefined;

  if (!user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file");
  const importType = formData.get("importType");
  const mode = formData.get("mode");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Arquivo CSV é obrigatório" }, { status: 400 });
  }

  if (importType !== "members" && importType !== "songs") {
    return NextResponse.json({ error: "Tipo de importação inválido" }, { status: 400 });
  }

  if (mode !== "validate" && mode !== "create" && mode !== "create_or_update") {
    return NextResponse.json({ error: "Modo de importação inválido" }, { status: 400 });
  }

  try {
    const scope = await resolveImportScope(user);

    await logImportStarted(user, importType, {
      filename: file.name,
      mode,
    });

    const preview = await previewCsvImport({
      file,
      importType,
      mode,
      user,
    });

    const jobId = await createImportJob({
      preview,
      user,
      groupId: scope.groupId,
    });

    if (mode === "validate") {
      return NextResponse.json({
        jobId,
        jobStatus: "VALIDATED",
        ...preview,
      });
    }

    const execution = await confirmImportJob({ jobId, user });

    return NextResponse.json({
      jobId,
      jobStatus: "COMPLETED",
      execution,
      ...preview,
    });
  } catch (error) {
    await markImportFailed(user, importType, (error as Error).message, { filename: file.name, mode });
    return NextResponse.json({ error: (error as Error).message || "Falha ao validar CSV" }, { status: 400 });
  }
}
