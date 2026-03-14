import { AuditEntityType, ImportMode, Prisma, Role, VoiceType } from "@prisma/client";
import { parse } from "csv/sync";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { logUserAction } from "@/lib/audit-log";
import { INSTRUMENTS, SessionUser, SONG_TAGS } from "@/lib/types";

type ImportTarget = "members" | "songs";

const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024;
const MAX_ROWS = 2000;

const MEMBER_HEADERS = [
  "nome",
  "email",
  "telefone",
  "funcao_principal",
  "instrumento",
  "voz",
  "status",
  "role",
  "observacoes",
] as const;

const SONG_HEADERS = [
  "titulo",
  "tom",
  "bpm",
  "cantor_artista",
  "compositor",
  "categoria",
  "idioma",
  "cifra",
  "link_da_cifra",
  "link_playback",
  "link_referencia",
  "observacoes",
] as const;

const VALID_KEYS = new Set([
  "C", "C#", "Db", "D", "D#", "Eb", "E", "F", "F#", "Gb", "G", "G#", "Ab", "A", "A#", "Bb", "B",
  "Cm", "C#m", "Dm", "D#m", "Ebm", "Em", "Fm", "F#m", "Gm", "G#m", "Am", "A#m", "Bbm", "Bm",
]);

const ROLE_INPUT_MAP: Record<string, Role> = {
  superadmin: "SUPERADMIN",
  admin: "ADMIN",
  leader: "LEADER",
  member: "MEMBER",
};

const VOICE_INPUT_MAP: Record<string, VoiceType> = {
  soprano: "SOPRANO",
  alto: "ALTO",
  tenor: "TENOR",
  lead: "LEAD",
};

export type CsvImportMode = "validate" | "create" | "create_or_update";

export interface ImportPreviewRow {
  line: number;
  raw: Record<string, string>;
  normalized: Record<string, unknown>;
  valid: boolean;
  warnings: string[];
  errors: string[];
}

interface CsvPreviewResult {
  importType: ImportTarget;
  mode: CsvImportMode;
  filename: string;
  headers: string[];
  unknownHeaders: string[];
  missingRequiredHeaders: string[];
  totalRows: number;
  validRows: number;
  errorRows: number;
  warningRows: number;
  rows: ImportPreviewRow[];
}

interface ImportScope {
  groupId: string | null;
  role: Role;
  canDefineRole: boolean;
}

