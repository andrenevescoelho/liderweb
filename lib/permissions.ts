export type PermissionCategory =
  | "administrative"
  | "musical"
  | "schedule"
  | "reports"
  | "communication"
  | "technical"
  | "profile"
  | "strategic";

export interface PermissionDefinition {
  key: string;
  label: string;
  description?: string;
  category: PermissionCategory;
  premium?: boolean;
  future?: boolean;
}

export interface PermissionPreset {
  key: string;
  label: string;
  description: string;
  permissions: string[];
}

export const MINISTRY_MEMBER_FUNCTIONS = [
  "Ministro",
  "Vocal",
  "Músico",
  "Técnico",
] as const;

export const MINISTRY_LEADERSHIP_ROLES = [
  "Líder",
  "Vice-líder",
  "Coordenador",
] as const;

export const PERMISSIONS: PermissionDefinition[] = [
  { key: "member.manage", label: "Gerenciar membros", description: "Adicionar, editar e remover membros", category: "administrative" },
  { key: "member.function.assign", label: "Definir funções do membro", category: "administrative" },
  { key: "permission.manage", label: "Definir permissões internas", category: "administrative" },
  { key: "leadership.manage", label: "Gerenciar cargos de liderança", category: "administrative" },
  { key: "song.delete", label: "Excluir músicas", category: "administrative" },
  { key: "schedule.delete", label: "Excluir escalas", category: "administrative" },
  { key: "report.group.access", label: "Acessar relatórios do grupo", category: "administrative" },
  { key: "subscription.manage", label: "Gerenciar plano e assinatura", category: "administrative" },

  { key: "music.rehearsal.send", label: "Enviar música para ensaio", category: "musical" },
  { key: "music.submitted.edit", label: "Editar música enviada", category: "musical" },
  { key: "music.submitted.delete", label: "Excluir música enviada", category: "musical" },
  { key: "setlist.music.add", label: "Adicionar música à escala", category: "musical" },
  { key: "music.key.change", label: "Alterar tom da música", category: "musical" },
  { key: "music.arrangement.define", label: "Definir arranjo", category: "musical" },
  { key: "music.chart.upload", label: "Upload de cifra/partitura/guia", category: "musical" },
  { key: "music.multitrack.upload", label: "Upload de multitrack", category: "musical" },
  { key: "music.submitted.approve", label: "Aprovar música enviada por outro membro", category: "musical" },
  { key: "playlist.rehearsal.create", label: "Criar playlist de ensaio", category: "musical" },
  { key: "music.key.change.request", label: "Solicitar mudança de tom", category: "musical", future: true },
  { key: "music.repertoire.suggest", label: "Sugerir nova música para repertório oficial", category: "musical", future: true },

  { key: "schedule.create", label: "Criar escala", category: "schedule" },
  { key: "schedule.edit", label: "Editar escala", category: "schedule" },
  { key: "schedule.remove", label: "Excluir escala", category: "schedule" },
  { key: "schedule.presence.confirm.self", label: "Confirmar presença na escala", category: "schedule" },
  { key: "schedule.presence.confirm.others", label: "Confirmar presença de terceiros", category: "schedule" },
  { key: "schedule.lock", label: "Travar escala", category: "schedule" },
  { key: "schedule.future.view", label: "Visualizar escala futura", category: "schedule" },
  { key: "schedule.view.all", label: "Visualizar todas as escalas", description: "Permite ver todas as escalas do grupo, não apenas as escalas onde o membro está escalado", category: "schedule" },
  { key: "schedule.history.view", label: "Visualizar histórico completo", category: "schedule" },
  { key: "schedule.export", label: "Exportar escala", category: "schedule" },
  { key: "schedule.publish", label: "Publicar escala", category: "schedule" },

  { key: "report.participation.view", label: "Ver histórico de participação", category: "reports" },
  { key: "report.attendance.view", label: "Ver frequência do membro", category: "reports" },
  { key: "report.music.stats", label: "Ver estatísticas por música", category: "reports" },
  { key: "report.minister.stats", label: "Ver estatísticas por ministro", category: "reports" },
  { key: "report.export.csv", label: "Exportar dados (CSV)", category: "reports" },
  { key: "report.music.ranking", label: "Ver ranking de músicas mais usadas", category: "reports" },
  { key: "report.technical.performance", label: "Ver performance técnica", category: "reports", future: true },

  { key: "communication.group.announce", label: "Enviar aviso para o grupo", category: "communication" },
  { key: "communication.schedule.announce", label: "Enviar aviso para escala atual", category: "communication" },
  { key: "communication.poll.create", label: "Criar enquete", category: "communication" },
  { key: "communication.prayer.create", label: "Criar pedido de oração", category: "communication" },
  { key: "communication.push.send", label: "Enviar notificação push", category: "communication" },
  { key: "communication.direct.send", label: "Enviar mensagem individual", category: "communication" },

  { key: "technical.multitrack.upload", label: "Upload de multitrack", category: "technical", premium: true },
  { key: "technical.multitrack.download", label: "Download de multitrack", category: "technical", premium: true },
  { key: "technical.playback.library.manage", label: "Gerenciar biblioteca de playback", category: "technical", premium: true },
  { key: "technical.multitrack.link", label: "Vincular música ao Multitrack Gospel", category: "technical", premium: true },
  { key: "technical.bpm.change", label: "Alterar BPM", category: "technical", premium: true },
  { key: "technical.guide.download", label: "Baixar guia individual", category: "technical", premium: true },

  { key: "profile.self.edit", label: "Editar próprio perfil", category: "profile" },
  { key: "profile.skills.edit", label: "Editar habilidades técnicas", category: "profile" },
  { key: "profile.availability.update", label: "Atualizar disponibilidade", category: "profile" },
  { key: "profile.days.define", label: "Definir dias disponíveis", category: "profile" },
  { key: "profile.comfortable.key.define", label: "Definir tonalidade confortável", category: "profile" },
  { key: "profile.instrument.primary.define", label: "Definir instrumento principal/secundário", category: "profile" },

  { key: "ministry.create", label: "Criar novos ministérios", category: "strategic" },
  { key: "ministry.leadership.transfer", label: "Transferir liderança", category: "strategic" },
  { key: "ministry.archive", label: "Arquivar ministério", category: "strategic" },
  { key: "integration.whatsapp", label: "Integrar com WhatsApp", category: "strategic" },
  { key: "integration.spotify.youtube", label: "Integrar com Spotify/YouTube", category: "strategic" },
  { key: "ai.module.access", label: "Acessar módulo IA", category: "strategic", future: true },
  { key: "permission.delegate.temporary", label: "Delegar função temporária", category: "strategic" },
];

