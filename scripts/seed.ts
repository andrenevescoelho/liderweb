import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  const defaultRoleFunctions = [
    "Vocal",
    "Back Vocal",
    "Teclado",
    "Violão",
    "Guitarra",
    "Baixo",
    "Bateria",
    "Ministro",
    "Pad",
    "Playback",
    "MD",
  ];

  await Promise.all(
    defaultRoleFunctions.map((name) =>
      prisma.roleFunction.upsert({
        where: {
          groupId_name: {
            groupId: null,
            name,
          },
        },
        update: {},
        create: {
          name,
          groupId: null,
        },
      }),
    ),
  );

  const hashedPassword = await bcrypt.hash("johndoe123", 10);

  // Criar SuperAdmin (administrador geral do sistema)
  const superAdmin = await prisma.user.upsert({
    where: { email: "john@doe.com" },
    update: {
      role: "SUPERADMIN",
      groupId: null,
    },
    create: {
      email: "john@doe.com",
      name: "Super Admin",
      password: hashedPassword,
      role: "SUPERADMIN",
      groupId: null,
      profile: {
        create: {
          active: true,
        },
      },
    },
  });

  console.log("SuperAdmin user created:", superAdmin.email);
  console.log("Default role functions ensured:", defaultRoleFunctions.length);
  console.log("Seeding complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
