import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { SessionUser } from "@/lib/types";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3 = new S3Client({
  region: process.env.AWS_REGION || "auto",
  endpoint: process.env.S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
  requestChecksumCalculation: "WHEN_REQUIRED" as any,
  responseChecksumValidation: "WHEN_REQUIRED" as any,
});

// GET — gerar presigned URL para upload direto ao R2
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const user = session.user as SessionUser;
  if (user.role !== "SUPERADMIN") return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const boardId = searchParams.get("boardId");
  const position = searchParams.get("position");
  const filename = searchParams.get("filename") || "audio.wav";
  const contentType = searchParams.get("contentType") || "audio/wav";

  if (!boardId || !position) return NextResponse.json({ error: "boardId e position obrigatórios" }, { status: 400 });

  const ext = filename.split(".").pop() || "wav";
  const r2Key = `pads/${boardId}/${position}_${Date.now()}.${ext}`;

  const command = new PutObjectCommand({
    Bucket: process.env.AWS_BUCKET_NAME!,
    Key: r2Key,
    ContentType: contentType,
    ChecksumAlgorithm: undefined,
  });

  const uploadUrl = await getSignedUrl(s3, command, {
    expiresIn: 3600,
    unhoistableHeaders: new Set(["x-amz-checksum-crc32", "x-amz-sdk-checksum-algorithm"]),
  });
  const publicUrl = `${process.env.R2_PUBLIC_URL || process.env.S3_ENDPOINT}/${process.env.AWS_BUCKET_NAME}/${r2Key}`;

  return NextResponse.json({ uploadUrl, r2Key, publicUrl });
}