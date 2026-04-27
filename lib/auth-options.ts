import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import type { Adapter, AdapterUser } from "next-auth/adapters";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { AUDIT_ACTIONS, logUserAction } from "@/lib/audit-log";
import { AuditEntityType } from "@prisma/client";

async function verifyPassword(password: string, storedPassword: string | null, userId: string) {
  if (!storedPassword) {
    return false;
  }

  try {
    return await bcrypt.compare(password, storedPassword);
  } catch {
    // Compatibilidade com senhas legadas salvas em texto plano.
    if (password !== storedPassword) {
      return false;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    return true;
  }
}

export const authOptions: NextAuthOptions = {
  adapter: {
    ...PrismaAdapter(prisma),
    async createUser(user) {
      const createdUser = await prisma.user.create({
        data: {
          name: user.name ?? user.email ?? "Usuário",
          email: user.email,
        },
      });

      return {
        id: createdUser.id,
        name: createdUser.name,
        email: createdUser.email,
        emailVerified: null,
        image: null,
      } as AdapterUser;
    },
    async updateUser(user) {
      if (!user.id) {
        throw new Error("Cannot update user without id");
      }

      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: {
          ...(typeof user.name === "string" ? { name: user.name } : {}),
          ...(typeof user.email === "string" ? { email: user.email } : {}),
        },
      });

      return {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        emailVerified: null,
        image: null,
      } as AdapterUser;
    },
  } as Adapter,
  trustHost: true,
  providers: [
    ...(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim()
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            allowDangerousEmailAccountLinking: true,
          }),
        ]
      : []),
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const normalizedEmail = credentials.email.trim();
        
        const user = await prisma.user.findFirst({
          where: {
            email: {
              equals: normalizedEmail,
              mode: "insensitive",
            },
          },
          include: {
            profile: {
              select: {
                permissions: true,
                avatarUrl: true,
              },
            },
            group: {
              include: {
                subscription: {
                  include: { plan: true },
                },
              },
            },
          },
        });
        
        if (!user) {
          logUserAction({
            action: AUDIT_ACTIONS.LOGIN_FAILED,
            entityType: AuditEntityType.AUTH,
            description: `Tentativa de login inválida para ${normalizedEmail}`,
            metadata: { email: normalizedEmail, reason: "user_not_found" },
          }).catch(() => {});
          return null;
        }
        
        const isValid = await verifyPassword(credentials.password, user.password, user.id);
        if (!isValid) {
          logUserAction({
            userId: user.id,
            groupId: user.groupId,
            action: AUDIT_ACTIONS.LOGIN_FAILED,
            entityType: AuditEntityType.AUTH,
            description: `Tentativa de login inválida para ${user.email}`,
            metadata: { email: user.email, reason: "invalid_password" },
          }).catch(() => {});
          return null;
        }

        logUserAction({
          userId: user.id,
          groupId: user.groupId,
          action: AUDIT_ACTIONS.LOGIN_SUCCESS,
          entityType: AuditEntityType.AUTH,
          description: `Login realizado com sucesso por ${user.name}`,
          metadata: { provider: "credentials" },
        }).catch(() => {});
        
        // Verificar status da assinatura do grupo
        let subscriptionStatus = null;
        let hasActiveSubscription = true;
        
        // SuperAdmin não precisa de verificação de assinatura
        if (user.role !== "SUPERADMIN" && user.groupId && user.group) {
          const subscription = user.group.subscription;
          
          if (!subscription) {
            hasActiveSubscription = false;
            subscriptionStatus = "NO_SUBSCRIPTION";
          } else if (subscription.status === "ACTIVE" || subscription.status === "TRIALING") {
            hasActiveSubscription = true;
            subscriptionStatus = subscription.status;
          } else {
            hasActiveSubscription = false;
            subscriptionStatus = subscription.status;
          }
        }
        
        let musicCoachEnabled = false;
        if (user.groupId) {
          // Verificar se o plano tem acesso ao Professor IA
          const subscription = await prisma.subscription.findUnique({
            where: { groupId: user.groupId },
            include: { billingPlan: true, plan: true },
          });
          const isActive = ["ACTIVE", "TRIALING"].includes(subscription?.status ?? "");

          let planHasProfessor = false;
          if (isActive) {
            if (subscription?.billingPlan) {
              // Novo sistema de billing
              planHasProfessor = Boolean(subscription.billingPlan.features?.professor);
            } else if (subscription?.plan) {
              // Sistema legado — checar pelo nome do plano
              const planName = subscription.plan.name.toLowerCase();
              planHasProfessor = ["intermediário", "intermediario", "avançado", "avancado", "igreja", "enterprise"].some(n => planName.includes(n));
            }
          }

          if (planHasProfessor) {
            const coachProfile = await prisma.musicCoachProfile.findUnique({
              where: { userId_groupId: { userId: user.id, groupId: user.groupId } },
              select: { enabled: true },
            });
            musicCoachEnabled = coachProfile?.enabled ?? false;
          }
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          groupId: user.groupId,
          permissions: user.profile?.permissions ?? [],
          hasActiveSubscription,
          subscriptionStatus,
          musicCoachEnabled,
        };
      },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider !== "google") {
        return true;
      }

      const rawEmail = user.email ?? (typeof profile?.email === "string" ? profile.email : null);
      const normalizedEmail = rawEmail?.trim().toLowerCase();
      const isEmailVerified = Boolean((profile as { email_verified?: boolean } | undefined)?.email_verified);

      const existingUser = normalizedEmail
        ? await prisma.user.findFirst({
            where: {
              email: {
                equals: normalizedEmail,
                mode: "insensitive",
              },
            },
            select: {
              id: true,
              groupId: true,
              name: true,
            },
          })
        : null;

      if (!normalizedEmail || !isEmailVerified) {
        await logUserAction({
          userId: existingUser?.id ?? null,
          groupId: existingUser?.groupId ?? null,
          action: AUDIT_ACTIONS.LOGIN_FAILED,
          entityType: AuditEntityType.AUTH,
          description: "Tentativa de login Google recusada por email ausente ou não verificado",
          metadata: {
            provider: "google",
            email: normalizedEmail ?? null,
            hasEmail: Boolean(normalizedEmail),
            emailVerified: isEmailVerified,
            providerAccountId: account.providerAccountId,
          },
        });

        console.error("[auth][google] Login recusado: email ausente ou não verificado.", {
          hasEmail: Boolean(normalizedEmail),
          isEmailVerified,
          providerAccountId: account.providerAccountId,
        });
        return "/login?error=google_email_required";
      }

      console.info("[auth][google] Tentativa de login OAuth.", {
        providerAccountId: account.providerAccountId,
        matchedExistingUser: Boolean(existingUser),
      });

      if (user.id && user.email && user.email !== normalizedEmail) {
        await prisma.user.update({
          where: { id: user.id },
          data: { email: normalizedEmail },
        });
      }

      // Salvar foto do Google no perfil do usuário
      const googlePicture = (profile as any)?.picture ?? user.image ?? null;
      const targetUserId = existingUser?.id ?? user.id;
      if (googlePicture && targetUserId) {
        await prisma.user.update({
          where: { id: targetUserId },
          data: { avatarUrl: googlePicture } as any,
        }).catch(() => {}); // silencioso — não bloquear login
      }

      // Fire-and-forget — nunca bloquear o login por falha de auditoria
      logUserAction({
        userId: existingUser?.id ?? user.id ?? null,
        groupId: existingUser?.groupId ?? null,
        action: AUDIT_ACTIONS.LOGIN_SUCCESS,
        entityType: AuditEntityType.AUTH,
        description: `Login realizado com sucesso via Google por ${existingUser?.name ?? user.name ?? normalizedEmail}`,
        metadata: {
          provider: "google",
          email: normalizedEmail,
          providerAccountId: account.providerAccountId,
          matchedExistingUser: Boolean(existingUser),
        },
      }).catch(() => {}); // nunca propagar erro de auditoria

      return true;
    },
    async redirect({ url, baseUrl }) {
      // Se callback é /signup e não tem token, verificar se tem grupo
      if (url === `${baseUrl}/signup` || url === "/signup") {
        return `${baseUrl}/signup`;
      }
      if (url.startsWith("/")) {
        return `${baseUrl}${url}`;
      }

      try {
        const parsed = new URL(url);
        const parsedBaseUrl = new URL(baseUrl);

        // Aceita callback da mesma origem e também do mesmo host com protocolo diferente
        // (cenário comum em produção atrás de proxy/reverse proxy).
        if (parsed.origin === baseUrl || parsed.host === parsedBaseUrl.host) {
          return url;
        }
      } catch {
        return `${baseUrl}/dashboard`;
      }

      return `${baseUrl}/dashboard`;
    },
    async jwt({ token, user }) {
      if (user) {
        token.name = user.name;
        token.role = (user as any).role;
        token.id = user.id;
        token.groupId = (user as any).groupId;
        token.permissions = (user as any).permissions ?? [];
        token.hasActiveSubscription = (user as any).hasActiveSubscription;
        token.subscriptionStatus = (user as any).subscriptionStatus;
        token.musicCoachEnabled = (user as any).musicCoachEnabled ?? false;

        // Gerar sessionId único para esta sessão
        const sessionId = `${user.id}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        token.sessionId = sessionId;

        // Registrar sessão ativa e aplicar limite
        if (user.id) {
          prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }).catch(() => {});

          // Fire-and-forget: registrar sessão e limpar excedentes
          (async () => {
            try {
              const dbUser = await prisma.user.findUnique({
                where: { id: user.id },
                select: { maxSessions: true },
              });
              const maxSessions = dbUser?.maxSessions ?? 1;

              // Criar nova sessão ativa
              await (prisma as any).userActiveSession.create({
                data: {
                  userId: user.id,
                  sessionId,
                  ip: null,
                  userAgent: null,
                },
              });

              // Buscar todas as sessões do usuário ordenadas por criação
              const sessions = await (prisma as any).userActiveSession.findMany({
                where: { userId: user.id },
                orderBy: { createdAt: "asc" },
              });

              // Remover sessões mais antigas que excedem o limite
              if (sessions.length > maxSessions) {
                const toDelete = sessions.slice(0, sessions.length - maxSessions);
                await (prisma as any).userActiveSession.deleteMany({
                  where: { id: { in: toDelete.map((s: any) => s.id) } },
                });
              }
            } catch (e) {
              console.warn("[auth] Falha ao registrar sessão ativa:", e);
            }
          })();
        }
      }

      if (token.id && typeof token.id === "string") {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id },
          include: {
            profile: {
              select: {
                permissions: true,
                avatarUrl: true,
              },
            },
            group: {
              select: {
                subscription: {
                  select: {
                    status: true,
                  },
                },
              },
            },
          },
        });

        if (dbUser) {
          token.name = dbUser.name;
          token.role = dbUser.role;
          token.groupId = dbUser.groupId;
          token.permissions = dbUser.profile?.permissions ?? [];
          token.avatarUrl = (dbUser as any).avatarUrl ?? dbUser.profile?.avatarUrl ?? null;

          if (dbUser.role !== "SUPERADMIN" && dbUser.groupId) {
            const subscriptionStatus = dbUser.group?.subscription?.status ?? "NO_SUBSCRIPTION";
            token.subscriptionStatus = subscriptionStatus;
            token.hasActiveSubscription =
              subscriptionStatus === "ACTIVE" || subscriptionStatus === "TRIALING";
          } else if (dbUser.role === "SUPERADMIN") {
            token.subscriptionStatus = null;
            token.hasActiveSubscription = true;
          }

          if (dbUser.groupId) {
            const coachProfile = await prisma.musicCoachProfile.findUnique({
              where: { userId_groupId: { userId: dbUser.id, groupId: dbUser.groupId } },
              select: { enabled: true },
            });
            token.musicCoachEnabled = coachProfile?.enabled ?? false;
          } else {
            token.musicCoachEnabled = false;
          }
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session?.user) {
        session.user.name = token.name ?? session.user.name;
        (session.user as any).role = token.role;
        (session.user as any).id = token.id;
        (session.user as any).groupId = token.groupId;
        (session.user as any).permissions = token.permissions;
        (session.user as any).hasActiveSubscription = token.hasActiveSubscription;
        (session.user as any).subscriptionStatus = token.subscriptionStatus;
        (session.user as any).musicCoachEnabled = token.musicCoachEnabled ?? false;
        (session.user as any).avatarUrl = token.avatarUrl ?? null;
      }
      return session;
    },
  },

  events: {
    async signOut({ token }) {
      const userId = typeof token?.id === "string" ? token.id : null;
      const groupId = typeof token?.groupId === "string" ? token.groupId : null;

      await logUserAction({
        userId,
        groupId,
        action: AUDIT_ACTIONS.LOGOUT,
        entityType: AuditEntityType.AUTH,
        description: "Logout realizado no sistema",
      });
    },
  },
  pages: {
    signIn: "/login",
  },
  logger: {
    error(code, metadata) {
      console.error("[auth][error]", code, metadata ?? {});
    },
    warn(code) {
      console.warn("[auth][warn]", code);
    },
  },
};
