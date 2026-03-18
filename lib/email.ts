const GMAIL_DOMAINS = new Set(["gmail.com", "googlemail.com"]);

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizeEmailForComparison(email: string): string {
  const normalized = normalizeEmail(email);
  const [localPart, domain] = normalized.split("@");

  if (!localPart || !domain) {
    return normalized;
  }

  if (!GMAIL_DOMAINS.has(domain)) {
    return normalized;
  }

  const [withoutPlus] = localPart.split("+");
  const withoutDots = withoutPlus.replace(/\./g, "");

  return `${withoutDots}@gmail.com`;
}

export function emailsMatch(firstEmail: string, secondEmail: string): boolean {
  return normalizeEmailForComparison(firstEmail) === normalizeEmailForComparison(secondEmail);
}
