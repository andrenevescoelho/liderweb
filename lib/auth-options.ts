import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
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
        
        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
          include: {
            group: {
              include: {
                subscription: {
                  include: { plan: true },
                },
              },
            },
          },
        });
        
        if (!user) return null;
        
        const isValid = await bcrypt.compare(credentials.password, user.password);
        if (!isValid) return null;
        
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
          hasActiveSubscription,
          subscriptionStatus,
        };
      },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role;
        token.id = user.id;
        token.groupId = (user as any).groupId;
        token.hasActiveSubscription = (user as any).hasActiveSubscription;
        token.subscriptionStatus = (user as any).subscriptionStatus;
      }
      return token;
    },
    async session({ session, token }) {
      if (session?.user) {
        (session.user as any).role = token.role;
        (session.user as any).id = token.id;
        (session.user as any).groupId = token.groupId;
        (session.user as any).hasActiveSubscription = token.hasActiveSubscription;
        (session.user as any).subscriptionStatus = token.subscriptionStatus;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
};
