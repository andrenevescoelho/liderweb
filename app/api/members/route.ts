export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { SessionUser } from "@/lib/types";
import { hasPermission } from "@/lib/authorization";

const getOptionalMemberProfileData = ({
  memberFunction,
  leadershipRole,
  permissions,
}: {
  memberFunction?: string | null;
  leadershipRole?: string | null;
  permissions?: string[];
}) => {
  return {
    memberFunction: memberFunction ?? null,
    leadershipRole: leadershipRole ?? null,
    permissions: permissions ?? [],
  };
};

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const user = session.user as SessionUser;
    const searchParams = req?.nextUrl?.searchParams;
    const instrument = searchParams?.get?.("instrument");
    const voice = searchParams?.get?.("voice");
    const active = searchParams?.get?.("active");

    const where: any = {};

    // SuperAdmin vê todos, outros veem apenas do seu grupo
    if (user.role !== "SUPERADMIN") {
      if (!user.groupId) {
        return NextResponse.json([]);
      }
      where.groupId = user.groupId;
    }

    // Não mostrar SUPERADMIN na lista de membros
    where.role = { not: "SUPERADMIN" };

    if (instrument) {
      where.profile = { ...where?.profile, instruments: { has: instrument } };
    }
    if (voice) {
      where.profile = { ...where?.profile, voiceType: voice };
    }
    if (active !== null && active !== undefined) {
      where.profile = { ...where?.profile, active: active === "true" };
    }

    const members = await prisma.user.findMany({
      where,
      include: { profile: true },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(members ?? []);
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
      // Campos para criar novo usuário
      name, 
      email, 
      password,
      // Campos para atualizar perfil existente
      userId, 
      instruments, 
      voiceType, 
      vocalRange, 
      comfortableKeys, 
      availability, 
      phone, 
      active,
      memberFunction,
      leadershipRole,
      permissions,
    } = body ?? {};

    // Se tem email e password, criar novo usuário
    if (email && password) {
      if (!name) {
        return NextResponse.json({ error: "Nome é obrigatório" }, { status: 400 });
      }

      // Verificar se email já existe
      const existingUser = await prisma.user.findUnique({ where: { email } });
      if (existingUser) {
        return NextResponse.json({ error: "Email já está em uso" }, { status: 400 });
      }

      // Definir groupId
      let groupId = null;
      if (userRole === "SUPERADMIN") {
        // SuperAdmin pode especificar o grupo ou deixar sem grupo
        groupId = body.groupId || null;
      } else {
        // Admin só pode criar membros no seu próprio grupo
        if (!currentUser?.groupId) {
          return NextResponse.json({ error: "Você não está associado a nenhum grupo" }, { status: 400 });
        }
        groupId = currentUser.groupId;
      }

      // Verificar limite de usuários do plano
      if (groupId) {
        const subscription = await prisma.subscription.findUnique({
          where: { groupId },
          include: { plan: true },
        });

        if (subscription && subscription.plan.userLimit > 0) {
          const userCount = await prisma.user.count({ where: { groupId } });
          
          if (userCount >= subscription.plan.userLimit) {
            return NextResponse.json(
              { 
                error: `Limite de usuários atingido (${subscription.plan.userLimit}). Faça upgrade do seu plano para adicionar mais membros.`,
                limitReached: true,
              },
              { status: 403 }
            );
          }
        }
      }

      if (permissions !== undefined && !canManageMemberPermissions) {
        return NextResponse.json({ error: "Sem permissão para definir permissões do membro" }, { status: 403 });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const optionalProfileData = getOptionalMemberProfileData({
        memberFunction,
        leadershipRole,
        permissions,
      });

      const newUser = await prisma.user.create({
        data: {
          name,
          email,
          password: hashedPassword,
          role: "MEMBER",
          groupId,
          profile: {
            create: {
              instruments: instruments ?? [],
              voiceType: voiceType ?? null,
              vocalRange: vocalRange ?? null,
              comfortableKeys: comfortableKeys ?? [],
              availability: availability ?? [],
              phone: phone ?? null,
              active: active ?? true,
              ...optionalProfileData,
            },
          },
        },
        include: { profile: true },
      });

      return NextResponse.json(newUser, { status: 201 });
    }

    // Se tem userId, atualizar perfil existente
    if (userId) {
      // Verificar se o usuário sendo editado pertence ao mesmo grupo
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

      if (permissions !== undefined && requester.id !== userId && !canManageMemberPermissions) {
        return NextResponse.json({ error: "Sem permissão para alterar permissões de outros membros" }, { status: 403 });
      }

      const optionalProfileData = getOptionalMemberProfileData({
        memberFunction,
        leadershipRole,
        permissions,
      });

      const profile = await prisma.memberProfile.upsert({
        where: { userId },
        update: {
          instruments: instruments ?? [],
          voiceType: voiceType ?? null,
          vocalRange: vocalRange ?? null,
          comfortableKeys: comfortableKeys ?? [],
          availability: availability ?? [],
          phone: phone ?? null,
          active: active ?? true,
          ...optionalProfileData,
        },
        create: {
          userId,
          instruments: instruments ?? [],
          voiceType: voiceType ?? null,
          vocalRange: vocalRange ?? null,
          comfortableKeys: comfortableKeys ?? [],
          availability: availability ?? [],
          phone: phone ?? null,
          active: active ?? true,
          ...optionalProfileData,
        },
      });

      return NextResponse.json(profile);
    }

    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  } catch (error) {
    console.error("Create/Update member error:", error);
    return NextResponse.json({ error: "Erro ao processar solicitação" }, { status: 500 });
  }
}
