export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { hasPermission } from "@/lib/authorization";

// GET — listar templates do grupo
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    if (!session || !user?.groupId) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const templates = await (prisma as any).scheduleTemplate.findMany({
      where: { groupId: user.groupId },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    });

    return NextResponse.json(templates);
  } catch (error) {
    console.error("[schedule-templates] GET error:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

// POST — criar template
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    if (!session || !user?.groupId) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const canManage = user.role === "SUPERADMIN" || user.role === "ADMIN" ||
      hasPermission(user.role, "schedule.create", user.permissions);
    if (!canManage) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    const body = await req.json();
    const { name, dayOfWeek, defaultTime, songCount, bandType, roles, isDefault } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "Nome é obrigatório" }, { status: 400 });
    }

    // Se marcado como padrão, desmarcar os outros
    if (isDefault) {
      await (prisma as any).scheduleTemplate.updateMany({
        where: { groupId: user.groupId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const template = await (prisma as any).scheduleTemplate.create({
      data: {
        groupId: user.groupId,
        name: name.trim(),
        dayOfWeek: dayOfWeek ?? null,
        defaultTime: defaultTime?.trim() || null,
        songCount: Number(songCount) || 5,
        bandType: bandType || "full",
        roles: roles ?? [],
        isDefault: Boolean(isDefault),
      },
    });

    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    console.error("[schedule-templates] POST error:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

// PATCH — atualizar template
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    if (!session || !user?.groupId) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const body = await req.json();
    const { id, name, dayOfWeek, defaultTime, songCount, bandType, roles, isDefault } = body;
    if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

    // Verificar que pertence ao grupo
    const existing = await (prisma as any).scheduleTemplate.findFirst({
      where: { id, groupId: user.groupId },
    });
    if (!existing) return NextResponse.json({ error: "Template não encontrado" }, { status: 404 });

    if (isDefault) {
      await (prisma as any).scheduleTemplate.updateMany({
        where: { groupId: user.groupId, isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }

    const template = await (prisma as any).scheduleTemplate.update({
      where: { id },
      data: {
        name: name?.trim() ?? existing.name,
        dayOfWeek: dayOfWeek !== undefined ? dayOfWeek : existing.dayOfWeek,
        defaultTime: defaultTime !== undefined ? (defaultTime?.trim() || null) : existing.defaultTime,
        songCount: songCount !== undefined ? Number(songCount) : existing.songCount,
        bandType: bandType ?? existing.bandType,
        roles: roles ?? existing.roles,
        isDefault: isDefault !== undefined ? Boolean(isDefault) : existing.isDefault,
      },
    });

    return NextResponse.json(template);
  } catch (error) {
    console.error("[schedule-templates] PATCH error:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

// DELETE — remover template
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    if (!session || !user?.groupId) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

    const existing = await (prisma as any).scheduleTemplate.findFirst({
      where: { id, groupId: user.groupId },
    });
    if (!existing) return NextResponse.json({ error: "Template não encontrado" }, { status: 404 });

    await (prisma as any).scheduleTemplate.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[schedule-templates] DELETE error:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
