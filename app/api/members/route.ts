export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { SessionUser } from "@/lib/types";
import { hasPermission } from "@/lib/authorization";
import { getEffectivePlanFromCoupon } from "@/lib/coupons";
import { ensureDefaultRoleFunctions } from "@/lib/role-functions";
import { MEMBER_FUNCTION_OPTIONS } from "@/lib/member-profile";

const parseBirthDate = (birthDate?: string | null) => {
  if (!birthDate) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    return new Date(`${birthDate}T12:00:00.000Z`);
  }
  const parsedDate = new Date(birthDate);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
};

const hasRequestedPermissions = (permissions?: string[]) => {
  return Array.isArray(permissions) && permissions.length > 0;
};

/** Sincroniza roles aprovados na tabela MemberFunction (usado pelo líder) */
async function syncMemberFunctions(memberId: string, groupId: string, roleValues: string[]) {
  const roleFunctionMap = await ensureDefaultRoleFunctions(groupId);

  const current = await prisma.memberFunction.findMany({
    where: { memberId, isPending: false },
    select: { id: true, roleFunctionId: true },
  });

  const desiredIds = new Set(
    roleValues
      .map((v) => roleFunctionMap[v as keyof typeof roleFunctionMap])
      .filter(Boolean)
  );
  const currentIds = new Set(current.map((c) => c.roleFunctionId));

  const toRemove = current.filter((c) => !desiredIds.has(c.roleFunctionId)).map((c) => c.id);
  if (toRemove.length > 0) {
    await prisma.memberFunction.deleteMany({ where: { id: { in: toRemove } } });
  }

  for (const roleFunctionId of desiredIds) {
    if (!currentIds.has(roleFunctionId)) {
      await prisma.memberFunction.create({
        data: { memberId, roleFunctionId, isPending: false, approvedAt: new Date() },
      });
    }
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const user = session.user as SessionUser;
    const searchParams = req?.nextUrl?.searchParams;
    const roleFilter = searchParams?.get?.("instrument"); // mantém param "instrument" por compatibilidade
    const voice = searchParams?.get?.("voice");
    const active = searchParams?.get?.("active");

    const where: any = {};

    if (user.role !== "SUPERADMIN") {
      if (!user.groupId) return NextResponse.json([]);
      where.groupId = user.groupId;
    }

    where.role = { not: "SUPERADMIN" };

    if (voice) {
      where.profile = { ...where?.profile, voiceType: voice };
    }
    if (active !== null && active !== undefined) {
      where.profile = { ...where?.profile, active: active === "true" };
    }

    const members = await prisma.user.findMany({
      where,
      include: {
        profile: true,
        memberFunctions: {
          where: { isPending: false },
          include: { roleFunction: { select: { name: true } } },
        },
      },
      orderBy: { name: "asc" },
    }).catch(() =>
      // Fallback: se memberFunctions ainda não existe no Prisma Client, busca sem ele
      prisma.user.findMany({
        where,
        include: { profile: true },
        orderBy: { name: "asc" },
      })
    );

    // Serializa approvedRoles como values (ex: "VOCAL") a partir dos labels (ex: "Vocal")
    const result = members.map((m: any) => ({
      ...m,
      approvedRoles: (m.memberFunctions ?? []).map((mf: any) => {
        const option = MEMBER_FUNCTION_OPTIONS.find((o) => o.label === mf.roleFunction?.name);
        return option?.value ?? mf.roleFunction?.name ?? "";
      }).filter(Boolean),
    }));

    return NextResponse.json(result ?? []);
  } catch (error) {
    console.error("Get members error:", error);
    return NextResponse.json({ error: "Erro ao buscar membros" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const currentUser = session?.user as SessionUser | undefined;
    const userRole = currentUser?.role;

    if (!session || !currentUser) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const requester = await prisma.user.findUnique({
      where: { id: currentUser.id },
      include: { profile: true },
    });

    if (!requester || !hasPermission(requester.role, "member.manage", requester.profile?.permissions)) {
      return NextResponse.json({ error: "Sem permissão para gerenciar membros" }, { status: 403 });
    }

    const canManageMemberPermissions =
      requester.role === "SUPERADMIN" ||
      requester.role === "ADMIN" ||
      hasPermission(requester.role as any, "permission.manage", requester.profile?.permissions);

    const body = await req.json();
    const {
      name,
      email,
      password,
      userId,
      roles,         // array de values: ["VOCAL", "TECLADO"]
      voiceType,
      vocalRange,
      comfortableKeys,
      availability,
      phone,
      birthDate,
      active,
      leadershipRole,
      permissions,
    } = body ?? {};

    // Criar novo usuário
    if (email && password) {
      if (!name) {
        return NextResponse.json({ error: "Nome é obrigatório" }, { status: 400 });
      }

      const existingUser = await prisma.user.findUnique({ where: { email } });
      if (existingUser) {
        return NextResponse.json({ error: "Email já está em uso" }, { status: 400 });
      }

      let groupId = null;
      if (userRole === "SUPERADMIN") {
        groupId = body.groupId || null;
      } else {
        if (!currentUser?.groupId) {
          return NextResponse.json({ error: "Você não está associado a nenhum grupo" }, { status: 400 });
        }
        groupId = currentUser.groupId;
      }

      if (groupId) {
        const subscription = await prisma.subscription.findUnique({
          where: { groupId },
          include: {
            plan: true,
            couponRedemptions: {
              where: { status: "ACTIVE" },
              orderBy: { redeemedAt: "desc" },
              take: 1,
              include: { coupon: true },
            },
          },
        });

        const activeRedemption = subscription?.couponRedemptions?.[0] ?? null;
        const effectivePlan = subscription
          ? getEffectivePlanFromCoupon(subscription.plan, activeRedemption)
          : null;

        if (effectivePlan && effectivePlan.userLimit > 0) {
          const userCount = await prisma.user.count({ where: { groupId } });
          if (userCount >= effectivePlan.userLimit) {
            return NextResponse.json(
              {
                error: `Limite de usuários atingido (${effectivePlan.userLimit}). Faça upgrade do seu plano para adicionar mais membros.`,
                limitReached: true,
              },
              { status: 403 }
            );
          }
        }
      }

      if (hasRequestedPermissions(permissions) && !canManageMemberPermissions) {
        return NextResponse.json({ error: "Sem permissão para definir permissões do membro" }, { status: 403 });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const newUser = await prisma.user.create({
        data: {
          name,
          email,
          password: hashedPassword,
          role: "MEMBER",
          groupId,
          profile: {
            create: {
              voiceType: voiceType ?? null,
              vocalRange: vocalRange ?? null,
              comfortableKeys: comfortableKeys ?? [],
              availability: availability ?? [],
              phone: phone ?? null,
              birthDate: parseBirthDate(birthDate),
              active: active ?? true,
              leadershipRole: leadershipRole ?? null,
              ...(canManageMemberPermissions ? { permissions: permissions ?? [] } : {}),
            },
          },
        },
        include: { profile: true },
      });

      // Sincroniza roles após criar o usuário
      if (Array.isArray(roles) && roles.length > 0 && groupId) {
        await syncMemberFunctions(newUser.id, groupId, roles);
      }

      return NextResponse.json(newUser, { status: 201 });
    }

    // Atualizar perfil existente (path legado via userId)
    if (userId) {
      if (userRole !== "SUPERADMIN") {
        const targetUser = await prisma.user.findUnique({ where: { id: userId } });
        if (!targetUser || targetUser.groupId !== currentUser?.groupId) {
          return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
        }
        if (targetUser.role === "ADMIN" && userRole !== "ADMIN") {
          return NextResponse.json(
            { error: "O administrador do grupo só pode ser alterado por um admin do grupo ou superadmin global." },
            { status: 403 }
          );
        }
      }

      if (hasRequestedPermissions(permissions) && requester.id !== userId && !canManageMemberPermissions) {
        return NextResponse.json({ error: "Sem permissão para alterar permissões de outros membros" }, { status: 403 });
      }

      const targetUser = await prisma.user.findUnique({ where: { id: userId } });

      const profile = await prisma.memberProfile.upsert({
        where: { userId },
        update: {
          voiceType: voiceType ?? null,
          vocalRange: vocalRange ?? null,
          comfortableKeys: comfortableKeys ?? [],
          availability: availability ?? [],
          phone: phone ?? null,
          birthDate: parseBirthDate(birthDate),
          active: active ?? true,
          leadershipRole: leadershipRole ?? null,
          ...(canManageMemberPermissions ? { permissions: permissions ?? [] } : {}),
        },
        create: {
          userId,
          voiceType: voiceType ?? null,
          vocalRange: vocalRange ?? null,
          comfortableKeys: comfortableKeys ?? [],
          availability: availability ?? [],
          phone: phone ?? null,
          birthDate: parseBirthDate(birthDate),
          active: active ?? true,
          leadershipRole: leadershipRole ?? null,
          ...(canManageMemberPermissions ? { permissions: permissions ?? [] } : {}),
        },
      });

      if (Array.isArray(roles) && targetUser?.groupId) {
        await syncMemberFunctions(userId, targetUser.groupId, roles);
      }

      return NextResponse.json(profile);
    }

    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  } catch (error) {
    console.error("Create/Update member error:", error);
    return NextResponse.json({ error: "Erro ao processar solicitação" }, { status: 500 });
  }
}
