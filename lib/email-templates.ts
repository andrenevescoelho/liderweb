// ─── Templates de Email — LiderWeb ──────────────────────────────────────────
// Cor primária azul alinhada com o tema da plataforma

const BASE_URL = process.env.NEXTAUTH_URL ?? "https://liderweb.multitrackgospel.com";

const PRIMARY = "#2563eb";   // azul
const PRIMARY_DARK = "#1d4ed8";
const BG_LIGHT = "#f8fafc";
const BORDER = "#e2e8f0";
const TEXT = "#1e293b";
const TEXT_MUTED = "#64748b";

function baseLayout(content: string, groupName: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:${BG_LIGHT};font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${BG_LIGHT};padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,${PRIMARY} 0%,${PRIMARY_DARK} 100%);padding:28px 32px;border-radius:12px 12px 0 0;text-align:center;">
            <p style="margin:0;color:rgba(255,255,255,0.7);font-size:12px;letter-spacing:1px;text-transform:uppercase;">Líder Web</p>
            <p style="margin:6px 0 0;color:#ffffff;font-size:13px;font-weight:500;">${groupName}</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="background:#ffffff;padding:32px;border:1px solid ${BORDER};border-top:none;">
            ${content}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:${BG_LIGHT};padding:20px 32px;border-radius:0 0 12px 12px;border:1px solid ${BORDER};border-top:none;text-align:center;">
            <p style="margin:0;font-size:12px;color:${TEXT_MUTED};">
              Líder Web · by <a href="https://multitrackgospel.com" style="color:${PRIMARY};text-decoration:none;">multitrackgospel.com</a>
            </p>
            <p style="margin:6px 0 0;font-size:11px;color:#94a3b8;">
              Você está recebendo este email porque é membro do ministério ${groupName}.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function btn(label: string, url: string): string {
  return `<div style="text-align:center;margin:24px 0;">
    <a href="${url}" style="display:inline-block;background:${PRIMARY};color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600;letter-spacing:0.3px;">${label}</a>
  </div>`;
}

function chip(label: string, color = PRIMARY): string {
  return `<span style="display:inline-block;background:${color}18;color:${color};border:1px solid ${color}30;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600;">${label}</span>`;
}

// ── 1. Email: escala criada / atualizada ─────────────────────────────────────

export interface ScheduleEmailData {
  memberName: string;
  groupName: string;
  scheduleName: string;
  scheduleDate: Date;
  scheduleTime?: string | null;
  memberRole: string;
  songs?: { title: string; artist?: string | null }[];
  otherMembers?: { name: string; role: string }[];
  scheduleId: string;
  isUpdate?: boolean;
}

