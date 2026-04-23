export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { SessionUser } from "@/lib/types";
import { getGroupEntitlements } from "@/lib/billing/entitlements";
import { enqueueDownload } from "@/lib/multitracks-download";
import { logUserAction, AUDIT_ACTIONS, extractRequestContext } from "@/lib/audit-log";
import { AuditEntityType } from "@prisma/client";
import { hasPermission } from "@/lib/authorization";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
    const user = session.user as SessionUser;

    if (!user.groupId) return NextResponse.json({ error: "Sem grupo" }, { status: 400 });

    // Verificar permissão RBAC granular para MEMBER e LEADER
    if (user.role === "MEMBER" || user.role === "LEADER") {
      const profile = await prisma.memberProfile.findUnique({
        where: { userId: user.id },
        select: { permissions: true },
      });
      if (!hasPermission(user.role as any, "multitrack.rent", profile?.permissions)) {
        return NextResponse.json({ error: "Sem permissão para alugar multitracks" }, { status: 403 });
      }
    }

    const { albumId } = await req.json();
    if (!albumId) return NextResponse.json({ error: "albumId obrigatorio" }, { status: 400 });

    // Verificar entitlements
    const ent = await getGroupEntitlements(user.groupId);
    if (!ent.isActive) {
      return NextResponse.json({ error: "Assinatura inativa. Reative para alugar multitracks." }, { status: 402 });
    }
    if (!ent.canAccessMultitracks) {
      return NextResponse.json({
        error: "Seu plano nao inclui multitracks. Faca upgrade.",
        code: "PLAN_UPGRADE_REQUIRED",
        requiredFeature: "multitracks",
      }, { status: 402 });
    }

    // Verificar aluguel ja ativo
    const existing = await prisma.multitracksRental.findUnique({
      where: { groupId_albumId: { groupId: user.groupId, albumId } },
    });
    if (existing?.status === "ACTIVE" && existing.expiresAt > new Date()) {
      return NextResponse.json({ error: "Multitrack ja alugada e ativa" }, { status: 409 });
    }

    // Verificar cota mensal
    const now = new Date();
    const usageRecord = await prisma.multitracksUsage.findUnique({
      where: { groupId_month_year: { groupId: user.groupId, month: now.getMonth() + 1, year: now.getFullYear() } },
    });
    const currentCount = usageRecord?.count ?? 0;
    const limit = ent.multitracksPerMonth;
    if (currentCount >= limit) {
      return NextResponse.json({
        error: `Cota mensal atingida (${currentCount}/${limit}). Aguarde o proximo mes ou adquira um multitrack avulso.`,
        code: "QUOTA_EXCEEDED",
        usage: { count: currentCount, limit },
      }, { status: 402 });
    }

    // Buscar album
    const album = await (prisma as any).multitracksAlbum.findUnique({
      where: { id: albumId },
      select: { id: true, status: true, isActive: true, driveZipUrl: true },
    });

    if (!album || !album.isActive) {
      return NextResponse.json({ error: "Multitrack nao disponivel" }, { status: 404 });
    }

    // ── Fluxo lazy download ────────────────────────────────────────────────
    if (album.status !== "READY") {
      // Album ainda nao esta no bucket — enfileirar download
      if (!album.driveZipUrl) {
        return NextResponse.json({ error: "Multitrack sem arquivo configurado. Contate o suporte." }, { status: 422 });
      }

      const { jobId, isNew, status } = await enqueueDownload(albumId, user.groupId);

      // Disparar worker via fetch interno (evita problema de background process no standalone)
      if (isNew) {
        // Sempre usar localhost para evitar loop pelo Cloudflare/proxy externo
        const workerUrl = `http://localhost:${process.env.PORT ?? "3000"}/api/multitracks/worker`;
        fetch(workerUrl, {
          method: "POST",
          headers: {
            "x-worker-secret": process.env.WORKER_SECRET ?? "liderweb-worker-internal",
            "Content-Type": "application/json",
          },
        }).catch((err) => {
          console.error("[rent] worker fetch error:", err);
        });
      }

      // Debitar cota e registrar rental como PENDING_DOWNLOAD
      const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      await prisma.multitracksRental.upsert({
        where: { groupId_albumId: { groupId: user.groupId, albumId } },
        create: {
          groupId: user.groupId,
          albumId,
          rentedBy: user.id,
          r2Folder: `multitracks-catalog/${albumId}`,
          status: "ACTIVE",
          expiresAt,
        },
        update: {
          rentedBy: user.id,
          r2Folder: `multitracks-catalog/${albumId}`,
          status: "ACTIVE",
          rentedAt: now,
          expiresAt,
        },
      });

      await prisma.multitracksUsage.upsert({
        where: { groupId_month_year: { groupId: user.groupId, month: now.getMonth() + 1, year: now.getFullYear() } },
        create: { groupId: user.groupId, month: now.getMonth() + 1, year: now.getFullYear(), count: 1 },
        update: { count: { increment: 1 } },
      });

      // Retornar 202 — cliente deve fazer polling em /api/multitracks/rent/status
      logUserAction({
        userId: user.id, groupId: user.groupId,
        action: AUDIT_ACTIONS.MULTITRACK_RENTED,
        entityType: AuditEntityType.MULTITRACK,
        entityId: albumId, entityName: album?.title ?? albumId,
        description: `${user.name ?? user.email} alugou multitrack (download pendente)`,
        metadata: { albumId, status: "DOWNLOADING", jobId },
      }).catch(() => {});
      return NextResponse.json({
        downloading: true,
        jobId,
        albumStatus: status,
        message: "Preparando sua multitrack... Isso pode levar alguns minutos.",
        pollUrl: `/api/multitracks/rent/status?albumId=${albumId}`,
      }, { status: 202 });
    }

    // ── Album ja no bucket — alugar normalmente ────────────────────────────
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const rental = await prisma.multitracksRental.upsert({
      where: { groupId_albumId: { groupId: user.groupId, albumId } },
      create: {
        groupId: user.groupId,
        albumId,
        rentedBy: user.id,
        r2Folder: `multitracks-catalog/${albumId}`,
        status: "ACTIVE",
        expiresAt,
      },
      update: {
        rentedBy: user.id,
        r2Folder: `multitracks-catalog/${albumId}`,
        status: "ACTIVE",
        rentedAt: now,
        expiresAt,
      },
    });

    await prisma.multitracksUsage.upsert({
      where: { groupId_month_year: { groupId: user.groupId, month: now.getMonth() + 1, year: now.getFullYear() } },
      create: { groupId: user.groupId, month: now.getMonth() + 1, year: now.getFullYear(), count: 1 },
      update: { count: { increment: 1 } },
    });

    logUserAction({
      userId: user.id, groupId: user.groupId,
      action: AUDIT_ACTIONS.MULTITRACK_RENTED,
      entityType: AuditEntityType.MULTITRACK,
      entityId: albumId, entityName: album?.title ?? albumId,
      description: `${user.name ?? user.email} alugou multitrack`,
      metadata: { albumId, expiresAt, quota: { used: currentCount + 1, limit } },
    }).catch(() => {});
    return NextResponse.json({ rental, usage: { count: currentCount + 1, limit } });

  } catch (err) {
    console.error("[multitracks/rent] error:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
