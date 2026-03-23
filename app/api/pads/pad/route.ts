import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { SessionUser } from "@/lib/types";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

// Aumentar limite de body para 50MB (arquivos WAV grandes)
export const config = {
  api: { bodyParser: false },
};

// Para App Router do Next.js 14
export const maxDuration = 60;

const s3 = new S3Client({
  region: process.env.AWS_REGION || "auto",
  endpoint: process.env.S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

// POST — criar/atualizar pad com upload de áudio
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    const user = session.user as SessionUser;
    if (user.role !== "SUPERADMIN") return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

    const formData = await req.formData();
    const boardId = formData.get("boardId") as string;
    const position = Number(formData.get("position"));
    const name = (formData.get("name") as string)?.trim() || `Pad ${position + 1}`;
    const type = (formData.get("type") as string) || "ONE_SHOT";
    const color = (formData.get("color") as string) || "#6366F1";
    const volume = Number(formData.get("volume") || 1);
    const midiNote = formData.get("midiNote") ? Number(formData.get("midiNote")) : null;
    const keyboardKey = (formData.get("keyboardKey") as string) || null;
    const loopSync = formData.get("loopSync") === "true";
    const file = formData.get("audio") as File | null;

    if (!boardId) return NextResponse.json({ error: "boardId obrigatório" }, { status: 400 });

    console.log(`[pads/pad] Salvando pad ${position} do board ${boardId}, arquivo: ${file?.name ?? "nenhum"} (${file?.size ?? 0} bytes)`);

    let audioUrl: string | null = null;
    let r2Key: string | null = null;

    // Upload do áudio se fornecido
    if (file && file.size > 0) {
      const ext = file.name.split(".").pop() || "wav";
      r2Key = `pads/${boardId}/${position}_${Date.now()}.${ext}`;
      const arrayBuffer = await file.arrayBuffer();
      
      console.log(`[pads/pad] Enviando para R2: ${r2Key} (${arrayBuffer.byteLength} bytes)`);
      
      await s3.send(new PutObjectCommand({
        Bucket: process.env.AWS_BUCKET_NAME!,
        Key: r2Key,
        Body: Buffer.from(arrayBuffer),
        ContentType: file.type || "audio/wav",
        ACL: "public-read" as any,
      }));

      // URL pública do R2 — usar endpoint público se disponível
      const publicEndpoint = process.env.R2_PUBLIC_URL || process.env.S3_ENDPOINT;
      audioUrl = `${publicEndpoint}/${process.env.AWS_BUCKET_NAME}/${r2Key}`;
      console.log(`[pads/pad] Upload OK: ${audioUrl}`);
    }

    // Verificar se já existe o pad nessa posição
    const existing = await prisma.pad.findUnique({ where: { boardId_position: { boardId, position } } });

    let pad;
    if (existing) {
      if (file && file.size > 0 && existing.r2Key) {
        try { await s3.send(new DeleteObjectCommand({ Bucket: process.env.AWS_BUCKET_NAME!, Key: existing.r2Key })); } catch {}
      }
      pad = await prisma.pad.update({
        where: { boardId_position: { boardId, position } },
        data: {
          name, type: type as any, color, volume, midiNote, keyboardKey, loopSync,
          ...(audioUrl && { audioUrl, r2Key }),
        },
      });
    } else {
      pad = await prisma.pad.create({
        data: { boardId, name, position, type: type as any, color, volume, midiNote, keyboardKey, loopSync, audioUrl, r2Key },
      });
    }

    console.log(`[pads/pad] Pad salvo: ${pad.id}`);
    return NextResponse.json({ pad });

  } catch (err: any) {
    console.error("[pads/pad] Erro:", err?.message || err);
    return NextResponse.json({ error: err?.message || "Erro interno ao salvar pad" }, { status: 500 });
  }
}

// DELETE — remover pad
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const user = session.user as SessionUser;
  if (user.role !== "SUPERADMIN") return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  const pad = await prisma.pad.findUnique({ where: { id } });
  if (!pad) return NextResponse.json({ error: "Pad não encontrado" }, { status: 404 });

  if (pad.r2Key) {
    try { await s3.send(new DeleteObjectCommand({ Bucket: process.env.AWS_BUCKET_NAME!, Key: pad.r2Key })); } catch {}
  }
  await prisma.pad.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
