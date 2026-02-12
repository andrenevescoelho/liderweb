export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { generatePresignedUploadUrl, getFileUrl } from "@/lib/s3";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userRole = (session?.user as any)?.role;

    if (!session || (userRole !== "SUPERADMIN" && userRole !== "ADMIN" && userRole !== "LEADER")) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const body = await req.json();
    const { fileName, contentType } = body;

    if (!fileName || !contentType) {
      return NextResponse.json(
        { error: "Nome e tipo do arquivo são obrigatórios" },
        { status: 400 }
      );
    }

    // Validar tipo de arquivo (apenas áudio)
    const allowedTypes = [
      "audio/mpeg",
      "audio/mp3",
      "audio/wav",
      "audio/ogg",
      "audio/m4a",
      "audio/aac",
      "audio/webm",
    ];

    if (!allowedTypes.includes(contentType) && !contentType.startsWith("audio/")) {
      return NextResponse.json(
        { error: "Apenas arquivos de áudio são permitidos" },
        { status: 400 }
      );
    }

    // Gerar URL de upload (público para que possa ser reproduzido)
    const { uploadUrl, cloud_storage_path } = await generatePresignedUploadUrl(
      fileName,
      contentType,
      true // isPublic = true para áudio ser acessível
    );

    // Gerar URL pública para acesso após upload
    const publicUrl = await getFileUrl(cloud_storage_path, true);

    return NextResponse.json({
      uploadUrl,
      cloud_storage_path,
      publicUrl,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: "Erro ao gerar URL de upload" }, { status: 500 });
  }
}
