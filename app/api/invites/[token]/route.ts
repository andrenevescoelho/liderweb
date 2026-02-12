import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET - Validar token de convite
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    
    const invite = await prisma.inviteToken.findUnique({
      where: { token },
      include: {
        group: { select: { id: true, name: true } },
      },
    });
    
    if (!invite) {
      return NextResponse.json({ error: "Convite não encontrado" }, { status: 404 });
    }
    
    if (invite.used) {
      return NextResponse.json({ error: "Este convite já foi utilizado" }, { status: 400 });
    }
    
    if (invite.expiresAt < new Date()) {
      return NextResponse.json({ error: "Este convite expirou" }, { status: 400 });
    }
    
    return NextResponse.json({
      valid: true,
      email: invite.email,
      groupName: invite.group.name,
      groupId: invite.group.id,
    });
  } catch (error) {
    console.error("Error validating invite:", error);
    return NextResponse.json({ error: "Erro ao validar convite" }, { status: 500 });
  }
}
