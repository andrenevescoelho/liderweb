import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { SessionUser } from "@/lib/types";
import { logUserAction, AUDIT_ACTIONS } from "@/lib/audit-log";

export const dynamic = "force-dynamic";

// GET - List group members with music coach status (admin only)
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    const user = session.user as SessionUser;
    if (!["ADMIN", "SUPERADMIN"].includes(user.role)) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }
    if (!user.groupId && user.role !== "SUPERADMIN") {
      return NextResponse.json({ error: "Grupo não encontrado" }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const groupId = searchParams.get("groupId") || user.groupId;
    if (!groupId) return NextResponse.json({ error: "groupId obrigatório" }, { status: 400 });

    const members = await prisma.user.findMany({
      where: { groupId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        profile: {
          select: { voiceType: true },
        },
        memberFunctions: {
          where: { isPending: false },
          include: { roleFunction: { select: { name: true } } },
        },
        musicCoachProfiles: {
          where: { groupId },
          select: { id: true, enabled: true, level: true },
        },
      },
      orderBy: { name: "asc" },
    });

    const result = members.map((m) => {
      const roles = m.memberFunctions.map((mf) => mf.roleFunction.name);
      return {
        id: m.id,
        name: m.name,
        email: m.email,
        role: m.role,
        memberFunction: roles[0] || null,
        memberFunctions: roles,
        voiceType: m.profile?.voiceType || null,
        coachEnabled: m.musicCoachProfiles[0]?.enabled ?? false,
        coachLevel: m.musicCoachProfiles[0]?.level ?? 1,
        coachProfileId: m.musicCoachProfiles[0]?.id ?? null,
      };
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("[music-coach/config] GET error:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

// POST - Enable/disable music coach for a member
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    const user = session.user as SessionUser;
    if (!["ADMIN", "SUPERADMIN"].includes(user.role)) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    const body = await req.json();
    const { userIds, enabled, groupId: bodyGroupId } = body;
    const groupId = bodyGroupId || user.groupId;
    if (!groupId) return NextResponse.json({ error: "groupId obrigatório" }, { status: 400 });
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json({ error: "userIds obrigatório" }, { status: 400 });
    }

    const results = [];
    for (const userId of userIds) {
      const targetUser = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
      const profile = await prisma.musicCoachProfile.upsert({
        where: { userId_groupId: { userId, groupId } },
        create: { userId, groupId, enabled: enabled !== false },
        update: { enabled: enabled !== false },
      });
      results.push(profile);

      // Audit log
      await logUserAction({
        userId: user.id,
        groupId,
        action: enabled !== false ? AUDIT_ACTIONS.COACH_ENABLED : AUDIT_ACTIONS.COACH_DISABLED,
        entityType: "COACH",
        entityId: profile.id,
        entityName: targetUser?.name || userId,
        description: `Professor IA ${enabled !== false ? "habilitado" : "desabilitado"} para ${targetUser?.name || userId}`,
        metadata: { targetUserId: userId },
      });
    }

    return NextResponse.json({ success: true, count: results.length });
  } catch (err) {
    console.error("[music-coach/config] POST error:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
