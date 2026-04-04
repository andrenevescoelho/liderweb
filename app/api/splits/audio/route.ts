export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { SessionUser } from "@/lib/types";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createS3Client, getBucketConfig } from "@/lib/aws-config";

// GET /api/splits/audio?stemId=xxx — retorna URL assinada do stem
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as SessionUser | undefined;
    if (!session || !user?.groupId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const stemId = req.nextUrl.searchParams.get("stemId");
    if (!stemId) return NextResponse.json({ error: "stemId obrigatório" }, { status: 400 });

    const stem = await (prisma as any).splitStem.findUnique({
      where: { id: stemId },
      include: { job: { select: { groupId: true } } },
    });

    if (!stem || stem.job.groupId !== user.groupId) {
      return NextResponse.json({ error: "Stem não encontrado" }, { status: 404 });
    }

    const s3Client = createS3Client();
    const { bucketName } = getBucketConfig();

    const url = await getSignedUrl(
      s3Client,
      new GetObjectCommand({ Bucket: bucketName, Key: stem.fileKey }),
      { expiresIn: 3600 }
    );

    return NextResponse.json({ url });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