export function scheduleCreatedEmail(data: ScheduleEmailData): { subject: string; html: string } {
  const dateStr = data.scheduleDate.toLocaleDateString("pt-BR", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric",
  });
  const action = data.isUpdate ? "atualizada" : "criada";
  const subject = `${data.isUpdate ? "✏️" : "📅"} Escala ${action}: ${data.scheduleName} — ${data.scheduleDate.toLocaleDateString("pt-BR")}`;

  const songsHtml = data.songs?.length
    ? `<div style="margin:20px 0;">
        <p style="margin:0 0 10px;font-size:13px;font-weight:600;color:${TEXT};text-transform:uppercase;letter-spacing:0.5px;">🎵 Repertório</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${BORDER};border-radius:8px;overflow:hidden;">
          ${data.songs.map((s, i) => `
            <tr style="background:${i % 2 === 0 ? "#ffffff" : BG_LIGHT};">
              <td style="padding:10px 14px;font-size:13px;color:${TEXT};">${s.title}</td>
              <td style="padding:10px 14px;font-size:12px;color:${TEXT_MUTED};text-align:right;">${s.artist ?? ""}</td>
            </tr>`).join("")}
        </table>
      </div>` : "";

  const membersHtml = data.otherMembers?.length
    ? `<div style="margin:20px 0;">
        <p style="margin:0 0 10px;font-size:13px;font-weight:600;color:${TEXT};text-transform:uppercase;letter-spacing:0.5px;">👥 Equipe escalada</p>
        <div style="display:flex;flex-wrap:wrap;gap:6px;">
          ${data.otherMembers.map(m => `<span style="background:${BG_LIGHT};border:1px solid ${BORDER};padding:4px 10px;border-radius:6px;font-size:12px;color:${TEXT};">${m.name} <span style="color:${TEXT_MUTED};">· ${m.role}</span></span>`).join("")}
        </div>
      </div>` : "";

  const content = `
    <p style="margin:0 0 4px;font-size:22px;font-weight:700;color:${TEXT};">Você foi escalado! 🎉</p>
    <p style="margin:0 0 24px;font-size:14px;color:${TEXT_MUTED};">Olá, <strong>${data.memberName}</strong>. Você tem uma escala ${action}.</p>

    <div style="background:${BG_LIGHT};border:1px solid ${BORDER};border-radius:10px;padding:20px;margin-bottom:24px;">
      <p style="margin:0 0 12px;font-size:16px;font-weight:700;color:${TEXT};">${data.scheduleName}</p>
      <table cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:4px 0;font-size:13px;color:${TEXT_MUTED};width:80px;">📅 Data</td>
          <td style="padding:4px 0;font-size:13px;color:${TEXT};font-weight:500;">${dateStr}</td>
        </tr>
        ${data.scheduleTime ? `<tr>
          <td style="padding:4px 0;font-size:13px;color:${TEXT_MUTED};">🕐 Horário</td>
          <td style="padding:4px 0;font-size:13px;color:${TEXT};font-weight:500;">${data.scheduleTime}</td>
        </tr>` : ""}
        <tr>
          <td style="padding:4px 0;font-size:13px;color:${TEXT_MUTED};">🎸 Função</td>
          <td style="padding:4px 0;">${chip(data.memberRole)}</td>
        </tr>
      </table>
    </div>

    ${songsHtml}
    ${membersHtml}

    ${btn("Ver escala completa", `${BASE_URL}/schedules`)}

    <p style="margin:20px 0 0;font-size:13px;color:${TEXT_MUTED};text-align:center;">
      Por favor confirme sua presença diretamente na plataforma.
    </p>
  `;

  return { subject, html: baseLayout(content, data.groupName) };
}

// ── 2. Email: membro confirmou/recusou presença ──────────────────────────────

export interface PresenceResponseEmailData {
  adminName: string;
  adminEmail: string;
  groupName: string;
  memberName: string;
  scheduleName: string;
  scheduleDate: Date;
  memberRole: string;
  status: "ACCEPTED" | "DECLINED";
  scheduleId: string;
}

export function presenceResponseEmail(data: PresenceResponseEmailData): { subject: string; html: string } {
  const accepted = data.status === "ACCEPTED";
  const emoji = accepted ? "✅" : "❌";
  const statusLabel = accepted ? "confirmou presença" : "recusou participação";
  const statusColor = accepted ? "#16a34a" : "#dc2626";

  const dateStr = data.scheduleDate.toLocaleDateString("pt-BR", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric",
  });

  const subject = `${emoji} ${data.memberName} ${statusLabel} — ${data.scheduleName}`;

  const content = `
    <p style="margin:0 0 4px;font-size:22px;font-weight:700;color:${TEXT};">${emoji} Resposta de escala</p>
    <p style="margin:0 0 24px;font-size:14px;color:${TEXT_MUTED};">Olá, <strong>${data.adminName}</strong>. Um membro respondeu à escala.</p>

    <div style="background:${BG_LIGHT};border:1px solid ${BORDER};border-radius:10px;padding:20px;margin-bottom:24px;">
      <table cellpadding="0" cellspacing="0" width="100%">
        <tr>
          <td style="padding:4px 0;font-size:13px;color:${TEXT_MUTED};width:80px;">👤 Membro</td>
          <td style="padding:4px 0;font-size:13px;color:${TEXT};font-weight:600;">${data.memberName}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;font-size:13px;color:${TEXT_MUTED};">🎸 Função</td>
          <td style="padding:4px 0;">${chip(data.memberRole)}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;font-size:13px;color:${TEXT_MUTED};">📅 Escala</td>
          <td style="padding:4px 0;font-size:13px;color:${TEXT};font-weight:500;">${data.scheduleName}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;font-size:13px;color:${TEXT_MUTED};">🗓️ Data</td>
          <td style="padding:4px 0;font-size:13px;color:${TEXT};">${dateStr}</td>
        </tr>
        <tr>
          <td style="padding:6px 0 0;font-size:13px;color:${TEXT_MUTED};">Status</td>
          <td style="padding:6px 0 0;">${chip(accepted ? "Confirmado" : "Recusado", statusColor)}</td>
        </tr>
      </table>
    </div>

    ${!accepted ? `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:14px 16px;margin-bottom:20px;">
      <p style="margin:0;font-size:13px;color:#991b1b;">⚠️ <strong>${data.memberName}</strong> recusou a escala. Você pode precisar substituí-lo.</p>
    </div>` : ""}

    ${btn("Gerenciar escala", `${BASE_URL}/schedules`)}
  `;

  return { subject, html: baseLayout(content, data.groupName) };
}

