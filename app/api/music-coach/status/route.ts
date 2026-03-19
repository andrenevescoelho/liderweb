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

    return NextResponse.json({ enabled: profile?.enabled ?? false, level: profile?.level ?? 1 });
  } catch (err) {
    console.error("[music-coach/status] error:", err);
    return NextResponse.json({ enabled: false });
  }
}
