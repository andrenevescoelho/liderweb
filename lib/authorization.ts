export type AppRole = "SUPERADMIN" | "ADMIN" | "LEADER" | "MEMBER";

const DEFAULT_ROLE_PERMISSIONS: Record<AppRole, string[]> = {
  SUPERADMIN: ["*"],
  ADMIN: ["member.manage", "permission.manage", "leadership.manage", "schedule.create", "schedule.edit", "schedule.delete", "song.delete", "report.group.access", "subscription.manage"],
  LEADER: ["member.manage", "schedule.create", "schedule.edit", "report.group.access"],
  MEMBER: ["profile.self.edit", "schedule.future.view", "schedule.presence.confirm.self"],
};

const hasWildcard = (permissions: string[]) => permissions.includes("*");

export function hasPermission(
  role: AppRole,
  requestedPermission: string,
  customPermissions?: string[] | null
) {
  const basePermissions = DEFAULT_ROLE_PERMISSIONS[role] ?? [];
  const merged = [...basePermissions, ...(customPermissions ?? [])];

  return (
    hasWildcard(merged) ||
    merged.includes(requestedPermission)
  );
}