// ── 3. Email: lembrete de escala (para N8N depois) ───────────────────────────

export interface ScheduleReminderEmailData {
  memberName: string;
  groupName: string;
  scheduleName: string;
  scheduleDate: Date;
  scheduleTime?: string | null;
  memberRole: string;
  hoursUntil: number;
}

export function scheduleReminderEmail(data: ScheduleReminderEmailData): { subject: string; html: string } {
  const dateStr = data.scheduleDate.toLocaleDateString("pt-BR", {
    weekday: "long", day: "2-digit", month: "long",
  });
  const timeLabel = data.hoursUntil <= 2 ? "em breve" : `em ${data.hoursUntil}h`;
  const subject = `⏰ Lembrete: ${data.scheduleName} ${timeLabel}`;

  const content = `
    <p style="margin:0 0 4px;font-size:22px;font-weight:700;color:${TEXT};">Lembrete de escala ⏰</p>
    <p style="margin:0 0 24px;font-size:14px;color:${TEXT_MUTED};">Olá, <strong>${data.memberName}</strong>! Você tem uma escala chegando.</p>

    <div style="background:${BG_LIGHT};border:1px solid ${BORDER};border-radius:10px;padding:20px;margin-bottom:24px;">
      <p style="margin:0 0 12px;font-size:16px;font-weight:700;color:${TEXT};">${data.scheduleName}</p>
      <table cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:4px 0;font-size:13px;color:${TEXT_MUTED};width:80px;">📅 Quando</td>
          <td style="padding:4px 0;font-size:13px;color:${TEXT};font-weight:500;">${dateStr}${data.scheduleTime ? ` às ${data.scheduleTime}` : ""}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;font-size:13px;color:${TEXT_MUTED};">🎸 Função</td>
          <td style="padding:4px 0;">${chip(data.memberRole)}</td>
        </tr>
      </table>
    </div>

    ${btn("Ver escala", `${BASE_URL}/schedules`)}
  `;

  return { subject, html: baseLayout(content, data.groupName) };
}

// ── 4. Email: aniversário (para N8N depois) ──────────────────────────────────

export interface BirthdayEmailData {
  recipientName: string;
  groupName: string;
  birthdayMemberName: string;
  birthdayMemberRole?: string;
}

export function birthdayEmail(data: BirthdayEmailData): { subject: string; html: string } {
  const subject = `🎂 Aniversário hoje: ${data.birthdayMemberName}!`;

  const content = `
    <p style="margin:0 0 4px;font-size:22px;font-weight:700;color:${TEXT};">🎂 Aniversário hoje!</p>
    <p style="margin:0 0 24px;font-size:14px;color:${TEXT_MUTED};">Olá, <strong>${data.recipientName}</strong>!</p>

    <div style="background:linear-gradient(135deg,#fef3c7,#fde68a);border:1px solid #fbbf24;border-radius:10px;padding:24px;margin-bottom:24px;text-align:center;">
      <p style="margin:0;font-size:40px;">🎉</p>
      <p style="margin:12px 0 4px;font-size:20px;font-weight:700;color:#92400e;">${data.birthdayMemberName}</p>
      ${data.birthdayMemberRole ? `<p style="margin:0;font-size:13px;color:#b45309;">${data.birthdayMemberRole}</p>` : ""}
      <p style="margin:12px 0 0;font-size:14px;color:#78350f;">está fazendo aniversário hoje!</p>
    </div>

    ${btn("Ver membros", `${BASE_URL}/members`)}
  `;

  return { subject, html: baseLayout(content, data.groupName) };
}

