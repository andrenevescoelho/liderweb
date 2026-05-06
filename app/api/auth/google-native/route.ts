export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { encode } from "next-auth/jwt";

const GOOGLE_CLIENT_ID_WEB     = process.env.GOOGLE_CLIENT_ID!;
const GOOGLE_CLIENT_ID_ANDROID = "510384512031-n27ieo0cqa1b5de7eg8jdvtqnk6qss52.apps.googleusercontent.com";
const NEXTAUTH_SECRET          = process.env.NEXTAUTH_SECRET!;

export async function POST(req: NextRequest) {
  try {
    const { idToken } = await req.json();
    if (!idToken) return NextResponse.json({ error: "idToken obrigatório" }, { status: 400 });

    // Verificar token com o Google
    const googleRes = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`
    );

    if (!googleRes.ok) {
      const err = await googleRes.text();
      console.error("[google-native] Token inválido:", err);
      return NextResponse.json({ error: "Token inválido" }, { status: 401 });
    }

    const payload = await googleRes.json();
    console.log("[google-native] aud recebido:", payload.aud);

    // Aceitar tanto o Client ID Web quanto o Android
    const validAudiences = [GOOGLE_CLIENT_ID_WEB, GOOGLE_CLIENT_ID_ANDROID];
    const aud = payload.aud ?? "";
    const audValid = validAudiences.some((id) => aud === id || aud.includes(id));

    if (!audValid) {
      console.error("[google-native] aud inválido:", aud, "esperado:", validAudiences);
      return NextResponse.json({ error: "Token não pertence a este app" }, { status: 401 });
    }

    const { email, name, picture } = payload;
    if (!email) return NextResponse.json({ error: "Email não disponível" }, { status: 400 });

    // Buscar ou criar usuário
    let user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          name: name ?? email.split("@")[0],
          avatarUrl: picture ?? null,
          role: "MEMBER",
        },
      });
    } else if (!user.avatarUrl && picture) {
      await prisma.user.update({
        where: { id: user.id },
        data: { avatarUrl: picture },
      });
    }

    // Gerar JWT NextAuth compatível
    const token = await encode({
      token: {
        sub: user.id,
        id: user.id,
        email: user.email,
        name: user.name,
        role: (user as any).role,
        groupId: (user as any).groupId ?? null,
        picture: (user as any).avatarUrl ?? picture ?? null,
      },
      secret: NEXTAUTH_SECRET,
    });

    return NextResponse.json({
      ok: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: (user as any).role,
        groupId: (user as any).groupId ?? null,
      },
    });
  } catch (err) {
    console.error("[google-native] erro:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
