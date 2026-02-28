import { Role, VoiceType, InviteStatus, SubscriptionStatus } from "@prisma/client";

export type { Role, VoiceType, InviteStatus, SubscriptionStatus };

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  groupId?: string | null;
  permissions?: string[];
  hasActiveSubscription?: boolean;
  subscriptionStatus?: string | null;
}

export const INSTRUMENTS = [
  "Teclado",
  "Guitarra",
  "Violão",
  "Baixo",
  "Bateria",
  "Percussão",
  "Saxofone",
  "Flauta",
] as const;

export const VOICE_TYPES = ["SOPRANO", "ALTO", "TENOR", "LEAD"] as const;

export const SCHEDULE_ROLES = [
  "Vocal",
  "Ministro",
  "Violão",
  "Guitarra",
  "Baixo",
  "Bateria",
  "Teclado",
  "Piano",
  "Violino",
  "Flauta",
  "Gaita",
  "Percussão",
  "Sonoplasta",
  "Operador de projeção",
  "Saxofone",
] as const;

export const SONG_TAGS = [
  "Adoração",
  "Celebração",
  "Ceia",
  "Entrada",
  "Ofertório",
  "Encerramento",
  "Natal",
  "Páscoa",
] as const;

export const MUSICAL_KEYS = [
  "C", "C#", "Db", "D", "D#", "Eb", "E", "F",
  "F#", "Gb", "G", "G#", "Ab", "A", "A#", "Bb", "B",
  "Cm", "C#m", "Dm", "D#m", "Ebm", "Em", "Fm",
  "F#m", "Gm", "G#m", "Am", "A#m", "Bbm", "Bm",
] as const;

export const WEEKDAYS = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
] as const;
