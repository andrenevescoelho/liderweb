import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

export const dynamic = "force-dynamic";

const inter = Inter({ subsets: ["latin"] });

export const viewport: Viewport = {
  themeColor: "#7c3aed",
};

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXTAUTH_URL || "http://localhost:3000"),
  title: "Líder Web - Gestão de Ministério de Louvor",
  description: "Sistema completo para gestão de ministério de louvor: escalas, repertórios, membros e músicas. By Multitrack Gospel.",
  manifest: "/manifest.json",
  icons: {
    icon: "/logo.png",
    shortcut: "/logo.png",
    apple: "/logo.png",
  },
  openGraph: {
    title: "Líder Web - By Multitrack Gospel",
    description: "Gestão de Ministério de Louvor",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script src="https://apps.abacus.ai/chatllm/appllm-lib.js"></script>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#7c3aed" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      </head>
      <body className={`${inter?.className ?? ''} bg-gray-50 dark:bg-gray-950 min-h-screen`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
