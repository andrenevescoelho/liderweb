import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { AuditEntityType } from "@prisma/client";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { SessionUser } from "@/lib/types";

export const dynamic = "force-dynamic";

function canAccessAuditLogs(role?: string) {
  return role === "SUPERADMIN" || role === "ADMIN";
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as SessionUser | undefined;

    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    if (!canAccessAuditLogs(user.role)) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    if (user.role === "ADMIN" && !user.groupId) {
      return NextResponse.json({ error: "Admin sem grupo não pode acessar auditoria" }, { status: 403 });
    }

    const params = req.nextUrl.searchParams;
    const page = Math.max(1, Number(params.get("page") || "1"));
    const pageSize = Math.min(100, Math.max(1, Number(params.get("pageSize") || "20")));
    const skip = (page - 1) * pageSize;

    const where: any = {};

    if (user.role !== "SUPERADMIN") {
      where.groupId = user.groupId;
    } else {
      const groupId = params.get("groupId");
      if (groupId) where.groupId = groupId;
    }

    const userId = params.get("userId");
    const action = params.get("action");
    const entityType = params.get("entityType");
    const text = params.get("text");
    const from = params.get("from");
    const to = params.get("to");

    if (userId) where.userId = userId;
    if (action) where.action = action;
    if (entityType && Object.values(AuditEntityType).includes(entityType as AuditEntityType)) {
      where.entityType = entityType as AuditEntityType;
    }

    if (from || to) {
      where.createdAt = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      };
    }

    if (text) {
      where.OR = [
        { description: { contains: text, mode: "insensitive" } },
        { entityName: { contains: text, mode: "insensitive" } },
        { action: { contains: text, mode: "insensitive" } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, email: true } },
          group: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return NextResponse.json({
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error) {
    console.error("Get audit logs error:", error);
    return NextResponse.json({ error: "Erro ao buscar logs" }, { status: 500 });
  }
}
