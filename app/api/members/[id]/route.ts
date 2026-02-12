export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const member = await prisma.user.findUnique({
      where: { id: params?.id },
      include: { profile: true },
    });

    if (!member) {
      return NextResponse.json({ error: "Membro não encontrado" }, { status: 404 });
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
    const userRole = (session?.user as any)?.role;

    if (!session || (userRole !== "ADMIN" && userRole !== "LEADER")) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const body = await req.json();
    const { name, role, instruments, voiceType, vocalRange, comfortableKeys, availability, phone, active } = body ?? {};

    const updateData: any = {};
    if (name) updateData.name = name;
    if (role && userRole === "ADMIN") updateData.role = role;

    const user = await prisma.user.update({
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
    const userRole = (session?.user as any)?.role;

    if (!session || userRole !== "ADMIN") {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
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
