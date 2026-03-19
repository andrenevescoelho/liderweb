export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { generatePresignedUploadUrl, getFileUrl } from "@/lib/s3";
import { SessionUser } from "@/lib/types";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    const user = session.user as SessionUser;
    if (!user.groupId) return NextResponse.json({ error: "Sem grupo" }, { status: 400 });

    // Verify music coach is enabled
    const coachProfile = await prisma.musicCoachProfile.findUnique({
      where: { userId_groupId: { userId: user.id, groupId: user.groupId } },
      select: { enabled: true },
    });
    if (!coachProfile?.enabled) {
      return NextResponse.json({ error: "Módulo não habilitado" }, { status: 403 });
    }

    const body = await req.json();
    const { fileName, contentType } = body;

    if (!fileName || !contentType) {
      return NextResponse.json({ error: "Nome e tipo do arquivo são obrigatórios" }, { status: 400 });
    }

    const allowedTypes = ["audio/mpeg", "audio/mp3", "audio/wav", "audio/ogg", "audio/m4a", "audio/aac", "audio/webm", "audio/mp4"];
    if (!allowedTypes.includes(contentType) && !contentType.startsWith("audio/")) {
      return NextResponse.json({ error: "Apenas arquivos de áudio são permitidos" }, { status: 400 });
    }

    const { uploadUrl, cloud_storage_path } = await generatePresignedUploadUrl(
      `practice-${fileName}`,
      contentType,
      false // private — only accessible via signed URL
    );

    return NextResponse.json({ uploadUrl, cloud_storage_path });
  } catch (error) {
    console.error("[music-coach/upload] error:", error);
    return NextResponse.json({ error: "Erro ao gerar URL de upload" }, { status: 500 });
  }
}
