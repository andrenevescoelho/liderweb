export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

// GET /api/admin/ministerios?search=...
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;

  if (!user?.id || user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const search = req.nextUrl.searchParams.get("search") ?? "";

  const groups = await (prisma.group as any).findMany({
    where: search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { ownerDocument: { contains: search } },
            { ownerPhone: { contains: search } },
            { denomination: { contains: search, mode: "insensitive" } },
            {
              users: {
                some: {
                  role: "ADMIN",
                  OR: [
                    { name: { contains: search, mode: "insensitive" } },
                    { email: { contains: search, mode: "insensitive" } },
                  ],
                },
              },
            },
          ],
        }
      : {},
    select: {
      id: true,
      name: true,
      active: true,
      createdAt: true,
      ownerDocument: true,
      ownerPhone: true,
      ownerCity: true,
      ownerState: true,
      denomination: true,
      termsAcceptedAt: true,
      _count: { select: { users: true } },
      subscription: {
        select: {
          status: true,
          plan: { select: { name: true, price: true } },
        },
      },
      users: {
        where: { role: "ADMIN" },
        select: { name: true, email: true, role: true },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return NextResponse.json(groups);
}