// ─── Templates de Marketing / Automação ──────────────────────────────────────

export function welcomeGroupEmail(data: {
  adminName: string;
  groupName: string;
  appUrl: string;
}): { subject: string; html: string } {
  const content = `
    <p style="margin:0 0 16px;font-size:16px;font-weight:700;color:${TEXT};">🎉 Bem-vindo ao Líder Web, ${data.adminName}!</p>
    <p style="margin:0 0 16px;color:${TEXT_MUTED};">Seu ministério <strong>${data.groupName}</strong> está pronto. Veja o que você pode fazer:</p>
    <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:20px;">
      <tr><td style="padding:8px 0;border-bottom:1px solid ${BORDER};">🎵 <strong>Repertório</strong> — Cadastre músicas com cifras e tons personalizados</td></tr>
      <tr><td style="padding:8px 0;border-bottom:1px solid ${BORDER};">📅 <strong>Escalas com IA</strong> — Gere escalas completas em segundos</td></tr>
      <tr><td style="padding:8px 0;border-bottom:1px solid ${BORDER};">🎧 <strong>Multitracks</strong> — Player profissional com stems separados</td></tr>
      <tr><td style="padding:8px 0;border-bottom:1px solid ${BORDER};">👥 <strong>Membros</strong> — Convide sua equipe e gerencie funções</td></tr>
      <tr><td style="padding:8px 0;">🎼 <strong>Ensaios</strong> — Organize ensaios e acompanhe presença</td></tr>
    </table>
    ${btn("Acessar meu ministério", data.appUrl + "/dashboard")}
  `;
  return {
    subject: `🎉 Bem-vindo ao Líder Web — ${data.groupName}`,
    html: baseLayout(content, data.groupName),
  };
}

export function inactiveGroupEmail(data: {
  adminName: string;
  groupName: string;
  daysSinceLastActivity: number;
  appUrl: string;
}): { subject: string; html: string } {
  const isLong = data.daysSinceLastActivity >= 15;
  const content = `
    <p style="margin:0 0 16px;font-size:16px;font-weight:700;color:${TEXT};">Olá, ${data.adminName} 👋</p>
    <p style="margin:0 0 16px;color:${TEXT_MUTED};">
      Notamos que o ministério <strong>${data.groupName}</strong> não acessa o Líder Web há 
      <strong>${data.daysSinceLastActivity} dias</strong>.
    </p>
    ${isLong ? `
    <div style="background:#fef3c7;border:1px solid #fbbf24;border-radius:8px;padding:16px;margin-bottom:16px;">
      <p style="margin:0;color:#92400e;font-size:14px;">
        💡 <strong>Dica:</strong> Grupos inativos perdem o histórico de escalas e não recebem sugestões da IA. Volte a usar e aproveite ao máximo!
      </p>
    </div>` : ""}
    <p style="margin:0 0 16px;color:${TEXT_MUTED};">Seu repertório, escalas e membros ainda estão lá esperando por você.</p>
    ${btn("Voltar ao Líder Web", data.appUrl + "/dashboard")}
  `;
  return {
    subject: `${isLong ? "⚠️" : "👋"} ${data.groupName}, sentimos sua falta no Líder Web`,
    html: baseLayout(content, data.groupName),
  };
}

