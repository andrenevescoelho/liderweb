export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { SessionUser } from "@/lib/types";
import { prisma } from "@/lib/db";
import { createS3Client, getBucketConfig } from "@/lib/aws-config";
import { GetObjectCommand } from "@aws-sdk/client-s3";

export async function GET(
  req: NextRequest,
  { params }: { params: { mixId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as SessionUser | undefined;
    if (!session || !user?.groupId) return new NextResponse("Não autorizado", { status: 401 });

    const mix = await (prisma as any).customMix.findFirst({
      where: { id: params.mixId, groupId: user.groupId },
    });

    if (!mix) return new NextResponse("Mix não encontrado", { status: 404 });
    if (!mix.fileKey) return new NextResponse("Arquivo não disponível", { status: 404 });

    const s3Client = createS3Client();
    const { bucketName } = getBucketConfig();

    const command = new GetObjectCommand({ Bucket: bucketName, Key: mix.fileKey });
    const response = await s3Client.send(command);

    if (!response.Body) return new NextResponse("Arquivo não encontrado no storage", { status: 404 });

    const chunks: Uint8Array[] = [];
    const reader = response.Body.transformToWebStream().getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const buffer = Buffer.concat(chunks);

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "audio/wav",
        "Content-Length": String(buffer.length),
        "Cache-Control": "private, max-age=86400",
        "Content-Disposition": `attachment; filename="${mix.name.replace(/[^a-z0-9]/gi, "_")}.wav"`,
      },
    });
  } catch (err) {
    console.error("[custom-mix/audio] error:", err);
    return new NextResponse("Erro interno", { status: 500 });
  }
}