export const PERMISSION_CATEGORIES: Record<PermissionCategory, string> = {
  administrative: "Permissões Administrativas",
  musical: "Permissões Musicais",
  schedule: "Permissões de Escala",
  reports: "Permissões de Relatórios e Dados",
  communication: "Permissões de Comunicação",
  technical: "Permissões Técnicas",
  profile: "Permissões de Perfil do Membro",
  strategic: "Permissões Estratégicas",
};

const allKeys = PERMISSIONS.map((permission) => permission.key);
const managerKeys = allKeys.filter(
  (key) => !key.includes("superadmin") && !key.startsWith("ministry.")
);

export const PERMISSION_PRESETS: PermissionPreset[] = [
  { key: "SUPER_ADMIN_IGREJA", label: "👑 Super Admin Igreja", description: "Acesso total de governança da igreja e ministérios.", permissions: allKeys },
  { key: "LIDER_MINISTERIO", label: "🎯 Líder de Ministério", description: "Gestão completa do ministério e time local.", permissions: managerKeys },
  { key: "COORDENADOR_MUSICAL", label: "🎼 Coordenador Musical", description: "Foco em repertório, arranjos, escalas e ensaios.", permissions: PERMISSIONS.filter((p) => ["musical", "schedule", "communication", "reports"].includes(p.category)).map((p) => p.key) },
  { key: "MINISTRO", label: "🎙 Ministro", description: "Atuação vocal e apoio de ensaio, sem gestão administrativa.", permissions: PERMISSIONS.filter((p) => ["musical", "schedule", "profile", "communication"].includes(p.category) && !p.key.includes("manage") && !p.key.includes("delete") && !p.key.includes("remove")).map((p) => p.key) },
  { key: "MUSICO", label: "🎹 Músico", description: "Participação em escalas e colaboração em ensaios.", permissions: ["music.rehearsal.send", "setlist.music.add", "music.key.change.request", "schedule.presence.confirm.self", "schedule.future.view", "schedule.history.view", "profile.self.edit", "profile.skills.edit", "profile.availability.update", "profile.days.define", "profile.instrument.primary.define", "communication.direct.send"] },
  { key: "MEMBRO", label: "🙋 Membro", description: "Permissões básicas de participação.", permissions: ["schedule.presence.confirm.self", "schedule.future.view", "profile.self.edit", "profile.availability.update", "communication.direct.send"] },
  { key: "VISUALIZADOR", label: "👀 Visualizador", description: "Somente visualização de agenda e histórico.", permissions: ["schedule.future.view", "schedule.history.view"] },
];

export const getPermissionPreset = (presetKey: string) =>
  PERMISSION_PRESETS.find((preset) => preset.key === presetKey);
