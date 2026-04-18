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
