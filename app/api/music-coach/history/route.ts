export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { SessionUser } from "@/lib/types";
import { canAccessProfessorModule } from "@/lib/professor";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const user = session?.user as SessionUser | undefined;

  if (!session || !user?.id) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!user.groupId && user.role !== "SUPERADMIN") return NextResponse.json({ error: "Sem ministério" }, { status: 400 });

  if (user.role !== "SUPERADMIN") {
    const access = await canAccessProfessorModule(user.id, user.groupId!, user.role);
    if (!access.enabled && !access.canConfigure) {
      return NextResponse.json({ error: "Módulo não habilitado" }, { status: 403 });
    }
  }

  const search = req.nextUrl.searchParams;
  const page = Math.max(1, Number(search.get("page") || 1));
  const pageSize = Math.min(50, Math.max(1, Number(search.get("pageSize") || 10)));

  const where = { userId: user.id, groupId: user.groupId ?? undefined };

  const [total, items] = await Promise.all([
    prisma.practiceSubmission.count({ where }),
    prisma.practiceSubmission.findMany({
      where,
      include: {
        feedbacks: { orderBy: { createdAt: "desc" } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return NextResponse.json({
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    items,
  });
}
