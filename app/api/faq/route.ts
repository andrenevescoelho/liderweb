export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { SessionUser } from "@/lib/types";

// GET — listar categorias e itens (todos os usuários logados)
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const user = session.user as SessionUser;
  const isSuperAdmin = user?.role === "SUPERADMIN";

  const search = req.nextUrl.searchParams.get("search")?.trim() ?? "";
  const category = req.nextUrl.searchParams.get("category")?.trim() ?? "";

  const categories = await prisma.faqCategory.findMany({
    where: isSuperAdmin ? {} : { isActive: true },
    select: { id: true, slug: true, name: true, order: true, isActive: true },
    orderBy: [{ order: "asc" }, { name: "asc" }],
  });

  const items = await prisma.faqItem.findMany({
    where: {
      ...(isSuperAdmin ? {} : { isPublished: true }),
      ...(category && category !== "all"
        ? { category: { slug: category, ...(isSuperAdmin ? {} : { isActive: true }) } }
        : { category: isSuperAdmin ? {} : { isActive: true } }),
      ...(search.length > 0
        ? { OR: [
            { question: { contains: search, mode: "insensitive" } },
            { answer: { contains: search, mode: "insensitive" } },
            { tags: { hasSome: search.split(/\s+/).filter(Boolean) } },
          ]}
        : {}),
    },
    select: {
      id: true, question: true, answer: true, tags: true,
      order: true, isPublished: true,
      category: { select: { id: true, slug: true, name: true, order: true } },
    },
    orderBy: [{ category: { order: "asc" } }, { order: "asc" }, { question: "asc" }],
  });

  return NextResponse.json({ categories, items, filters: { search, category: category || "all" } });
}

// POST — criar categoria ou item (SUPERADMIN)
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const user = session?.user as SessionUser | undefined;
  if (!session || user?.role !== "SUPERADMIN") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json();
  const { type } = body;

  if (type === "category") {
    const { name, slug, order } = body;
    if (!name || !slug) return NextResponse.json({ error: "name e slug obrigatórios" }, { status: 400 });
    const cat = await prisma.faqCategory.create({
      data: { name, slug: slug.toLowerCase().replace(/\s+/g, "-"), order: order ?? 0 },
    });
    return NextResponse.json({ category: cat }, { status: 201 });
  }

  if (type === "item") {
    const { categoryId, question, answer, tags, order } = body;
    if (!categoryId || !question || !answer) return NextResponse.json({ error: "categoryId, question e answer obrigatórios" }, { status: 400 });
    const item = await prisma.faqItem.create({
      data: { categoryId, question, answer, tags: tags ?? [], order: order ?? 0 },
      include: { category: { select: { id: true, slug: true, name: true } } },
    });
    return NextResponse.json({ item }, { status: 201 });
  }

  return NextResponse.json({ error: "type inválido (category ou item)" }, { status: 400 });
}

// PUT — atualizar categoria ou item (SUPERADMIN)
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const user = session?.user as SessionUser | undefined;
  if (!session || user?.role !== "SUPERADMIN") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json();
  const { type, id } = body;
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  if (type === "category") {
    const { name, slug, order, isActive } = body;
    const cat = await prisma.faqCategory.update({
      where: { id },
      data: { ...(name && { name }), ...(slug && { slug }), ...(order !== undefined && { order }), ...(isActive !== undefined && { isActive }) },
    });
    return NextResponse.json({ category: cat });
  }

  if (type === "item") {
    const { question, answer, tags, order, isPublished, categoryId } = body;
    const item = await prisma.faqItem.update({
      where: { id },
      data: {
        ...(question && { question }), ...(answer && { answer }),
        ...(tags !== undefined && { tags }), ...(order !== undefined && { order }),
        ...(isPublished !== undefined && { isPublished }), ...(categoryId && { categoryId }),
      },
      include: { category: { select: { id: true, slug: true, name: true } } },
    });
    return NextResponse.json({ item });
  }

  return NextResponse.json({ error: "type inválido" }, { status: 400 });
}

// DELETE — remover categoria ou item (SUPERADMIN)
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const user = session?.user as SessionUser | undefined;
  if (!session || user?.role !== "SUPERADMIN") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");
  const id = searchParams.get("id");
  if (!type || !id) return NextResponse.json({ error: "type e id obrigatórios" }, { status: 400 });

  if (type === "category") {
    await prisma.faqCategory.delete({ where: { id } });
    return NextResponse.json({ success: true });
  }
  if (type === "item") {
    await prisma.faqItem.delete({ where: { id } });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "type inválido" }, { status: 400 });
}
