import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { SessionUser } from "@/lib/types";
import { getFileUrl } from "@/lib/s3";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    const user = session.user as SessionUser;
    if (!user.groupId) return NextResponse.json({ error: "Sem grupo" }, { status: 400 });

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = Math.min(parseInt(searchParams.get("limit") || "10", 10), 50);

    const [submissions, total] = await Promise.all([
      prisma.practiceSubmission.findMany({
        where: { userId: user.id, groupId: user.groupId },
        include: {
          feedback: true,
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.practiceSubmission.count({
        where: { userId: user.id, groupId: user.groupId },
      }),
    ]);

    // Generate signed URLs for audio files
    const withUrls = await Promise.all(
      submissions.map(async (sub) => {
        let audioPlayUrl: string | null = null;
        if (sub.audioUrl) {
          try {
            audioPlayUrl = await getFileUrl(sub.audioUrl, false);
          } catch {
            audioPlayUrl = null;
          }
        }
        return { ...sub, audioPlayUrl };
      })
    );

    return NextResponse.json({
      submissions: withUrls,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error("[music-coach/history] error:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
