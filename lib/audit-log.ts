import { AuditEntityType, Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

export const AUDIT_ACTIONS = {
  LOGIN_SUCCESS: "LOGIN_SUCCESS",
  LOGIN_FAILED: "LOGIN_FAILED",
  LOGOUT: "LOGOUT",
  PROFILE_UPDATED: "PROFILE_UPDATED",
  PASSWORD_CHANGED: "PASSWORD_CHANGED",
  USER_CREATED: "USER_CREATED",
  USER_UPDATED: "USER_UPDATED",
  USER_DELETED: "USER_DELETED",
  USER_ROLE_CHANGED: "USER_ROLE_CHANGED",
  USER_GROUP_CHANGED: "USER_GROUP_CHANGED",
  GROUP_CREATED: "GROUP_CREATED",
  GROUP_UPDATED: "GROUP_UPDATED",
  GROUP_DELETED: "GROUP_DELETED",
  REHEARSAL_CREATED: "REHEARSAL_CREATED",
  REHEARSAL_UPDATED: "REHEARSAL_UPDATED",
  REHEARSAL_DELETED: "REHEARSAL_DELETED",
  REHEARSAL_ATTENDANCE_UPDATED: "REHEARSAL_ATTENDANCE_UPDATED",
  SCALE_CREATED: "SCALE_CREATED",
  SCALE_UPDATED: "SCALE_UPDATED",
  SCALE_DELETED: "SCALE_DELETED",
  SCALE_CONFIRMED: "SCALE_CONFIRMED",
  SCALE_DECLINED: "SCALE_DECLINED",
  SONG_CREATED: "SONG_CREATED",
  SONG_UPDATED: "SONG_UPDATED",
  SONG_DELETED: "SONG_DELETED",
  SUBSCRIPTION_UPDATED: "SUBSCRIPTION_UPDATED",
  SUBSCRIPTION_COUPON_APPLIED: "SUBSCRIPTION_COUPON_APPLIED",
  ANNOUNCEMENT_CREATED: "ANNOUNCEMENT_CREATED",
  ANNOUNCEMENT_UPDATED: "ANNOUNCEMENT_UPDATED",
  ANNOUNCEMENT_ACTIVATED: "ANNOUNCEMENT_ACTIVATED",
  ANNOUNCEMENT_DEACTIVATED: "ANNOUNCEMENT_DEACTIVATED",
  ANNOUNCEMENT_VIEWED: "ANNOUNCEMENT_VIEWED",
  // Professor IA (Music Coach)
  COACH_ENABLED: "COACH_ENABLED",
  COACH_DISABLED: "COACH_DISABLED",
  COACH_CONTENT_GENERATED: "COACH_CONTENT_GENERATED",
  COACH_PRACTICE_SUBMITTED: "COACH_PRACTICE_SUBMITTED",
  COACH_FEEDBACK_GENERATED: "COACH_FEEDBACK_GENERATED",
} as const;

const SENSITIVE_KEYS = [
  "password",
  "senha",
  "token",
  "secret",
  "hash",
  "authorization",
  "cookie",
  "accessToken",
  "refreshToken",
];

function maskSensitiveData(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;

  if (Array.isArray(value)) {
    return value.map((item) => maskSensitiveData(item));
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, keyValue]) => {
      const normalizedKey = key.toLowerCase();
      const isSensitive = SENSITIVE_KEYS.some((sensitive) => normalizedKey.includes(sensitive.toLowerCase()));

      if (isSensitive) return [key, "[REDACTED]"];
      return [key, maskSensitiveData(keyValue)];
    })
  );
}

function sanitizeIp(value: string | null | undefined): string | null {
  if (!value) return null;
  const first = value.split(",")[0]?.trim();
  return first || null;
}

export function extractRequestContext(req?: Request | NextRequest | null) {
  if (!req) return { ipAddress: null, userAgent: null };

  const forwarded = req.headers.get("x-forwarded-for");
  const realIp = req.headers.get("x-real-ip");
  const userAgent = req.headers.get("user-agent");

  return {
    ipAddress: sanitizeIp(forwarded ?? realIp),
    userAgent: userAgent ?? null,
  };
}

export interface LogUserActionInput {
  userId?: string | null;
  groupId?: string | null;
  action: string;
  entityType?: AuditEntityType;
  entityId?: string | null;
  entityName?: string | null;
  description: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Prisma.JsonValue;
  oldValues?: Prisma.JsonValue;
  newValues?: Prisma.JsonValue;
}

export async function logUserAction(input: LogUserActionInput) {
  try {
    // Validar FKs antes de salvar — evita constraint violations quando
    // userId/groupId são passados mas ainda não existem no banco
    let safeUserId = input.userId ?? null;
    let safeGroupId = input.groupId ?? null;

    if (safeUserId) {
      const exists = await prisma.user.findUnique({ where: { id: safeUserId }, select: { id: true } }).catch(() => null);
      if (!exists) safeUserId = null;
    }
    if (safeGroupId) {
      const exists = await prisma.group.findUnique({ where: { id: safeGroupId }, select: { id: true } }).catch(() => null);
      if (!exists) safeGroupId = null;
    }

    await prisma.auditLog.create({
      data: {
        userId: safeUserId,
        groupId: safeGroupId,
        action: input.action,
        entityType: input.entityType ?? AuditEntityType.OTHER,
        entityId: input.entityId ?? null,
        entityName: input.entityName ?? null,
        description: input.description,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        metadata: maskSensitiveData(input.metadata) as Prisma.InputJsonValue,
        oldValues: maskSensitiveData(input.oldValues) as Prisma.InputJsonValue,
        newValues: maskSensitiveData(input.newValues) as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    console.error("[audit] failed to persist log", error);
  }
}
