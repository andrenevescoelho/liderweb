export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { SessionUser } from "@/lib/types";
import { hasPermission } from "@/lib/authorization";

const isGroupAdminProtected = (
  requester: { role: string },
  targetUser: { role: string }
) => requester.role !== "SUPERADMIN" && targetUser.role === "ADMIN";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const sessionUser = session.user as SessionUser;

    const requester = await prisma.user.findUnique({
      where: { id: sessionUser.id },
      include: { profile: true },
    });

    if (!requester || !hasPermission(requester.role, "member.manage", requester.profile?.permissions)) {
      return NextResponse.json({ error: "Sem permissão para visualizar membro" }, { status: 403 });
    }

    const member = await prisma.user.findUnique({
      where: { id: params?.id },
      include: { profile: true },
    });

    if (!member) {
      return NextResponse.json({ error: "Membro não encontrado" }, { status: 404 });
    }

    if (requester.role !== "SUPERADMIN" && member.groupId !== requester.groupId) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    return NextResponse.json(member);
  } catch (error) {
    console.error("Get member error:", error);
    return NextResponse.json({ error: "Erro ao buscar membro" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const sessionUser = session?.user as SessionUser | undefined;

    if (!session || !sessionUser) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const requester = await prisma.user.findUnique({
      where: { id: sessionUser.id },
      include: { profile: true },
    });

    if (!requester || !hasPermission(requester.role, "member.manage", requester.profile?.permissions)) {
      return NextResponse.json({ error: "Sem permissão para gerenciar membros" }, { status: 403 });
    }

    const body = await req.json();
    const { name, role, instruments, voiceType, vocalRange, comfortableKeys, availability, phone, active, memberFunction, leadershipRole, permissions } = body ?? {};

    const updateData: any = {};
    if (name) updateData.name = name;
    if (role && requester.role !== "LEADER") updateData.role = role;

    const targetUser = await prisma.user.findUnique({ where: { id: params?.id } });

    if (!targetUser) {
      return NextResponse.json({ error: "Membro não encontrado" }, { status: 404 });
    }

    if (requester.role !== "SUPERADMIN" && targetUser.groupId !== requester.groupId) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    if (isGroupAdminProtected(requester, targetUser)) {
      return NextResponse.json(
        { error: "O administrador do grupo só pode ser alterado por um superadmin global." },
        { status: 403 }
      );
    }

    await prisma.user.update({
      where: { id: params?.id },
      data: updateData,
    });

    await prisma.memberProfile.upsert({
      where: { userId: params?.id },
      update: {
        instruments: instruments ?? [],
        voiceType: voiceType ?? null,
        vocalRange: vocalRange ?? null,
        comfortableKeys: comfortableKeys ?? [],
        availability: availability ?? [],
        phone: phone ?? null,
        active: active ?? true,
        memberFunction: memberFunction ?? null,
        leadershipRole: leadershipRole ?? null,
        permissions: permissions ?? [],
      },
      create: {
        userId: params?.id,
        instruments: instruments ?? [],
        voiceType: voiceType ?? null,
        vocalRange: vocalRange ?? null,
        comfortableKeys: comfortableKeys ?? [],
        availability: availability ?? [],
        phone: phone ?? null,
        active: active ?? true,
        memberFunction: memberFunction ?? null,
        leadershipRole: leadershipRole ?? null,
        permissions: permissions ?? [],
      },
    });

    const updatedUser = await prisma.user.findUnique({
      where: { id: params?.id },
      include: { profile: true },
    });

    return NextResponse.json(updatedUser);
  } catch (error) {
    console.error("Update member error:", error);
    return NextResponse.json({ error: "Erro ao atualizar membro" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const sessionUser = session?.user as SessionUser | undefined;

    if (!session || !sessionUser) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const requester = await prisma.user.findUnique({
      where: { id: sessionUser.id },
      include: { profile: true },
    });

    if (!requester || !hasPermission(requester.role, "member.manage", requester.profile?.permissions)) {
      return NextResponse.json({ error: "Sem permissão para excluir membros" }, { status: 403 });
    }

    const targetUser = await prisma.user.findUnique({ where: { id: params?.id } });

    if (!targetUser) {
      return NextResponse.json({ error: "Membro não encontrado" }, { status: 404 });
    }

    if (requester.role !== "SUPERADMIN" && targetUser.groupId !== requester.groupId) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    if (isGroupAdminProtected(requester, targetUser)) {
      return NextResponse.json(
        { error: "O administrador do grupo só pode ser alterado por um superadmin global." },
        { status: 403 }
      );
    }

    await prisma.user.delete({
      where: { id: params?.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete member error:", error);
    return NextResponse.json({ error: "Erro ao excluir membro" }, { status: 500 });
  }
}