export function noSubscriptionEmail(data: {
  adminName: string;
  groupName: string;
  appUrl: string;
  trialDaysLeft?: number;
}): { subject: string; html: string } {
  const content = `
    <p style="margin:0 0 16px;font-size:16px;font-weight:700;color:${TEXT};">Olá, ${data.adminName}!</p>
    <p style="margin:0 0 16px;color:${TEXT_MUTED};">
      O ministério <strong>${data.groupName}</strong> está sem assinatura ativa.
      ${data.trialDaysLeft ? `Você tem <strong>${data.trialDaysLeft} dias</strong> de acesso gratuito restantes.` : "Seu acesso pode estar limitado."}
    </p>
    <p style="margin:0 0 16px;color:${TEXT_MUTED};">Assine agora e continue usando escalas com IA, player de multitracks e muito mais:</p>
    ${btn("Ver planos disponíveis", data.appUrl + "/planos")}
  `;
  return {
    subject: `🔔 ${data.groupName} — Sua assinatura precisa de atenção`,
    html: baseLayout(content, data.groupName),
  };
}

export function noGroupUserEmail(data: {
  userName: string;
  email: string;
  appUrl: string;
}): { subject: string; html: string } {
  const content = `
    <p style="margin:0 0 16px;font-size:16px;font-weight:700;color:${TEXT};">Olá, ${data.userName}!</p>
    <p style="margin:0 0 16px;color:${TEXT_MUTED};">
      Você criou uma conta no Líder Web mas ainda não está vinculado a nenhum ministério.
    </p>
    <p style="margin:0 0 8px;color:${TEXT_MUTED};">Você tem duas opções:</p>
    <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:20px;">
      <tr><td style="padding:8px 0;border-bottom:1px solid ${BORDER};">📩 <strong>Peça um convite</strong> ao líder do seu ministério para te adicionar</td></tr>
      <tr><td style="padding:8px 0;">🏛️ <strong>Cadastre seu ministério</strong> e comece a usar gratuitamente</td></tr>
    </table>
    ${btn("Acessar minha conta", data.appUrl + "/sem-grupo")}
  `;
  return {
    subject: `👋 ${data.userName}, complete seu cadastro no Líder Web`,
    html: baseLayout(content, "Líder Web"),
  };
}

export function campaignEmail(data: {
  subject: string;
  htmlBody: string;
  groupName: string;
  recipientName: string;
  appUrl: string;
}): { subject: string; html: string } {
  // Substituir variáveis no corpo da campanha
  const processedBody = data.htmlBody
    .replace(/\{\{nome\}\}/gi, data.recipientName)
    .replace(/\{\{ministerio\}\}/gi, data.groupName)
    .replace(/\{\{app_url\}\}/gi, data.appUrl);

  return {
    subject: data.subject
      .replace(/\{\{nome\}\}/gi, data.recipientName)
      .replace(/\{\{ministerio\}\}/gi, data.groupName),
    html: baseLayout(processedBody, data.groupName),
  };
}

// ─── Templates de Trial ───────────────────────────────────────────────────────

export function trialDay1Email(data: {
  adminName: string;
  groupName: string;
  appUrl: string;
}): { subject: string; html: string } {
  const content = `
    <p style="margin:0 0 16px;font-size:16px;font-weight:700;color:${TEXT};">Olá, ${data.adminName}! Vamos começar? 🚀</p>
    <p style="margin:0 0 16px;color:${TEXT_MUTED};">Seu trial de 7 dias do <strong>Líder Web</strong> acabou de começar. Aqui está o que você pode fazer agora mesmo:</p>
    <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:20px;">
      <tr><td style="padding:10px 0;border-bottom:1px solid ${BORDER};">
        <strong style="color:${TEXT};">1. Cadastre seu repertório</strong>
        <p style="margin:4px 0 0;color:${TEXT_MUTED};font-size:14px;">Adicione músicas com cifras, tons e BPM. A IA vai usar isso para sugerir setlists.</p>
      </td></tr>
      <tr><td style="padding:10px 0;border-bottom:1px solid ${BORDER};">
        <strong style="color:${TEXT};">2. Convide sua equipe</strong>
        <p style="margin:4px 0 0;color:${TEXT_MUTED};font-size:14px;">Adicione músicos, vocalistas e instrumentistas com funções específicas.</p>
      </td></tr>
      <tr><td style="padding:10px 0;">
        <strong style="color:${TEXT};">3. Gere sua primeira escala com IA</strong>
        <p style="margin:4px 0 0;color:${TEXT_MUTED};font-size:14px;">Com repertório e membros cadastrados, a IA monta escalas completas em segundos.</p>
      </td></tr>
    </table>
    ${btn("Começar agora", data.appUrl + "/dashboard")}
  `;
  return {
    subject: `🚀 Seu trial começou! Primeiros passos no Líder Web`,
    html: baseLayout(content, data.groupName),
  };
}

