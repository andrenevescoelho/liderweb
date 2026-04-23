export type AppRole = "SUPERADMIN" | "ADMIN" | "LEADER" | "MEMBER";

const REHEARSAL_MANAGE_IMPLIED_PERMISSIONS = [
  "rehearsal.view",
  "rehearsal.create",
  "rehearsal.edit",
  "rehearsal.delete",
  "rehearsal.publish",
  "rehearsal.reminder",
];

const DEFAULT_ROLE_PERMISSIONS: Record<AppRole, string[]> = {
  SUPERADMIN: ["*"],

  ADMIN: [
    // Administrativo
    "member.manage",
    "member.view",
    "permission.manage",
    "leadership.manage",
    "subscription.manage",
    "song.delete",
    "report.group.access",
    "report.minister.stats",

    // Musical
    "music.rehearsal.send",
    "music.manage",
    "music.view",

    // Escalas
    "schedule.presence.confirm.self",
    "schedule.create",
    "schedule.edit",
    "schedule.delete",
    "schedule.view.all",

    // Ensaios
    "rehearsal.view",
    "rehearsal.manage",
    "rehearsal.attendance",

    // Comunicação
    "communication.schedule.announce",

    // Técnico / Premium
    "multitrack.view",
    "multitrack.rent",
    "split.view",
    "pad.view",
    "custom.mix.view",
  ],

  LEADER: [
    // Administrativo
    "member.manage",
    "member.view",
    "report.group.access",

    // Musical
    "music.rehearsal.send",
    "music.view",

    // Escalas
    "schedule.presence.confirm.self",
    "schedule.create",
    "schedule.edit",
    "schedule.view.all",

    // Ensaios
    "rehearsal.view",
    "rehearsal.attendance",

    // Comunicação
    "communication.schedule.announce",

    // Técnico / Premium
    "multitrack.view",
    "multitrack.rent",
    "split.view",
    "pad.view",
    "custom.mix.view",
  ],

  MEMBER: [
    "profile.self.edit",
    "schedule.future.view",
    "schedule.presence.confirm.self",
    "rehearsal.view",
    "rehearsal.attendance",
  ],
};

const hasWildcard = (permissions: string[]) => permissions.includes("*");

export function hasPermission(
  role: AppRole,
  requestedPermission: string,
  customPermissions?: string[] | null
) {
  const basePermissions = DEFAULT_ROLE_PERMISSIONS[role] ?? [];
  const merged = [...basePermissions, ...(customPermissions ?? [])];

  if (merged.includes("rehearsal.manage") && REHEARSAL_MANAGE_IMPLIED_PERMISSIONS.includes(requestedPermission)) {
    return true;
  }

  return (
    hasWildcard(merged) ||
    merged.includes(requestedPermission)
  );
}
