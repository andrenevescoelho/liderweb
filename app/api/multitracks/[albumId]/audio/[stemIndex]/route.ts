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

    // Ler arquivo completo do R2
    const chunks: Uint8Array[] = [];
    const reader = response.Body.transformToWebStream().getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const fullBuffer = Buffer.concat(chunks);
    const totalSize = fullBuffer.length;
    const contentType = stem.r2Key.endsWith(".mp3") ? "audio/mpeg" : "audio/wav";

    // Suporte a Range Requests (streaming progressivo)
    const rangeHeader = req.headers.get("range");
    if (rangeHeader) {
      const match = rangeHeader.match(/bytes=(\d*)-(\d*)/);
      if (match) {
        const start = match[1] ? parseInt(match[1]) : 0;
        const end   = match[2] ? parseInt(match[2]) : totalSize - 1;
        const chunkSize = end - start + 1;
        const chunk = fullBuffer.slice(start, end + 1);

        return new NextResponse(chunk, {
          status: 206,
          headers: {
            "Content-Type":        contentType,
            "Content-Length":      String(chunkSize),
            "Content-Range":       `bytes ${start}-${end}/${totalSize}`,
            "Accept-Ranges":       "bytes",
            "Cache-Control":       "private, no-store, max-age=0",
            "Content-Disposition": "inline",
            "X-Content-Type-Options": "nosniff",
            "X-Robots-Tag":        "noindex",
          },
        });
      }
    }

    // Sem Range — retornar arquivo completo
    return new NextResponse(fullBuffer, {
      status: 200,
      headers: {
        "Content-Type":        contentType,
        "Content-Length":      String(totalSize),
        "Accept-Ranges":       "bytes",
        "Cache-Control":       "private, no-store, max-age=0",
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag":        "noindex",
      },
    });
  } catch (err) {
    console.error("[audio-proxy] error:", err);
    return new NextResponse("Erro interno", { status: 500 });
  }
}
