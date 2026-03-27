export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

function isSuperAdmin(role?: string) {
  return role === "SUPERADMIN";
}

// GET — listar todos os planos (superadmin: todos | público: só ACTIVE)
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    const isAdmin = isSuperAdmin(user?.role);

    const plans = await (prisma as any).billingPlan.findMany({
      where: isAdmin ? {} : { status: "ACTIVE" },
      include: {
        gatewayMappings: {
          where: isAdmin ? {} : { isActive: true },
          select: {
            id: true,
            gateway: true,
            externalId: true,
            isActive: true,
          },
        },
      },
      orderBy: { sortOrder: "asc" },
    });

    return NextResponse.json({ plans });
  } catch (error) {
    console.error("[billing/plans] GET error:", error);
    return NextResponse.json({ error: "Erro ao buscar planos" }, { status: 500 });
  }
}

// POST — criar novo plano (superadmin only)
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    if (!isSuperAdmin(user?.role)) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    const body = await req.json();
    const {
      slug, name, description, tagline, price, period, trialDays,
      status, isPopular, badge, sortOrder, userLimit, features,
      gatewayMappings, // array de { gateway, externalId, externalData }
    } = body;

    if (!slug || !name || price === undefined) {
      return NextResponse.json({ error: "slug, name e price são obrigatórios" }, { status: 400 });
    }

    const plan = await (prisma as any).billingPlan.create({
      data: {
        slug,
        name,
        description,
        tagline,
        price: Number(price),
        period: period ?? "MONTHLY",
        trialDays: trialDays ?? 7,
        status: status ?? "ACTIVE",
        isPopular: isPopular ?? false,
        badge,
        sortOrder: sortOrder ?? 0,
        userLimit: userLimit ?? 0,
        features: features ?? {},
        gatewayMappings: gatewayMappings?.length
          ? {
              create: gatewayMappings.map((m: any) => ({
                gateway: m.gateway,
                externalId: m.externalId,
                externalData: m.externalData ?? null,
                isActive: m.isActive ?? true,
              })),
            }
          : undefined,
      },
      include: { gatewayMappings: true },
    });

    return NextResponse.json({ plan }, { status: 201 });
  } catch (error: any) {
    console.error("[billing/plans] POST error:", error);
    if (error.code === "P2002") {
      return NextResponse.json({ error: "Já existe um plano com esse slug" }, { status: 409 });
    }
    return NextResponse.json({ error: "Erro ao criar plano" }, { status: 500 });
  }
}

// PATCH — atualizar plano (superadmin only)
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    if (!isSuperAdmin(user?.role)) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    const body = await req.json();
    const { id, gatewayMappings, ...data } = body;

    if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

    if (data.price !== undefined) data.price = Number(data.price);
    if (data.userLimit !== undefined) data.userLimit = Number(data.userLimit);
    if (data.sortOrder !== undefined) data.sortOrder = Number(data.sortOrder);
    if (data.trialDays !== undefined) data.trialDays = Number(data.trialDays);

    const plan = await (prisma as any).billingPlan.update({
      where: { id },
      data,
      include: { gatewayMappings: true },
    });

    // Atualizar gateway mappings se enviados
    if (gatewayMappings?.length) {
      for (const m of gatewayMappings) {
        await (prisma as any).billingGatewayMapping.upsert({
          where: { planId_gateway: { planId: id, gateway: m.gateway } },
          create: {
            planId: id,
            gateway: m.gateway,
            externalId: m.externalId,
            externalData: m.externalData ?? null,
            isActive: m.isActive ?? true,
          },
          update: {
            externalId: m.externalId,
            externalData: m.externalData ?? null,
            isActive: m.isActive ?? true,
          },
        });
      }
    }

    return NextResponse.json({ plan });
  } catch (error) {
    console.error("[billing/plans] PATCH error:", error);
    return NextResponse.json({ error: "Erro ao atualizar plano" }, { status: 500 });
  }
}

// DELETE — arquivar plano (soft delete via status ARCHIVED)
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    if (!isSuperAdmin(user?.role)) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

    // Soft delete — não apaga, apenas arquiva
    await (prisma as any).billingPlan.update({
      where: { id },
      data: { status: "ARCHIVED" },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[billing/plans] DELETE error:", error);
    return NextResponse.json({ error: "Erro ao arquivar plano" }, { status: 500 });
  }
}
