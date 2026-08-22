import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth-options";
import { WhatsAppCampaignDashboard } from "@/components/admin/whatsapp-campaign-dashboard";

export default async function WhatsAppCampaignPage() {
  const session = await getServerSession(authOptions);
  const user = session?.user as { role?: string } | undefined;

  if (!session) {
    redirect("/login");
  }

  if (user?.role !== "SUPERADMIN") {
    redirect("/dashboard");
  }

  return <WhatsAppCampaignDashboard />;
}
