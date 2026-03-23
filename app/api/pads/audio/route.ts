import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { SessionUser } from "@/lib/types";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({
  region: process.env.AWS_REGION || "auto",
  endpoint: process.env.S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

// GET /api/pads/audio?padId=xxx — proxy de áudio
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return new NextResponse("Não autorizado", { status: 401 });

  const { searchParams } = new URL(req.url);
  const padId = searchParams.get("padId");
  if (!padId) return new NextResponse("padId obrigatório", { status: 400 });

  const pad = await prisma.pad.findUnique({ where: { id: padId } });
  if (!pad?.r2Key) return new NextResponse("Pad não encontrado", { status: 404 });

  try {
    const obj = await s3.send(new GetObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME!,
      Key: pad.r2Key,
    }));

    const ext = pad.r2Key.split(".").pop() || "mp3";
    const contentType = ext === "mp3" ? "audio/mpeg" : ext === "wav" ? "audio/wav" : ext === "ogg" ? "audio/ogg" : "audio/mpeg";

    return new NextResponse(obj.Body as any, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=3600",
        ...(obj.ContentLength && { "Content-Length": String(obj.ContentLength) }),
      },
    });
  } catch (err) {
    console.error("[pads/audio] Erro:", err);
    return new NextResponse("Erro ao carregar áudio", { status: 500 });
  }
}