export function trialDay3Email(data: {
  adminName: string;
  groupName: string;
  appUrl: string;
}): { subject: string; html: string } {
  const content = `
    <p style="margin:0 0 16px;font-size:16px;font-weight:700;color:${TEXT};">Olá, ${data.adminName}! Já testou a IA? 🤖</p>
    <p style="margin:0 0 16px;color:${TEXT_MUTED};">Você está no <strong>3º dia do seu trial</strong>. A funcionalidade que mais impressiona nossos clientes é a geração de escalas com IA.</p>
    <div style="background:linear-gradient(135deg,#7c3aed,#4f46e5);border-radius:12px;padding:20px;margin-bottom:20px;">
      <p style="margin:0 0 8px;color:#fff;font-weight:700;font-size:15px;">✨ Wizard de Escalas com IA</p>
      <p style="margin:0 0 12px;color:rgba(255,255,255,0.8);font-size:14px;">Selecione o template do culto, escolha a estratégia de músicas e a IA monta escalas completas com membros, funções e setlist — tudo de uma vez.</p>
      <a href="${data.appUrl}/schedules" style="display:inline-block;background:#fff;color:#7c3aed;text-decoration:none;padding:8px 20px;border-radius:8px;font-size:14px;font-weight:700;">Experimentar agora →</a>
    </div>
    <p style="margin:0;color:${TEXT_MUTED};font-size:14px;">Restam ainda 4 dias de trial. Aproveite!</p>
  `;
  return {
    subject: `🤖 Já gerou sua primeira escala com IA? (dia 3 do trial)`,
    html: baseLayout(content, data.groupName),
  };
}

export function trialDay6Email(data: {
  adminName: string;
  groupName: string;
  appUrl: string;
  daysLeft: number;
}): { subject: string; html: string } {
  const content = `
    <p style="margin:0 0 16px;font-size:16px;font-weight:700;color:${TEXT};">Olá, ${data.adminName}!</p>
    <div style="background:#fef3c7;border:1px solid #fbbf24;border-radius:8px;padding:16px;margin-bottom:16px;">
      <p style="margin:0;color:#92400e;font-weight:700;">⏰ Seu trial termina em ${data.daysLeft} dia${data.daysLeft !== 1 ? "s" : ""}!</p>
    </div>
    <p style="margin:0 0 16px;color:${TEXT_MUTED};">Não perca o acesso ao que você já configurou — repertório, membros, escalas e histórico ficam salvos quando você assinar.</p>
    <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:20px;">
      <tr><td style="padding:6px 0;color:${TEXT_MUTED};font-size:14px;">✅ Escalas com IA ilimitadas</td></tr>
      <tr><td style="padding:6px 0;color:${TEXT_MUTED};font-size:14px;">✅ Player de multitracks profissional</td></tr>
      <tr><td style="padding:6px 0;color:${TEXT_MUTED};font-size:14px;">✅ Gestão completa de membros e funções</td></tr>
      <tr><td style="padding:6px 0;color:${TEXT_MUTED};font-size:14px;">✅ Ensaios e presença online</td></tr>
    </table>
    ${btn("Assinar agora e continuar", data.appUrl + "/planos")}
    <p style="margin:16px 0 0;color:${TEXT_MUTED};font-size:13px;text-align:center;">Cancele quando quiser. Sem fidelidade.</p>
  `;
  return {
    subject: `⏰ Seu trial termina em ${data.daysLeft} dia${data.daysLeft !== 1 ? "s" : ""} — assine para continuar`,
    html: baseLayout(content, data.groupName),
  };
}
