export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { SessionUser } from "@/lib/types";
import { createS3Client, getBucketConfig } from "@/lib/aws-config";
import { GetObjectCommand } from "@aws-sdk/client-s3";

export async function GET(
  req: NextRequest,
  { params }: { params: { albumId: string; stemIndex: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return new NextResponse("Não autorizado", { status: 401 });
    const user = session.user as SessionUser;
    if (!user.groupId) return new NextResponse("Sem grupo", { status: 400 });

    const { albumId, stemIndex } = params;
    const idx = parseInt(stemIndex);

    // Verificar aluguel ativo
    const rental = await prisma.multitracksRental.findUnique({
      where: { groupId_albumId: { groupId: user.groupId, albumId } },
      include: { album: true },
    });

    if (!rental || rental.status !== "ACTIVE" || rental.expiresAt < new Date()) {
      return new NextResponse("Acesso não autorizado", { status: 403 });
    }

    const stems = Array.isArray(rental.album.stems)
      ? rental.album.stems as { name: string; r2Key: string }[]
      : [];

    if (idx < 0 || idx >= stems.length) {
      return new NextResponse("Stem não encontrado", { status: 404 });
    }

    const stem = stems[idx];
    const s3Client = createS3Client();
    const { bucketName } = getBucketConfig();

    // Buscar o arquivo diretamente do R2 via SDK (server-side, sem CORS)
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: stem.r2Key,
    });

    const response = await s3Client.send(command);

    if (!response.Body) {
      return new NextResponse("Arquivo não encontrado no storage", { status: 404 });
    }

    // Stream o áudio diretamente para o cliente
    const chunks: Uint8Array[] = [];
    const reader = response.Body.transformToWebStream().getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    const buffer = Buffer.concat(chunks);
    const contentType = stem.r2Key.endsWith(".mp3") ? "audio/mpeg" : "audio/wav";

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(buffer.length),
        "Cache-Control": "private, max-age=3600",
        "Accept-Ranges": "bytes",
      },
    });
  } catch (err) {
    console.error("[audio-proxy] error:", err);
    return new NextResponse("Erro interno", { status: 500 });
  }
}
