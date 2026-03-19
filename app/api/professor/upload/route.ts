export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { authOptions } from "@/lib/auth-options";
import { SessionUser } from "@/lib/types";
import { canAccessProfessorModule, PROFESSOR_ALLOWED_EXTENSIONS, PROFESSOR_ALLOWED_MIME_TYPES, PROFESSOR_MAX_FILE_SIZE, sanitizeFileName } from "@/lib/professor";
import { createS3Client, getBucketConfig } from "@/lib/aws-config";

function getExtension(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const user = session?.user as SessionUser | undefined;

  if (!session || !user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!user.groupId || user.role === "SUPERADMIN") return NextResponse.json({ error: "Usuário sem ministério" }, { status: 400 });

  const access = await canAccessProfessorModule(user.id, user.groupId, user.role);
  if (!access.enabled) return NextResponse.json({ error: "Módulo não habilitado" }, { status: 403 });

  const { fileName, mimeType, fileSize } = await req.json();

  if (!fileName || !mimeType || typeof fileSize !== "number") {
    return NextResponse.json({ error: "Parâmetros inválidos" }, { status: 400 });
  }

  const extension = getExtension(fileName);

  if (!PROFESSOR_ALLOWED_EXTENSIONS.includes(extension)) {
    return NextResponse.json({ error: "Formato inválido. Use mp3, wav, m4a, webm ou ogg." }, { status: 400 });
  }

  if (!PROFESSOR_ALLOWED_MIME_TYPES.includes(mimeType)) {
    return NextResponse.json({ error: "MIME type inválido para áudio" }, { status: 400 });
  }

  if (fileSize > PROFESSOR_MAX_FILE_SIZE) {
    return NextResponse.json({ error: "Arquivo excede o limite de 20MB" }, { status: 400 });
  }

  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const safeName = sanitizeFileName(fileName);
  const uniqueName = `${Date.now()}-${crypto.randomUUID()}-${safeName}`;

  const { bucketName, folderPrefix } = getBucketConfig();
  const key = `${folderPrefix}professor/${user.groupId}/${user.id}/${year}/${month}/${uniqueName}`;

  const client = createS3Client();
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    ContentType: mimeType,
  });

  const uploadUrl = await getSignedUrl(client, command, { expiresIn: 600 });

  const endpoint = process.env.S3_ENDPOINT || "";
  const publicUrl = endpoint
    ? `${endpoint.replace(/\/$/, "")}/${bucketName}/${key}`
    : `https://${bucketName}.s3.${process.env.AWS_REGION ?? "us-east-1"}.amazonaws.com/${key}`;

  return NextResponse.json({ uploadUrl, fileKey: key, fileUrl: publicUrl });
}
