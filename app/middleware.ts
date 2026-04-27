import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

// Forçar Node.js runtime para o Map de rate limit persistir entre requests
export const runtime = "nodejs";

// ─── Rotas de API públicas ────────────────────────────────────────────────────
// Qualquer rota NÃO listada aqui exige sessão autenticada.

const PUBLIC_API_PREFIXES = [
  // NextAuth — login, callback, session, csrf
  "/api/auth/",

  // Cadastro de novo usuário/grupo
  "/api/signup/",

  // Reset de senha
  "/api/auth/forgot-password",
  "/api/auth/reset-password",

  // Convite por token (aceitar sem estar logado)
  "/api/invites/",

  // Planos de assinatura (exibidos na página pública /planos)
  "/api/billing/plans",

  // Webhooks de pagamento (validados por assinatura Stripe internamente)
  "/api/billing/webhook",
  "/api/subscription/webhook",

  // Workers e callbacks internos (protegidos por secret próprio)
  "/api/multitracks/worker",
  "/api/splits/process",
  "/api/songs/",  // analysis-result callback do serviço de áudio
];

// ─── Rate limiting simples em memória ────────────────────────────────────────
// Proteção básica contra abuso. Para produção com múltiplos containers,
// substituir por Redis (Upstash ou similar).

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minuto
const RATE_LIMIT_MAX = 300;          // 300 requests/min por IP (5/seg)
const RATE_LIMIT_MAX_AUTH = 60;      // 60 requests/min para rotas de auth (anti brute-force)

function getRateLimitKey(ip: string, isAuthRoute: boolean): string {
  return `${isAuthRoute ? "auth" : "api"}:${ip}`;
}

function checkRateLimit(ip: string, isAuthRoute: boolean): boolean {
  const key = getRateLimitKey(ip, isAuthRoute);
  const now = Date.now();
  const limit = isAuthRoute ? RATE_LIMIT_MAX_AUTH : RATE_LIMIT_MAX;

  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true; // permitido
  }

  if (entry.count >= limit) {
    return false; // bloqueado
  }

  entry.count++;
  return true; // permitido
}

// Limpar entradas expiradas periodicamente (evitar memory leak)
let lastCleanup = Date.now();
function cleanupRateLimitMap() {
  const now = Date.now();
  if (now - lastCleanup < 60_000) return;
  lastCleanup = now;
  for (const [key, entry] of rateLimitMap.entries()) {
    if (now > entry.resetAt) rateLimitMap.delete(key);
  }
}

// ─── Middleware ───────────────────────────────────────────────────────────────

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Só atua em rotas de API
  if (!pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // IP do cliente
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  const isAuthRoute = pathname.startsWith("/api/auth/");

  // ── Rate limiting ───────────────────────────────────────────────────────────
  cleanupRateLimitMap();

  if (!checkRateLimit(ip, isAuthRoute)) {
    return NextResponse.json(
      { error: "Muitas requisições. Tente novamente em instantes." },
      {
        status: 429,
        headers: {
          "Retry-After": "60",
          "X-RateLimit-Limit": isAuthRoute ? String(RATE_LIMIT_MAX_AUTH) : String(RATE_LIMIT_MAX),
          "X-RateLimit-Reset": String(Math.ceil((Date.now() + RATE_LIMIT_WINDOW_MS) / 1000)),
        },
      }
    );
  }

  // ── Rotas públicas — liberar sem verificar sessão ───────────────────────────
  const isPublic = PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  if (isPublic) {
    return NextResponse.next();
  }

  // ── Rotas protegidas — exigir token de sessão ───────────────────────────────
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (!token) {
    return NextResponse.json(
      { error: "Não autorizado" },
      { status: 401 }
    );
  }

  // ── Verificar se sessionId ainda é válido (controle de sessões simultâneas) ─
  // Só verifica em rotas que não sejam de auth para evitar loop
  const sessionId = (token as any).sessionId;
  if (sessionId && !pathname.startsWith("/api/auth/")) {
    try {
      // Importar prisma dinamicamente para não quebrar o edge runtime
      const { prisma } = await import("@/lib/db");
      const activeSession = await (prisma as any).userActiveSession.findUnique({
        where: { sessionId },
        select: { id: true },
      });

      if (!activeSession) {
        // Sessão foi revogada (limite excedido ou revogação manual)
        return NextResponse.json(
          { error: "Sessão expirada. Faça login novamente.", code: "SESSION_REVOKED" },
          { status: 401 }
        );
      }

      // Atualizar lastSeenAt em background
      (prisma as any).userActiveSession.update({
        where: { sessionId },
        data: { lastSeenAt: new Date() },
      }).catch(() => {});

    } catch {
      // Nunca bloquear por falha na verificação de sessão
    }
  }

  // ── Cabeçalhos de segurança adicionais ─────────────────────────────────────
  const response = NextResponse.next();
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  return response;
}

export const config = {
  matcher: ["/api/:path*"],
};
