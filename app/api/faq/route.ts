export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const search = req.nextUrl.searchParams.get("search")?.trim() ?? "";
  const category = req.nextUrl.searchParams.get("category")?.trim() ?? "";

  const categories = await prisma.faqCategory.findMany({
    where: { isActive: true },
    select: { id: true, slug: true, name: true, order: true },
    orderBy: [{ order: "asc" }, { name: "asc" }],
  });

  const hasSearch = search.length > 0;

  const items = await prisma.faqItem.findMany({
    where: {
      isPublished: true,
      ...(category && category !== "all"
        ? {
            category: {
              slug: category,
              isActive: true,
            },
          }
        : {
            category: {
              isActive: true,
            },
          }),
      ...(hasSearch
        ? {
            OR: [
              { question: { contains: search, mode: "insensitive" } },
              { answer: { contains: search, mode: "insensitive" } },
              { tags: { hasSome: search.split(/\s+/).filter(Boolean) } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      question: true,
      answer: true,
      tags: true,
      order: true,
      category: {
        select: {
          id: true,
          slug: true,
          name: true,
          order: true,
        },
      },
    },
    orderBy: [{ category: { order: "asc" } }, { order: "asc" }, { question: "asc" }],
  });

  return NextResponse.json({
    categories,
    items,
    filters: {
      search,
      category: category || "all",
    },
  });
}
