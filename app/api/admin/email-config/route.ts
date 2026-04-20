export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import {
  EMAIL_CONFIG_DEFINITIONS,
  getEmailConfigs,
  invalidateEmailConfigCache,
} from "@/lib/email-config";

// GET — listar todas as configurações
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    if (!session || user?.role !== "SUPERADMIN") {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    const configs = await getEmailConfigs();

    // Agrupar por categoria com definições completas
    const grouped = EMAIL_CONFIG_DEFINITIONS.reduce((acc, def) => {
      if (!acc[def.category]) acc[def.category] = [];
      acc[def.category].push({
        key: def.key,
        label: def.label,
        description: def.description,
        category: def.category,
        enabled: configs[def.key] ?? def.defaultEnabled,
      });
      return acc;
    }, {} as Record<string, any[]>);

    return NextResponse.json({ grouped, flat: configs });
  } catch (error) {
    console.error("[email-config] GET error:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

// PATCH — atualizar uma ou mais configurações
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    if (!session || user?.role !== "SUPERADMIN") {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    const body = await req.json();
    const { key, enabled } = body;

    if (!key || typeof enabled !== "boolean") {
      return NextResponse.json({ error: "key e enabled são obrigatórios" }, { status: 400 });
    }

    const validKeys = EMAIL_CONFIG_DEFINITIONS.map((d) => d.key);
    if (!validKeys.includes(key)) {
      return NextResponse.json({ error: "Chave inválida" }, { status: 400 });
    }

    const def = EMAIL_CONFIG_DEFINITIONS.find((d) => d.key === key)!;

    await prisma.emailConfig.upsert({
      where: { key },
      create: {
        key,
        label: def.label,
        category: def.category,
        enabled,
        updatedBy: user.id,
      },
      update: {
        enabled,
        updatedBy: user.id,
      },
    });

    // Invalidar cache
    invalidateEmailConfigCache();

    return NextResponse.json({ success: true, key, enabled });
  } catch (error) {
    console.error("[email-config] PATCH error:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
