export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { getPendingAnnouncementsForUser } from "@/lib/announcements";

export async function GET() {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;

  if (!session || !user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const announcements = await getPendingAnnouncementsForUser({
    id: user.id,
    role: user.role,
    groupId: user.groupId,
  });

  return NextResponse.json({ announcements });
}
