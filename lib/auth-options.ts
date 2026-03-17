import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
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
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      allowDangerousEmailAccountLinking: true,
    }),
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
          await logUserAction({
            action: AUDIT_ACTIONS.LOGIN_FAILED,
            entityType: AuditEntityType.AUTH,
            description: `Tentativa de login inválida para ${normalizedEmail}`,
            metadata: { email: normalizedEmail, reason: "user_not_found" },
          });
          return null;
        }
        
        const isValid = await verifyPassword(credentials.password, user.password, user.id);
        if (!isValid) {
          await logUserAction({
            userId: user.id,
            groupId: user.groupId,
            action: AUDIT_ACTIONS.LOGIN_FAILED,
            entityType: AuditEntityType.AUTH,
            description: `Tentativa de login inválida para ${user.email}`,
            metadata: { email: user.email, reason: "invalid_password" },
          });
          return null;
        }

        await logUserAction({
          userId: user.id,
          groupId: user.groupId,
          action: AUDIT_ACTIONS.LOGIN_SUCCESS,
          entityType: AuditEntityType.AUTH,
          description: `Login realizado com sucesso por ${user.name}`,
          metadata: { provider: "credentials" },
        });
        
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
        
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          groupId: user.groupId,
          permissions: user.profile?.permissions ?? [],
          hasActiveSubscription,
          subscriptionStatus,
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

      if (!normalizedEmail || !isEmailVerified) {
        console.error("[auth][google] Login recusado: email ausente ou não verificado.", {
          hasEmail: Boolean(normalizedEmail),
          isEmailVerified,
          providerAccountId: account.providerAccountId,
        });
        return "/login?error=google_email_required";
      }

      const existingUser = await prisma.user.findFirst({
        where: {
          email: {
            equals: normalizedEmail,
            mode: "insensitive",
          },
        },
        select: {
          id: true,
        },
      });

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

      return true;
    },
    async redirect({ url, baseUrl }) {
      if (url.startsWith("/")) {
        return `${baseUrl}${url}`;
      }

      try {
        const parsed = new URL(url);
        if (parsed.origin === baseUrl) {
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
      }

      if (token.id && typeof token.id === "string") {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id },
          include: {
            profile: {
              select: {
                permissions: true,
              },
            },
          },
        });

        if (dbUser) {
          token.name = dbUser.name;
          token.role = dbUser.role;
          token.groupId = dbUser.groupId;
          token.permissions = dbUser.profile?.permissions ?? [];
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
};
