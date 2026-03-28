import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { SessionUser } from "@/lib/types";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({
  region: process.env.AWS_REGION || "auto",
  endpoint: process.env.S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

// POST — criar/atualizar pad (aceita JSON com audioUrl já no R2, ou FormData com arquivo)
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    const user = session.user as SessionUser;
    if (user.role !== "SUPERADMIN") return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

    const contentType = req.headers.get("content-type") || "";
    let boardId: string, position: number, name: string, type: string;
    let color: string, volume: number, midiNote: number | null;
    let keyboardKey: string | null, loopSync: boolean;
    let audioUrl: string | null = null, r2Key: string | null = null;

    if (contentType.includes("application/json")) {
      // JSON — audioUrl já resolvida (via presigned URL ou outro método)
      const body = await req.json();
      boardId = body.boardId; position = Number(body.position);
      name = body.name || `Pad ${position + 1}`; type = body.type || "ONE_SHOT";
      color = body.color || "#6366F1"; volume = Number(body.volume ?? 1);
      midiNote = body.midiNote ?? null; keyboardKey = body.keyboardKey || null;
      loopSync = body.loopSync === true;
      audioUrl = body.audioUrl || null; r2Key = body.r2Key || null;
    } else {
      // FormData — upload direto (para arquivos até ~20MB)
      const fd = await req.formData();
      boardId = fd.get("boardId") as string; position = Number(fd.get("position"));
      name = (fd.get("name") as string)?.trim() || `Pad ${position + 1}`;
      type = (fd.get("type") as string) || "ONE_SHOT";
      color = (fd.get("color") as string) || "#6366F1";
      volume = Number(fd.get("volume") ?? 1);
      midiNote = fd.get("midiNote") ? Number(fd.get("midiNote")) : null;
      keyboardKey = (fd.get("keyboardKey") as string) || null;
      loopSync = fd.get("loopSync") === "true";
      const file = fd.get("audio") as File | null;

      if (file && file.size > 0) {
        const ext = file.name.split(".").pop() || "mp3";
        r2Key = `pads/${boardId}/${position}_${Date.now()}.${ext}`;
        const arrayBuffer = await file.arrayBuffer();
        console.log(`[pads/pad] Upload: ${r2Key} (${(arrayBuffer.byteLength / 1024 / 1024).toFixed(1)}MB)`);
        await s3.send(new PutObjectCommand({
          Bucket: process.env.AWS_BUCKET_NAME!,
          Key: r2Key,
          Body: Buffer.from(arrayBuffer),
          ContentType: file.type || "audio/mpeg",
        }));
        audioUrl = r2Key; // só armazenamos a key, URL é gerada pelo proxy
        console.log(`[pads/pad] Upload OK: ${r2Key}`);
      }
    }

    if (!boardId) return NextResponse.json({ error: "boardId obrigatório" }, { status: 400 });

    const existing = await prisma.pad.findUnique({ where: { boardId_position: { boardId, position } } });

    let pad;
    if (existing) {
      if (r2Key && existing.r2Key && existing.r2Key !== r2Key) {
        try { await s3.send(new DeleteObjectCommand({ Bucket: process.env.AWS_BUCKET_NAME!, Key: existing.r2Key })); } catch {}
      }
      pad = await prisma.pad.update({
        where: { boardId_position: { boardId, position } },
        data: { name, type: type as any, color, volume, midiNote, keyboardKey, loopSync, ...(r2Key && { r2Key, audioUrl: r2Key }) },
      });
    } else {
      pad = await prisma.pad.create({
        data: { boardId, name, position, type: type as any, color, volume, midiNote, keyboardKey, loopSync, audioUrl: r2Key || null, r2Key: r2Key || null },
      });
    }

    return NextResponse.json({ pad });
  } catch (err: any) {
    console.error("[pads/pad] Erro:", err?.message || err);
    return NextResponse.json({ error: err?.message || "Erro interno" }, { status: 500 });
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
