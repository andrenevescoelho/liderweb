export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { createHmac } from "crypto";

// Token expira em 60 segundos
const TOKEN_TTL_SECONDS = 60;
const SECRET = process.env.AUDIO_TOKEN_SECRET || process.env.NEXTAUTH_SECRET || "liderweb-audio-secret";

// Gerar token HMAC: albumId|stemIndex|groupId|expiry
export function generateAudioToken(albumId: string, stemIndex: number, groupId: string): string {
  const expiry = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  const payload = `${albumId}|${stemIndex}|${groupId}|${expiry}`;
  const sig = createHmac("sha256", SECRET).update(payload).digest("hex").slice(0, 16);
  return Buffer.from(`${payload}|${sig}`).toString("base64url");
}

// Verificar token
export function verifyAudioToken(token: string, albumId: string, stemIndex: number, groupId: string): boolean {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf-8");
    const parts = decoded.split("|");
    if (parts.length !== 5) return false;
    const [tAlbum, tStem, tGroup, tExpiry, tSig] = parts;

    // Verificar campos
    if (tAlbum !== albumId) return false;
    if (tStem !== String(stemIndex)) return false;
    if (tGroup !== groupId) return false;

    // Verificar expiração
    if (parseInt(tExpiry) < Math.floor(Date.now() / 1000)) return false;

    // Verificar assinatura
    const payload = `${tAlbum}|${tStem}|${tGroup}|${tExpiry}`;
    const expectedSig = createHmac("sha256", SECRET).update(payload).digest("hex").slice(0, 16);
    if (tSig !== expectedSig) return false;

    return true;
  } catch {
    return false;
  }
}

// POST /api/multitracks/token
// Retorna tokens para todos os stems de um álbum alugado
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    const user = session.user as any;
    if (!user.groupId) return NextResponse.json({ error: "Sem grupo" }, { status: 400 });

    const { albumId } = await req.json();
    if (!albumId) return NextResponse.json({ error: "albumId obrigatório" }, { status: 400 });

    // Verificar aluguel ativo
    const rental = await prisma.multitracksRental.findUnique({
      where: { groupId_albumId: { groupId: user.groupId, albumId } },
      include: { album: true },
    });

    if (!rental || rental.status !== "ACTIVE" || rental.expiresAt < new Date()) {
      return NextResponse.json({ error: "Acesso não autorizado" }, { status: 403 });
    }

    const stems = Array.isArray(rental.album.stems)
      ? rental.album.stems as { name: string; r2Key: string }[]
      : [];

    // Gerar token para cada stem
    const tokens = stems.map((_, i) => generateAudioToken(albumId, i, user.groupId));

    return NextResponse.json({ tokens, expiresIn: TOKEN_TTL_SECONDS });
  } catch (err: any) {
    console.error("[multitracks/token] error:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
