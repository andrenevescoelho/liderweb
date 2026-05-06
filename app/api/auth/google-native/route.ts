export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { encode } from "next-auth/jwt";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const NEXTAUTH_SECRET  = process.env.NEXTAUTH_SECRET!;

// POST /api/auth/google-native
// Recebe o idToken do Google Sign-In nativo (Capacitor)
// Verifica com a API do Google, cria/encontra o usuário e retorna um JWT

export async function POST(req: NextRequest) {
  try {
    const { idToken } = await req.json();
    if (!idToken) return NextResponse.json({ error: "idToken obrigatório" }, { status: 400 });

    // Verificar token com o Google
    const googleRes = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`
    );
    if (!googleRes.ok) return NextResponse.json({ error: "Token inválido" }, { status: 401 });

    const payload = await googleRes.json();

    // Verificar audience
    if (payload.aud !== GOOGLE_CLIENT_ID && !payload.aud?.includes(GOOGLE_CLIENT_ID)) {
      return NextResponse.json({ error: "Token não pertence a este app" }, { status: 401 });
    }

    const { email, name, picture, sub: googleId } = payload;
    if (!email) return NextResponse.json({ error: "Email não disponível" }, { status: 400 });

    // Buscar ou criar usuário
    let user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      // Criar novo usuário (sem grupo — será redirecionado para /signup)
      user = await prisma.user.create({
        data: {
          email,
          name: name ?? email.split("@")[0],
          avatarUrl: picture ?? null,
          role: "MEMBER",
        },
      });
    } else if (!user.avatarUrl && picture) {
      // Atualizar foto se não tiver
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

    // Retornar o token — o app vai setar como cookie de sessão
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
