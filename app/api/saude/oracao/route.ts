export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

// GET — listar pedidos de oração do grupo
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    if (!user?.id) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    if (!user.groupId) return NextResponse.json({ error: "Sem grupo" }, { status: 400 });

    const requests = await prisma.$queryRaw<any[]>`
      SELECT 
        p.id, p.content, p."isAnonymous", p."prayerCount", p."isResolved", p."createdAt",
        p."memberId",
        CASE WHEN p."isAnonymous" THEN 'Anônimo' ELSE u.name END as "memberName"
      FROM "PrayerRequest" p
      LEFT JOIN "User" u ON u.id = p."memberId"
      WHERE p."groupId" = ${user.groupId}
      AND p."isResolved" = false
      ORDER BY p."createdAt" DESC
      LIMIT 20
    `;

    // Verificar quais o usuário já orou
    const myPrayers = await prisma.$queryRaw<any[]>`
      SELECT "prayerRequestId" FROM "PrayerInteraction"
      WHERE "userId" = ${user.id}
    `.catch(() => []);

    const prayedIds = new Set(myPrayers.map((p: any) => p.prayerRequestId));

    return NextResponse.json(
      requests.map(r => ({ ...r, hasPrayed: prayedIds.has(r.id) }))
    );
  } catch (e) {
    console.error("Get prayer requests error:", e);
    return NextResponse.json({ error: "Erro ao buscar pedidos" }, { status: 500 });
  }
}

// POST — criar pedido de oração
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    if (!user?.id) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    if (!user.groupId) return NextResponse.json({ error: "Sem grupo" }, { status: 400 });

    const { content, isAnonymous } = await req.json();
    if (!content?.trim()) return NextResponse.json({ error: "Conteúdo obrigatório" }, { status: 400 });

    const id = `prayer_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    await prisma.$executeRaw`
      INSERT INTO "PrayerRequest" (id, "memberId", "groupId", content, "isAnonymous", "prayerCount", "isResolved", "createdAt", "updatedAt")
      VALUES (${id}, ${user.id}, ${user.groupId}, ${content.trim()}, ${isAnonymous ?? false}, 0, false, NOW(), NOW())
    `;

    return NextResponse.json({ success: true, id });
  } catch (e) {
    console.error("Create prayer request error:", e);
    return NextResponse.json({ error: "Erro ao criar pedido" }, { status: 500 });
  }
}

// PATCH — orar por um pedido
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    if (!user?.id) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const { prayerRequestId, action } = await req.json();
    if (!prayerRequestId) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });

    if (action === "pray") {
      // Registrar oração (idempotente via SQL)
      await prisma.$executeRaw`
        INSERT INTO "PrayerInteraction" (id, "userId", "prayerRequestId", "createdAt")
        VALUES (${`pi_${Date.now()}`}, ${user.id}, ${prayerRequestId}, NOW())
        ON CONFLICT ("userId", "prayerRequestId") DO NOTHING
      `.catch(() => {});

      await prisma.$executeRaw`
        UPDATE "PrayerRequest" SET "prayerCount" = "prayerCount" + 1, "updatedAt" = NOW()
        WHERE id = ${prayerRequestId}
        AND NOT EXISTS (
          SELECT 1 FROM "PrayerInteraction" 
          WHERE "userId" = ${user.id} AND "prayerRequestId" = ${prayerRequestId}
          AND id != (SELECT id FROM "PrayerInteraction" WHERE "userId" = ${user.id} AND "prayerRequestId" = ${prayerRequestId} ORDER BY "createdAt" DESC LIMIT 1)
        )
      `.catch(() => {
        // Fallback simples
        return prisma.$executeRaw`
          UPDATE "PrayerRequest" SET "prayerCount" = "prayerCount" + 1, "updatedAt" = NOW()
          WHERE id = ${prayerRequestId}
        `;
      });
    } else if (action === "resolve") {
      await prisma.$executeRaw`
        UPDATE "PrayerRequest" SET "isResolved" = true, "updatedAt" = NOW()
        WHERE id = ${prayerRequestId} AND "memberId" = ${user.id}
      `;
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Prayer action error:", e);
    return NextResponse.json({ error: "Erro ao registrar oração" }, { status: 500 });
  }
}
