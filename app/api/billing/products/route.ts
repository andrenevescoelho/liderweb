export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

// GET — listar produtos (público: só ACTIVE | superadmin: todos)
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    const isAdmin = user?.role === "SUPERADMIN";
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");

    const products = await (prisma as any).billingProduct.findMany({
      where: {
        ...(isAdmin ? {} : { status: "ACTIVE" }),
        ...(type ? { type } : {}),
      },
      include: { gatewayMappings: { where: isAdmin ? {} : { isActive: true } } },
      orderBy: { sortOrder: "asc" },
    });

    return NextResponse.json({ products });
  } catch (error) {
    console.error("[billing/products] GET error:", error);
    return NextResponse.json({ error: "Erro ao buscar produtos" }, { status: 500 });
  }
}

// POST — criar produto (superadmin only)
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    if (user?.role !== "SUPERADMIN") {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    const body = await req.json();
    const { gatewayMappings, ...data } = body;

    if (!data.slug || !data.name || !data.type || data.price === undefined) {
      return NextResponse.json({ error: "slug, name, type e price são obrigatórios" }, { status: 400 });
    }

    const product = await (prisma as any).billingProduct.create({
      data: {
        ...data,
        price: Number(data.price),
        sortOrder: Number(data.sortOrder ?? 0),
        gatewayMappings: gatewayMappings?.length
          ? { create: gatewayMappings.map((m: any) => ({ gateway: m.gateway, externalId: m.externalId, isActive: m.isActive ?? true })) }
          : undefined,
      },
      include: { gatewayMappings: true },
    });

    return NextResponse.json({ product }, { status: 201 });
  } catch (error: any) {
    if (error.code === "P2002") return NextResponse.json({ error: "Slug já existe" }, { status: 409 });
    console.error("[billing/products] POST error:", error);
    return NextResponse.json({ error: "Erro ao criar produto" }, { status: 500 });
  }
}

// PATCH — atualizar produto
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    if (user?.role !== "SUPERADMIN") {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    const body = await req.json();
    const { id, gatewayMappings, ...data } = body;
    if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

    if (data.price !== undefined) data.price = Number(data.price);
    if (data.sortOrder !== undefined) data.sortOrder = Number(data.sortOrder);

    const product = await (prisma as any).billingProduct.update({
      where: { id },
      data,
      include: { gatewayMappings: true },
    });

    if (gatewayMappings?.length) {
      for (const m of gatewayMappings) {
        await (prisma as any).billingProductGatewayMapping.upsert({
          where: { productId_gateway: { productId: id, gateway: m.gateway } },
          create: { productId: id, gateway: m.gateway, externalId: m.externalId, isActive: m.isActive ?? true },
          update: { externalId: m.externalId, isActive: m.isActive ?? true },
        });
      }
    }

    return NextResponse.json({ product });
  } catch (error) {
    console.error("[billing/products] PATCH error:", error);
    return NextResponse.json({ error: "Erro ao atualizar produto" }, { status: 500 });
  }
}

// DELETE — arquivar produto
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    if (user?.role !== "SUPERADMIN") {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

    await (prisma as any).billingProduct.update({
      where: { id },
      data: { status: "ARCHIVED" },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[billing/products] DELETE error:", error);
    return NextResponse.json({ error: "Erro ao arquivar produto" }, { status: 500 });
  }
}
