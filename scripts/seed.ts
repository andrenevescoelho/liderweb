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

  const faqSeed = [
    {
      slug: "acesso-e-conta",
      name: "Acesso e Conta",
      order: 1,
      items: [
        {
          question: "Como redefinir minha senha no Liderweb?",
          answer:
            "Na tela de login, clique em 'Esqueci minha senha', informe seu e-mail e siga o link enviado para criar uma nova senha.",
          order: 1,
          tags: ["senha", "login", "acesso"],
        },
        {
          question: "Não recebi o e-mail de recuperação. O que fazer?",
          answer:
            "Verifique caixa de spam/lixo eletrônico e confirme se o e-mail digitado está correto. Se ainda não receber, peça ao administrador do seu grupo para validar seu cadastro.",
          order: 2,
          tags: ["e-mail", "recuperacao", "suporte"],
        },
      ],
    },
    {
      slug: "gestao-do-ministerio",
      name: "Gestão do Ministério",
      order: 2,
      items: [
        {
          question: "Como adicionar novos membros ao ministério?",
          answer:
            "Acesse a área de Membros, clique em adicionar ou convite e preencha os dados do participante. Administradores e líderes com permissão podem realizar essa ação.",
          order: 1,
          tags: ["membros", "convite", "administracao"],
        },
        {
          question: "Como publicar um comunicado para todo o grupo?",
          answer:
            "Entre em Comunicação > Comunicados, escreva sua mensagem e clique em Enviar comunicado. O aviso fica visível para os membros do grupo.",
          order: 2,
          tags: ["comunicados", "grupo", "lideranca"],
        },
      ],
    },
    {
      slug: "musicas-e-ensaios",
      name: "Músicas e Ensaios",
      order: 3,
      items: [
        {
          question: "Como montar uma escala com músicas?",
          answer:
            "Em Escalas, crie uma nova escala e selecione as músicas do repertório. Depois distribua as funções para cada membro e salve.",
          order: 1,
          tags: ["escalas", "musicas", "repertorio"],
        },
        {
          question: "Consigo organizar ensaios com confirmação de presença?",
          answer:
            "Sim. No módulo Ensaios você cria o evento, define data e repertório e os membros podem aceitar ou recusar presença diretamente pela plataforma.",
          order: 2,
          tags: ["ensaios", "presenca", "agenda"],
        },
        {
          question: "Onde encontro os recursos de prática como Pads, Splits e Multitracks?",
          answer:
            "No menu Música você encontra Pads & Loops, Split de músicas e Multitracks. O acesso depende do plano e das permissões do seu usuário.",
          order: 3,
          tags: ["pads", "split", "multitracks"],
        },
      ],
    },
  ];

  for (const category of faqSeed) {
    const faqCategory = await prisma.faqCategory.upsert({
      where: { slug: category.slug },
      update: {
        name: category.name,
        order: category.order,
        isActive: true,
      },
      create: {
        slug: category.slug,
        name: category.name,
        order: category.order,
        isActive: true,
      },
    });

    for (const item of category.items) {
      await prisma.faqItem.upsert({
        where: {
          categoryId_question: {
            categoryId: faqCategory.id,
            question: item.question,
          },
        },
        update: {
          answer: item.answer,
          order: item.order,
          tags: item.tags,
          isPublished: true,
        },
        create: {
          categoryId: faqCategory.id,
          question: item.question,
          answer: item.answer,
          order: item.order,
          tags: item.tags,
          isPublished: true,
        },
      });
    }
  }

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
  console.log("FAQ seed ensured:", faqSeed.length, "categorias");
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
