export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { getGroupEntitlements, serializeEntitlements } from "@/lib/billing/entitlements";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;

    if (!session || !user?.groupId) {
      return NextResponse.json({
        plan: { name: "Sem plano", slug: null, isActive: false, isFree: true },
        features: { multitracks: false, professor: false, splits: false, audioUpload: false, pads: false },
        quotas: { multitracksPerMonth: 0, splitsPerMonth: 0, membersLimit: 0 },
      });
    }

    const entitlements = await getGroupEntitlements(user.groupId);
    return NextResponse.json(serializeEntitlements(entitlements));
  } catch (error) {
    console.error("[billing/entitlements] GET error:", error);
    return NextResponse.json({ error: "Erro ao buscar entitlements" }, { status: 500 });
  }
}
