import { PrismaClient } from "@prisma/client";

const globalForFunnelPrisma = globalThis as unknown as {
  funnelPrisma?: PrismaClient;
};

function createFunnelPrisma() {
  const url = process.env.FUNNEL_DATABASE_URL?.trim();

  if (!url) {
    throw new Error("FUNNEL_DATABASE_URL não configurada");
  }

  return new PrismaClient({
    datasources: {
      db: { url },
    },
  });
}

export function getFunnelPrisma() {
  if (!globalForFunnelPrisma.funnelPrisma) {
    globalForFunnelPrisma.funnelPrisma = createFunnelPrisma();
  }

  return globalForFunnelPrisma.funnelPrisma;
}
