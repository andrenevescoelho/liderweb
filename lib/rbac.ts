import { AppRole, hasPermission } from "@/lib/authorization";

type RBACUser = {
  role?: AppRole | null;
  permissions?: string[] | null;
};

const normalizeRole = (role?: string | null): AppRole => {
  if (role === "SUPERADMIN" || role === "ADMIN" || role === "LEADER" || role === "MEMBER") {
    return role;
  }

  return "MEMBER";
};

export function can(user: RBACUser | null | undefined, permission: string) {
  if (!user) return false;

  return hasPermission(normalizeRole(user.role), permission, user.permissions ?? []);
}

export function canAny(user: RBACUser | null | undefined, permissions: string[]) {
  return permissions.some((permission) => can(user, permission));
}
