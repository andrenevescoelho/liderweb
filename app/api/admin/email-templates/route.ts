export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

// Templates padrão — usados quando não há customização salva no banco
const DEFAULT_TEMPLATES: Record<string, { label: string; subject: string; htmlBody: string }> = {
  welcome_group: {
    label: "Boas-vindas ao cadastrar ministério",
    subject: "🎉 Bem-vindo ao Líder Web — {{ministerio}}",
    htmlBody: `<p>Olá, {{nome}}!</p>
<p>Seu ministério <strong>{{ministerio}}</strong> está pronto no Líder Web.</p>
<p>Com o Líder Web você pode:</p>
<ul>
  <li>🎵 Gerenciar seu repertório com cifras e tons</li>
  <li>📅 Criar escalas com inteligência artificial</li>
  <li>🎧 Usar o player de multitracks profissional</li>
  <li>👥 Convidar e gerenciar sua equipe</li>
  <li>🎼 Organizar ensaios e acompanhar presença</li>
</ul>
<p><a href="{{app_url}}/dashboard">Acessar meu ministério →</a></p>`,
  },
  inactive_7d: {
    label: "Grupo inativo há 7 dias",
    subject: "👋 {{ministerio}}, sentimos sua falta no Líder Web",
    htmlBody: `<p>Olá, {{nome}}!</p>
<p>Notamos que o ministério <strong>{{ministerio}}</strong> não acessa o Líder Web há 7 dias.</p>
<p>Seu repertório, escalas e membros ainda estão lá esperando por você.</p>
<p><a href="{{app_url}}/dashboard">Voltar ao Líder Web →</a></p>`,
  },
  inactive_15d: {
    label: "Grupo inativo há 15 dias",
    subject: "⚠️ {{ministerio}}, sentimos sua falta no Líder Web",
    htmlBody: `<p>Olá, {{nome}}!</p>
<p>Notamos que o ministério <strong>{{ministerio}}</strong> não acessa o Líder Web há 15 dias.</p>
<p>Grupos inativos perdem o histórico de escalas e não recebem sugestões da IA. Volte a usar e aproveite ao máximo!</p>
<p><a href="{{app_url}}/dashboard">Voltar ao Líder Web →</a></p>`,
  },
  no_subscription: {
    label: "Grupo sem assinatura ativa",
    subject: "🔔 {{ministerio}} — Sua assinatura precisa de atenção",
    htmlBody: `<p>Olá, {{nome}}!</p>
<p>O ministério <strong>{{ministerio}}</strong> está sem assinatura ativa.</p>
<p>Assine agora e continue usando escalas com IA, player de multitracks e muito mais.</p>
<p><a href="{{app_url}}/planos">Ver planos disponíveis →</a></p>`,
  },
  no_group_user: {
    label: "Usuário cadastrado sem ministério",
    subject: "👋 {{nome}}, complete seu cadastro no Líder Web",
    htmlBody: `<p>Olá, {{nome}}!</p>
<p>Você criou uma conta no Líder Web mas ainda não está vinculado a nenhum ministério.</p>
<p>Você tem duas opções:</p>
<ul>
  <li>📩 Peça um convite ao líder do seu ministério</li>
  <li>🏛️ Cadastre seu ministério e comece gratuitamente</li>
</ul>
<p><a href="{{app_url}}/sem-grupo">Acessar minha conta →</a></p>`,
  },
};

function isSuperAdmin(user: any) {
  return user?.role === "SUPERADMIN";
}

// GET — listar todos os templates (banco ou padrão)
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isSuperAdmin(session?.user)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const saved = await (prisma as any).emailTemplate.findMany();
  const savedMap = new Map(saved.map((t: any) => [t.type, t]));

  // Mesclar: banco prevalece sobre padrão
  const templates = Object.entries(DEFAULT_TEMPLATES).map(([type, def]) => {
    const db = savedMap.get(type) as any;
    return {
      type,
      label: def.label,
      subject: db?.subject ?? def.subject,
      htmlBody: db?.htmlBody ?? def.htmlBody,
      isCustomized: !!db,
      updatedAt: db?.updatedAt ?? null,
    };
  });

  return NextResponse.json(templates);
}

// PATCH — salvar customização de um template
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isSuperAdmin(session?.user)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { type, subject, htmlBody } = await req.json();

  if (!type || !subject || !htmlBody) {
    return NextResponse.json({ error: "type, subject e htmlBody são obrigatórios" }, { status: 400 });
  }

  if (!DEFAULT_TEMPLATES[type]) {
    return NextResponse.json({ error: "Tipo de template inválido" }, { status: 400 });
  }

  const template = await (prisma as any).emailTemplate.upsert({
    where: { type },
    create: {
      type,
      label: DEFAULT_TEMPLATES[type].label,
      subject,
      htmlBody,
      updatedBy: (session!.user as any).id,
    },
    update: {
      subject,
      htmlBody,
      updatedBy: (session!.user as any).id,
    },
  });

  return NextResponse.json(template);
}

// DELETE — restaurar template padrão
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isSuperAdmin(session?.user)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { type } = await req.json();

  await (prisma as any).emailTemplate.deleteMany({ where: { type } }).catch(() => null);

  return NextResponse.json({ restored: true, default: DEFAULT_TEMPLATES[type] });
}
