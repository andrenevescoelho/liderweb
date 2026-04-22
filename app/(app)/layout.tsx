import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth-options";
import { AppLayout } from "@/components/app-layout";

export default async function AppLayoutWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { role?: string; hasActiveSubscription?: boolean; groupId?: string } | undefined;

  if (!session) {
    redirect("/login");
  }

  // Usuário autenticado mas sem grupo — limbo do Google login
  if (user?.role !== "SUPERADMIN" && !user?.groupId) {
    redirect("/sem-grupo");
  }

  if (user?.role !== "SUPERADMIN" && user?.hasActiveSubscription === false) {
    if (user.role === "ADMIN") {
      redirect("/reativar-assinatura");
    }

    redirect("/sem-assinatura");
  }

  return <AppLayout>{children}</AppLayout>;
}
