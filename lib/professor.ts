// lib/professor.ts
// Utilitários auxiliares do módulo Professor (Music Coach)
// Os modelos principais estão em MusicCoachProfile, PracticeSubmission, etc.

export const PROFESSOR_ALLOWED_MIME_TYPES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/m4a",
  "audio/mp4",
  "audio/webm",
  "audio/ogg",
];

export const PROFESSOR_ALLOWED_EXTENSIONS = ["mp3", "wav", "m4a", "webm", "ogg"];
export const PROFESSOR_MAX_FILE_SIZE = 20 * 1024 * 1024;

export function sanitizeFileName(fileName: string) {
  return fileName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
}
