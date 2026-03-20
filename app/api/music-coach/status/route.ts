import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { SessionUser } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ enabled: false });
    const user = session.user as SessionUser;
    if (!user.groupId) return NextResponse.json({ enabled: false });

    const profile = await prisma.musicCoachProfile.findUnique({
      where: { userId_groupId: { userId: user.id, groupId: user.groupId } },
      select: { enabled: true, level: true },
    });

    // DEBUG: lista modelos Gemini disponíveis
    const apiKey = process.env.GEMINI_API_KEY;
    let geminiModels = null;
    if (apiKey) {
      const modelsResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`
      );
      geminiModels = await modelsResponse.json();
      console.log("[music-coach/status] modelos Gemini disponíveis:", JSON.stringify(geminiModels, null, 2));
    }

    return NextResponse.json({
      enabled: profile?.enabled ?? false,
      level: profile?.level ?? 1,
      geminiModels,
    });
  } catch (err) {
    console.error("[music-coach/status] error:", err);
    return NextResponse.json({ enabled: false });
  }
}
