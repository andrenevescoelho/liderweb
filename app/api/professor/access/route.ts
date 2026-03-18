export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { SessionUser } from "@/lib/types";
import { canAccessProfessorModule } from "@/lib/professor";

export async function GET() {
  const session = await getServerSession(authOptions);
  const user = session?.user as SessionUser | undefined;

  if (!session || !user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  if (!user.groupId && user.role !== "SUPERADMIN") {
    return NextResponse.json({ enabled: false, canConfigure: false });
  }

  if (user.role === "SUPERADMIN") {
    return NextResponse.json({ enabled: true, canConfigure: true });
  }

  const access = await canAccessProfessorModule(user.id, user.groupId!, user.role);
  return NextResponse.json(access);
}
