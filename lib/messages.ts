import { Role } from "@prisma/client";

export const MAX_MESSAGE_LENGTH = 1000;
export const CHAT_RATE_LIMIT_WINDOW_MS = 10_000;
export const CHAT_RATE_LIMIT_MAX = 5;
export const BROADCAST_RATE_LIMIT_WINDOW_MS = 60_000;
export const BROADCAST_RATE_LIMIT_MAX = 2;

const rateLimitStore = new Map<string, number[]>();

export function sanitizeTextInput(value: unknown): string {
  if (typeof value !== "string") return "";

  return value
    .trim()
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ");
}

export function validateMessageContent(value: unknown): { valid: boolean; content?: string; error?: string } {
  const content = sanitizeTextInput(value);

  if (!content) {
    return { valid: false, error: "Mensagem não pode ser vazia" };
  }

  if (content.length > MAX_MESSAGE_LENGTH) {
    return { valid: false, error: `Mensagem deve ter no máximo ${MAX_MESSAGE_LENGTH} caracteres` };
  }

  return { valid: true, content };
}

export function isBroadcastSenderRole(role: Role | string | undefined): boolean {
  return role === "ADMIN" || role === "SUPERADMIN";
}

export function checkRateLimit(
  key: string,
  windowMs: number,
  maxRequests: number,
): { allowed: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  const timestamps = rateLimitStore.get(key) ?? [];
  const validTimestamps = timestamps.filter((ts) => now - ts < windowMs);

  if (validTimestamps.length >= maxRequests) {
    const retryAfterMs = windowMs - (now - validTimestamps[0]);
    return { allowed: false, retryAfterSeconds: Math.max(Math.ceil(retryAfterMs / 1000), 1) };
  }

  validTimestamps.push(now);
  rateLimitStore.set(key, validTimestamps);

  return { allowed: true };
}
