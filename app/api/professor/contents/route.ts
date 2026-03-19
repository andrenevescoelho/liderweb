export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { SessionUser } from "@/lib/types";
import { canAccessProfessorModule, resolvePrimaryInstrument, resolveProfessorRole } from "@/lib/professor";

const FALLBACK_CONTENTS = {
  MINISTER: [
    { title: "Condução da igreja em transições", contentType: "AULA", description: "Como conduzir mudança entre músicas com fluidez." },
    { title: "Postura no altar e comunicação", contentType: "ARTIGO", description: "Técnicas para comunicação clara durante o louvor." },
  ],
  SINGER: [
    { title: "Afinação e apoio respiratório", contentType: "EXERCICIO", description: "Plano prático diário para controle vocal." },
    { title: "Harmonia e backing vocal", contentType: "AULA", description: "Dinâmica de vozes e blend de backing." },
  ],
  MUSICIAN: [
    { title: "Precisão rítmica com metrônomo", contentType: "EXERCICIO", description: "Treino de subdivisão e constância no tempo." },
    { title: "Dinâmica para louvor congregacional", contentType: "ARTIGO", description: "Como construir crescendos e manter sensibilidade." },
  ],
};

export async function GET() {
  const session = await getServerSession(authOptions);
  const user = session?.user as SessionUser | undefined;

  if (!session || !user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!user.groupId && user.role !== "SUPERADMIN") return NextResponse.json({ error: "Sem ministério" }, { status: 400 });

  if (user.role !== "SUPERADMIN") {
    const access = await canAccessProfessorModule(user.id, user.groupId!, user.role);
    if (!access.enabled && !access.canConfigure) {
      return NextResponse.json({ error: "Módulo não habilitado" }, { status: 403 });
    }
  }

  const profile = await prisma.memberProfile.findUnique({ where: { userId: user.id } });
  const roleType = resolveProfessorRole({ profile, roleFunctions: [] });
  const instrument = resolvePrimaryInstrument(profile);

  const contents = await prisma.professorContent.findMany({
    where: {
      isActive: true,
      OR: [{ groupId: null }, { groupId: user.groupId ?? undefined }],
      AND: [
        { OR: [{ targetRole: null }, { targetRole: roleType }] },
        { OR: [{ targetInstrument: null }, { targetInstrument: instrument ?? undefined }] },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return NextResponse.json({
    roleType,
    instrument,
    contents: contents.length > 0 ? contents : FALLBACK_CONTENTS[roleType],
  });
}