function normalizeHeader(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function parseBoolStatus(value?: string): boolean {
  const normalized = (value ?? "").trim().toLowerCase();
  return !(normalized === "inativo" || normalized === "false" || normalized === "0" || normalized === "nao" || normalized === "não");
}

function sanitizeMultiline(value?: string): string | null {
  if (!value) return null;
  const normalized = value.replace(/\0/g, "").trim();
  return normalized || null;
}

function toImportMode(mode: CsvImportMode): ImportMode {
  if (mode === "validate") return "VALIDATE_ONLY";
  if (mode === "create") return "CREATE_ONLY";
  return "CREATE_OR_UPDATE";
}

function isValidUrl(value?: string): boolean {
  if (!value) return true;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function getCsvTemplate(importType: ImportTarget) {
  if (importType === "members") {
    return {
      filename: "modelo-importacao-membros.csv",
      content: `${MEMBER_HEADERS.join(",")}\nNome Exemplo,membro@igreja.com,(11) 99999-9999,Ministro,Teclado,SOPRANO,ativo,MEMBER,Importado via CSV\n`,
    };
  }

  return {
    filename: "modelo-importacao-musicas.csv",
    content: `${SONG_HEADERS.join(",")}\nGrande e o Senhor,C,72,Diante do Trono,,Adoração,pt-BR,"[Intro] C G Am F",https://www.cifraclub.com.br/exemplo,https://exemplo.com/playback.mp3,https://youtube.com/watch?v=dQw4w9WgXcQ,Importado via CSV\n`,
  };
}

export async function resolveImportScope(user: SessionUser): Promise<ImportScope> {
  if (user.role === "SUPERADMIN") {
    return {
      groupId: user.groupId ?? null,
      role: user.role,
      canDefineRole: true,
    };
  }

  if (user.role !== "ADMIN" || !user.groupId) {
    throw new Error("Sem permissão para importar CSV");
  }

  return {
    groupId: user.groupId,
    role: user.role,
    canDefineRole: false,
  };
}

export function validateCsvFile(file: File) {
  if (!file.name.toLowerCase().endsWith(".csv")) {
    throw new Error("Formato inválido. Envie um arquivo .csv");
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error("Arquivo excede o limite de 2MB");
  }
}

export async function previewCsvImport(params: {
  file: File;
  importType: ImportTarget;
  mode: CsvImportMode;
  user: SessionUser;
}): Promise<CsvPreviewResult> {
  const { file, importType, mode, user } = params;

  validateCsvFile(file);
  const scope = await resolveImportScope(user);
  const buffer = Buffer.from(await file.arrayBuffer());
  const content = buffer.toString("utf8").replace(/^\uFEFF/, "");

  const records = parse(content, {
    bom: true,
    columns: true,
    delimiter: [",", ";"],
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  }) as Record<string, string>[];

  if (records.length > MAX_ROWS) {
    throw new Error(`Limite de ${MAX_ROWS} linhas por importação excedido`);
  }

  const headers = Object.keys(records[0] ?? {}).map((header) => normalizeHeader(header));
  const allowedHeaders = importType === "members" ? MEMBER_HEADERS : SONG_HEADERS;
  const missingRequiredHeaders = (importType === "members" ? ["nome"] : ["titulo"]).filter((header) => !headers.includes(header));
  const unknownHeaders = headers.filter((header) => !allowedHeaders.includes(header as any));

  const rows: ImportPreviewRow[] = records.map((rawRecord, index) => {
    const normalizedRaw = Object.fromEntries(
      Object.entries(rawRecord).map(([key, value]) => [normalizeHeader(key), (value ?? "").toString().trim()])
    );

    if (importType === "members") {
      return validateMemberRow(normalizedRaw, index + 2, scope);
    }

    return validateSongRow(normalizedRaw, index + 2);
  });

  const validRows = rows.filter((row) => row.valid).length;
  const errorRows = rows.filter((row) => row.errors.length > 0).length;
  const warningRows = rows.filter((row) => row.warnings.length > 0).length;

  return {
    importType,
    mode,
    filename: file.name,
    headers,
    unknownHeaders,
    missingRequiredHeaders,
    totalRows: rows.length,
    validRows,
    errorRows,
    warningRows,
    rows,
  };
}

function validateMemberRow(row: Record<string, string>, line: number, scope: ImportScope): ImportPreviewRow {
  const errors: string[] = [];
  const warnings: string[] = [];

  const name = row.nome?.trim();
  const email = row.email?.trim().toLowerCase();
  const phone = row.telefone?.trim() || null;
  const memberFunction = row.funcao_principal?.trim() || null;
  const instrument = row.instrumento?.trim() || null;
  const voiceInput = row.voz?.trim().toLowerCase();
  const statusInput = row.status?.trim();
  const roleInput = row.role?.trim().toLowerCase();
  const notes = sanitizeMultiline(row.observacoes);

  if (!name) errors.push("nome obrigatório");

  if (email) {
    const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!isValidEmail) errors.push("email inválido");
  }

  if (instrument && !INSTRUMENTS.includes(instrument as any)) {
    warnings.push(`instrumento não padronizado: ${instrument}`);
  }

  let voiceType: VoiceType | null = null;
  if (voiceInput) {
    voiceType = VOICE_INPUT_MAP[voiceInput] ?? null;
    if (!voiceType) errors.push("voz inválida (use SOPRANO, ALTO, TENOR ou LEAD)");
  }

  let role: Role | null = null;
  if (roleInput) {
    role = ROLE_INPUT_MAP[roleInput] ?? null;
    if (!role) {
      errors.push("role inválida");
    } else if (!scope.canDefineRole) {
      errors.push("usuário sem permissão para definir role");
    } else if (role === "SUPERADMIN" && scope.role !== "SUPERADMIN") {
      errors.push("não é permitido promover para SUPERADMIN");
    }
  }

  return {
    line,
    raw: row,
    normalized: {
      name,
      email,
      phone,
      memberFunction,
      instruments: instrument ? [instrument] : [],
      voiceType,
      active: parseBoolStatus(statusInput),
      role: role ?? "MEMBER",
      notes,
    },
    valid: errors.length === 0,
    warnings,
    errors,
  };
}

function validateSongRow(row: Record<string, string>, line: number): ImportPreviewRow {
  const errors: string[] = [];
  const warnings: string[] = [];

  const title = row.titulo?.trim();
  const artist = row.cantor_artista?.trim() || null;
  const key = row.tom?.trim() || null;
  const bpmValue = row.bpm?.trim() || "";
  const category = row.categoria?.trim() || null;
  const language = row.idioma?.trim() || null;
  const chordPro = sanitizeMultiline(row.cifra);
  const chordUrl = row.link_da_cifra?.trim() || row.link_cifra?.trim() || null;
  const audioUrl = row.link_playback?.trim() || null;
  const youtubeUrl = row.link_referencia?.trim() || null;
  const notes = sanitizeMultiline(row.observacoes);

  if (!title) errors.push("título obrigatório");

  if (key && !VALID_KEYS.has(key)) {
    errors.push("tom inválido");
  }

  let bpm: number | null = null;
  if (bpmValue) {
    bpm = Number.parseInt(bpmValue, 10);
    if (Number.isNaN(bpm)) {
      errors.push("bpm deve ser numérico");
      bpm = null;
    }
  }

  if (!isValidUrl(chordUrl ?? undefined)) {
    errors.push("link da cifra inválido");
  }

  if (!isValidUrl(audioUrl ?? undefined)) {
    errors.push("link de playback inválido");
  }

  if (!isValidUrl(youtubeUrl ?? undefined)) {
    errors.push("link de referência inválido");
  }

  if (category && !SONG_TAGS.includes(category as any)) {
    warnings.push(`categoria fora da lista padrão: ${category}`);
  }

  return {
    line,
    raw: row,
    normalized: {
      title,
      artist,
      originalKey: key ?? "C",
      bpm,
      category,
      language,
      chordPro,
      chordUrl,
      audioUrl,
      youtubeUrl,
      notes,
      tags: category ? [category] : [],
    },
    valid: errors.length === 0,
    warnings,
    errors,
  };
}

export async function createImportJob(params: {
  preview: CsvPreviewResult;
  user: SessionUser;
  groupId?: string | null;
}): Promise<string> {
  const { preview, user, groupId = user.groupId ?? null } = params;

  const created = await prisma.importJob.create({
    data: {
      userId: user.id,
      groupId,
      importType: preview.importType === "members" ? "MEMBERS" : "SONGS",
      mode: toImportMode(preview.mode),
      filename: preview.filename,
      totalRows: preview.totalRows,
      successRows: preview.validRows,
      errorRows: preview.errorRows,
      status: "VALIDATED",
      summary: `Pré-validação concluída: ${preview.validRows}/${preview.totalRows} válidas`,
      detailsJson: preview as unknown as Prisma.InputJsonValue,
    },
  });

  return created.id;
}

export async function confirmImportJob(params: { jobId: string; user: SessionUser }) {
  const { jobId, user } = params;
  const job = await prisma.importJob.findUnique({ where: { id: jobId } });

  if (!job) throw new Error("Importação não encontrada");

  if (user.role !== "SUPERADMIN" && job.groupId !== user.groupId) {
    throw new Error("Sem permissão para confirmar esta importação");
  }

  const details = job.detailsJson as unknown as CsvPreviewResult;
  if (!details || !Array.isArray(details.rows)) {
    throw new Error("Detalhes da importação inválidos");
  }

  const validRows = details.rows.filter((row) => row.valid);

  const result =
    details.importType === "members"
      ? await persistMembersRows(validRows, job.mode, job.groupId)
      : await persistSongsRows(validRows, job.mode, job.groupId);

  await prisma.importJob.update({
    where: { id: job.id },
    data: {
      successRows: result.successRows,
      updatedRows: result.updatedRows,
      ignoredRows: result.ignoredRows,
      errorRows: details.errorRows,
      status: "COMPLETED",
      summary: `Processado ${details.totalRows} linhas, criadas ${result.successRows}, atualizadas ${result.updatedRows}, ignoradas ${result.ignoredRows}`,
      detailsJson: {
        ...details,
        final: result,
      } as Prisma.InputJsonValue,
    },
  });

  await logUserAction({
    userId: user.id,
    groupId: job.groupId,
    action: details.importType === "members" ? "CSV_IMPORT_MEMBERS_COMPLETED" : "CSV_IMPORT_SONGS_COMPLETED",
    entityType: AuditEntityType.IMPORT,
    entityId: job.id,
    entityName: details.importType,
    description: `${user.name} concluiu importação CSV de ${details.importType}`,
    metadata: {
      mode: job.mode,
      totalRows: details.totalRows,
      successRows: result.successRows,
      updatedRows: result.updatedRows,
      ignoredRows: result.ignoredRows,
      errorRows: details.errorRows,
    },
  });

  return {
    jobId: job.id,
    ...result,
    totalRows: details.totalRows,
    errorRows: details.errorRows,
  };
}

async function persistMembersRows(rows: ImportPreviewRow[], mode: ImportMode, groupId: string | null) {
  let successRows = 0;
  let updatedRows = 0;
  let ignoredRows = 0;

  for (const row of rows) {
    const normalized = row.normalized as any;
    const email = normalized.email || null;

    const existing = email
      ? await prisma.user.findUnique({ where: { email }, include: { profile: true } })
      : null;

    if (mode === "VALIDATE_ONLY") {
      ignoredRows += 1;
      continue;
    }

    if (existing) {
      if (mode === "CREATE_ONLY") {
        ignoredRows += 1;
        continue;
      }

      await prisma.user.update({
        where: { id: existing.id },
        data: {
          name: normalized.name,
          role: normalized.role,
          groupId: existing.groupId ?? groupId,
          profile: {
            upsert: {
              create: {
                phone: normalized.phone,
                memberFunction: normalized.memberFunction,
                instruments: normalized.instruments,
                voiceType: normalized.voiceType,
                active: normalized.active,
                bio: normalized.notes,
              },
              update: {
                phone: normalized.phone,
                memberFunction: normalized.memberFunction,
                instruments: normalized.instruments,
                voiceType: normalized.voiceType,
                active: normalized.active,
                bio: normalized.notes,
              },
            },
          },
        },
      });
      updatedRows += 1;
      continue;
    }

    const generatedPassword = await bcrypt.hash(`LiderWeb@${Date.now()}`, 10);

    await prisma.user.create({
      data: {
        name: normalized.name,
        email: email || `sem-email-${Date.now()}-${Math.random().toString(16).slice(2)}@placeholder.local`,
        password: generatedPassword,
        role: normalized.role,
        groupId,
        profile: {
          create: {
            phone: normalized.phone,
            memberFunction: normalized.memberFunction,
            instruments: normalized.instruments,
            voiceType: normalized.voiceType,
            active: normalized.active,
            bio: normalized.notes,
          },
        },
      },
    });

    successRows += 1;
  }

  return { successRows, updatedRows, ignoredRows };
}

async function persistSongsRows(rows: ImportPreviewRow[], mode: ImportMode, groupId: string | null) {
  let successRows = 0;
  let updatedRows = 0;
  let ignoredRows = 0;

  for (const row of rows) {
    const normalized = row.normalized as any;
    const title = normalized.title;
    const artist = normalized.artist;

    const existing = await prisma.song.findFirst({
      where: {
        groupId,
        title,
        artist,
      },
    });

    if (mode === "VALIDATE_ONLY") {
      ignoredRows += 1;
      continue;
    }

    if (existing) {
      if (mode === "CREATE_ONLY") {
        ignoredRows += 1;
        continue;
      }

      await prisma.song.update({
        where: { id: existing.id },
        data: {
          originalKey: normalized.originalKey,
          bpm: normalized.bpm,
          tags: normalized.tags,
          chordPro: normalized.chordPro,
          chordUrl: normalized.chordUrl,
          audioUrl: normalized.audioUrl,
          youtubeUrl: normalized.youtubeUrl,
        },
      });
      updatedRows += 1;
      continue;
    }

    await prisma.song.create({
      data: {
        title,
        artist,
        originalKey: normalized.originalKey,
        bpm: normalized.bpm,
        tags: normalized.tags,
        chordPro: normalized.chordPro,
        chordUrl: normalized.chordUrl,
        audioUrl: normalized.audioUrl,
        youtubeUrl: normalized.youtubeUrl,
        groupId,
      },
    });

    successRows += 1;
  }

  return { successRows, updatedRows, ignoredRows };
}

export async function logImportStarted(user: SessionUser, importType: ImportTarget, metadata: Record<string, unknown>) {
  await logUserAction({
    userId: user.id,
    groupId: user.groupId ?? null,
    action: importType === "members" ? "CSV_IMPORT_MEMBERS_STARTED" : "CSV_IMPORT_SONGS_STARTED",
    entityType: AuditEntityType.IMPORT,
    entityName: importType,
    description: `${user.name} iniciou pré-validação CSV de ${importType}`,
    metadata,
  });
}

export async function markImportFailed(user: SessionUser, importType: ImportTarget, reason: string, metadata?: Record<string, unknown>) {
  await logUserAction({
    userId: user.id,
    groupId: user.groupId ?? null,
    action: "CSV_IMPORT_FAILED",
    entityType: AuditEntityType.IMPORT,
    entityName: importType,
    description: `${user.name} falhou ao importar CSV de ${importType}: ${reason}`,
    metadata,
  });
}

export async function listImportHistory(user: SessionUser) {
  const where: Prisma.ImportJobWhereInput =
    user.role === "SUPERADMIN"
      ? {}
      : {
          groupId: user.groupId ?? undefined,
        };

  return prisma.importJob.findMany({
    where,
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      group: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}
