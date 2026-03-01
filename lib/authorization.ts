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
    "member.manage",
    "permission.manage",
    "leadership.manage",
    "schedule.create",
    "schedule.edit",
    "schedule.delete",
    "song.delete",
    "report.group.access",
    "subscription.manage",
    "rehearsal.view",
    "rehearsal.manage",
    "rehearsal.attendance",
  ],
  LEADER: [
    "member.manage",
    "schedule.create",
    "schedule.edit",
    "report.group.access",
    "rehearsal.view",
    "rehearsal.manage",
    "rehearsal.attendance",
  ],
  MEMBER: ["profile.self.edit", "schedule.future.view", "schedule.presence.confirm.self", "rehearsal.view", "rehearsal.attendance"],
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
