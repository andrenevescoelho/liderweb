import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { SessionUser } from "@/lib/types";

// GET — listar boards com URLs de proxy
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const user = session.user as SessionUser;
  const isSuperAdmin = user.role === "SUPERADMIN";

  const boards = await prisma.padBoard.findMany({
    where: isSuperAdmin ? {} : { isActive: true },
    include: { pads: { orderBy: { position: "asc" } } },
    orderBy: { createdAt: "desc" },
  });

  // Substituir audioUrl pela URL do proxy (não expõe R2 diretamente)
  const boardsWithProxy = boards.map(board => ({
    ...board,
    pads: board.pads.map(pad => ({
      ...pad,
      audioUrl: pad.r2Key ? `/api/pads/audio?padId=${pad.id}` : null,
    })),
  }));

  return NextResponse.json({ boards: boardsWithProxy });
}

// POST — criar board (SUPERADMIN)
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const user = session.user as SessionUser;
  if (user.role !== "SUPERADMIN") return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const body = await req.json();
  const { name, description, bpm, musicalKey, color, cols, rows } = body;

  if (!name?.trim()) return NextResponse.json({ error: "Nome é obrigatório" }, { status: 400 });

  const board = await prisma.padBoard.create({
    data: {
      name: name.trim(),
      description: description?.trim() || null,
      bpm: bpm ? Number(bpm) : null,
      musicalKey: musicalKey?.trim() || null,
      color: color || "#8B5CF6",
      cols: Math.min(Math.max(Number(cols) || 4, 2), 8),
      rows: Math.min(Math.max(Number(rows) || 4, 2), 8),
      createdBy: user.id,
    },
    include: { pads: true },
  });

  return NextResponse.json({ board });
}

// PATCH — atualizar board (SUPERADMIN)
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const user = session.user as SessionUser;
  if (user.role !== "SUPERADMIN") return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const body = await req.json();
  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  const board = await prisma.padBoard.update({
    where: { id },
    data: {
      ...(updates.name && { name: updates.name }),
      ...(updates.description !== undefined && { description: updates.description || null }),
      ...(updates.bpm !== undefined && { bpm: updates.bpm ? Number(updates.bpm) : null }),
      ...(updates.musicalKey !== undefined && { musicalKey: updates.musicalKey || null }),
      ...(updates.color && { color: updates.color }),
      ...(updates.cols && { cols: Math.min(Math.max(Number(updates.cols), 2), 8) }),
      ...(updates.rows && { rows: Math.min(Math.max(Number(updates.rows), 2), 8) }),
      ...(updates.isActive !== undefined && { isActive: updates.isActive }),
    },
    include: { pads: { orderBy: { position: "asc" } } },
  });

  return NextResponse.json({ board });
}

// DELETE — excluir board (SUPERADMIN)
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const user = session.user as SessionUser;
  if (user.role !== "SUPERADMIN") return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  await prisma.padBoard.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
