#!/usr/bin/env node
/**
 * SCRIPT DE IMPORTAÇÃO DE MULTITRACKS DO GOOGLE DRIVE
 * =====================================================
 * Uso:
 *   node scripts/import-multitracks.mjs <FOLDER_ID_OU_URL> [--dry-run] [--skip-existing]
 *
 * Exemplos:
 *   node scripts/import-multitracks.mjs https://drive.google.com/drive/folders/ABC123
 *   node scripts/import-multitracks.mjs ABC123 --dry-run
 *   node scripts/import-multitracks.mjs ABC123 --skip-existing
 *
 * Pré-requisitos:
 *   - Variável GOOGLE_API_KEY no .env (Google Drive API Key)
 *   - Variáveis AWS_* e DATABASE_URL no .env
 *   - npm install @aws-sdk/client-s3 adm-zip @prisma/client dotenv
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import https from "https";
import http from "http";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import AdmZip from "adm-zip";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ── Config ────────────────────────────────────────────────────────────────────
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const BUCKET_NAME    = process.env.AWS_BUCKET_NAME ?? "";
const FOLDER_PREFIX  = process.env.AWS_FOLDER_PREFIX ?? "";
const DRY_RUN        = process.argv.includes("--dry-run");
const SKIP_EXISTING  = process.argv.includes("--skip-existing");

const s3 = new S3Client({
  region: process.env.AWS_REGION ?? "auto",
  endpoint: process.env.S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "",
  },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const STEM_NAME_MAP = {
  AG: "Acoustic Guitar", BASS_SYNTH: "Bass Synth", BASS: "Bass",
  CLICK: "Click", DRUMS: "Drums", GUIA: "Guia", KEYBOARD: "Keyboard",
  KEYS_PAD: "Keys Pad", KEYS_SYNTH_1: "Keys Synth 1", KEYS_SYNTH: "Keys Synth",
  KEYS: "Keys", KEY_PIANO: "Key Piano", LOOP: "Loop", VOCALS: "Vocals",
  PAD: "Pad", STRINGS: "Strings", PIANO: "Piano", GUITAR: "Guitar",
};

function cleanStemName(filename) {
  const base = filename
    .replace(/\.(wav|mp3|aiff|flac)$/i, "")
    .replace(/_multitrackgospel\.com(_\d+)?$/i, "")
    .replace(/multitrackgospel\.com/i, "")
    .trim().replace(/_+$/, "");
  const normalized = base.toUpperCase().replace(/[\s-]+/g, "_");
  for (const [key, label] of Object.entries(STEM_NAME_MAP)) {
    if (normalized === key || normalized.startsWith(key + "_")) return label;
  }
  return base.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function extractBpmFromFilename(filename) {
  const match = filename.match(/CLICK[_\s]+(\d+)/i);
  return match ? parseInt(match[1]) : null;
}

function parseFilename(name) {
  const clean = name.replace(/\.(zip|rar|7z)$/i, "").trim();
  const parts = clean.split(/\s*-\s*/).map(p => p.trim()).filter(Boolean);
  let title = null, artist = null, bpm = null, musicalKey = null;
  const meaningful = [];

  for (const part of parts) {
    if (/^(\d{2,3})\s*[Bb][Pp][Mm]$/.test(part)) { bpm = parseInt(part); continue; }
    if (/^([A-G][b#]?m?)$/.test(part)) { musicalKey = part; continue; }
    meaningful.push(part);
  }

  if (meaningful.length >= 2) { artist = meaningful[0]; title = meaningful[1]; }
  else if (meaningful.length === 1) { title = meaningful[0]; }

  return { title, artist, bpm, musicalKey };
}

function extractFolderId(input) {
  const match = input.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : input;
}

function normalize(str) {
  return (str ?? "").toLowerCase().trim()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
}

function isSimilar(a, b) {
  return normalize(a) === normalize(b);
}

async function httpGet(url) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith("https") ? https : http;
    proto.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return httpGet(res.headers.location).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    }).on("error", reject);
  });
}

async function listDriveFolder(folderId) {
  if (!GOOGLE_API_KEY) {
    throw new Error("GOOGLE_API_KEY não configurada no .env");
  }
  const url = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+trashed=false&fields=files(id,name,mimeType,size)&key=${GOOGLE_API_KEY}&pageSize=1000`;
  const buf = await httpGet(url);
  const data = JSON.parse(buf.toString());
  if (data.error) throw new Error(`Google Drive API: ${data.error.message}`);
  return data.files ?? [];
}

async function downloadZip(fileId) {
  // Tenta download direto; se > 25MB o Drive pede confirmação
  const directUrl = `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`;
  console.log(`  ⬇  Baixando...`);
  return await httpGet(directUrl);
}

async function processAndUploadZip(zipBuffer, albumId) {
  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries().filter(e =>
    !e.isDirectory && /\.(wav|mp3|aiff|flac)$/i.test(e.name) &&
    !e.name.includes("__MACOSX")
  );

  const stems = [];
  let detectedBpm = null;

  for (const entry of entries) {
    const stemName = cleanStemName(entry.name);
    const bpmFromName = extractBpmFromFilename(entry.name);
    if (bpmFromName && !detectedBpm) detectedBpm = bpmFromName;

    const ext = path.extname(entry.name).toLowerCase();
    const r2Key = `${FOLDER_PREFIX}multitracks/${albumId}/${stemName.replace(/\s+/g, "_")}${ext}`;

    if (!DRY_RUN) {
      const data = entry.getData();
      await s3.send(new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: r2Key,
        Body: data,
        ContentType: ext === ".mp3" ? "audio/mpeg" : "audio/wav",
      }));
    }

    stems.push({ name: stemName, r2Key });
    console.log(`    ✓ ${stemName} → ${r2Key}`);
  }

  return { stems, detectedBpm };
}

// ── Checagem de duplicatas ────────────────────────────────────────────────────

async function findDuplicate(title, artist) {
  const existing = await prisma.multitracksAlbum.findMany({
    select: { id: true, title: true, artist: true, status: true },
  });

  return existing.find(a =>
    isSimilar(a.title, title) && isSimilar(a.artist, artist)
  ) ?? null;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const input = process.argv[2];
  if (!input) {
    console.error("Uso: node scripts/import-multitracks.mjs <FOLDER_ID_OU_URL> [--dry-run] [--skip-existing]");
    process.exit(1);
  }

  const folderId = extractFolderId(input);
  console.log(`\n🎵 Importação de Multitracks`);
  console.log(`📁 Pasta: ${folderId}`);
  if (DRY_RUN) console.log(`🔍 MODO DRY-RUN — nenhum dado será gravado`);
  console.log(`─────────────────────────────────────────\n`);

  // Listar arquivos da pasta
  console.log("Listando arquivos do Google Drive...");
  let files;
  try {
    files = await listDriveFolder(folderId);
  } catch (err) {
    console.error(`❌ Erro ao listar pasta: ${err.message}`);
    process.exit(1);
  }

  const zips = files.filter(f => /\.zip$/i.test(f.name));
  console.log(`Encontrados: ${files.length} arquivos, ${zips.length} ZIPs\n`);

  if (zips.length === 0) {
    console.log("Nenhum ZIP encontrado. Verifique o ID da pasta.");
    process.exit(0);
  }

  // Relatório final
  const report = { imported: [], skipped: [], errors: [] };

  for (const file of zips) {
    console.log(`📦 ${file.name}`);
    const { title, artist, bpm, musicalKey } = parseFilename(file.name);

    if (!title || !artist) {
      console.log(`  ⚠  Nome não reconhecido — esperado "Artista - Título - BPM - Tom.zip"\n`);
      report.errors.push({ file: file.name, reason: "Nome não reconhecido" });
      continue;
    }

    console.log(`  🎤 ${artist} — ${title}${bpm ? ` @ ${bpm}BPM` : ""}${musicalKey ? ` (${musicalKey})` : ""}`);

    // Verificar duplicata
    const duplicate = await findDuplicate(title, artist);
    if (duplicate) {
      if (SKIP_EXISTING) {
        console.log(`  ⏭  Já existe (id: ${duplicate.id}, status: ${duplicate.status}) — pulando\n`);
        report.skipped.push({ file: file.name, reason: `Já existe: ${duplicate.title} - ${duplicate.artist}` });
        continue;
      } else {
        console.log(`  ⚠  Já existe (id: ${duplicate.id}) — use --skip-existing para pular automaticamente`);
        console.log(`  ⏭  Pulando\n`);
        report.skipped.push({ file: file.name, reason: "Duplicata detectada" });
        continue;
      }
    }

    try {
      // Baixar ZIP
      const zipBuffer = await downloadZip(file.id);
      console.log(`  📥 ${Math.round(zipBuffer.length / 1024 / 1024 * 10) / 10} MB`);

      // Criar álbum no banco
      let albumId = `import_${Date.now()}`;
      if (!DRY_RUN) {
        const album = await prisma.multitracksAlbum.create({
          data: {
            title,
            artist,
            bpm: bpm ?? null,
            musicalKey: musicalKey ?? null,
            stems: [],
            status: "PENDING",
            isActive: true,
          },
        });
        albumId = album.id;
        console.log(`  🆔 Álbum criado: ${albumId}`);
      } else {
        console.log(`  🆔 [DRY-RUN] Criaria álbum: ${title} - ${artist}`);
      }

      // Processar ZIP e fazer upload dos stems
      const { stems, detectedBpm } = await processAndUploadZip(zipBuffer, albumId);

      // Atualizar álbum com stems
      if (!DRY_RUN && stems.length > 0) {
        await prisma.multitracksAlbum.update({
          where: { id: albumId },
          data: {
            stems,
            status: "READY",
            bpm: bpm ?? detectedBpm ?? null,
          },
        });
        console.log(`  ✅ ${stems.length} stems importados — status: READY\n`);
      } else {
        console.log(`  ✅ [DRY-RUN] ${stems.length} stems seriam importados\n`);
      }

      report.imported.push({ file: file.name, title, artist, stems: stems.length });

    } catch (err) {
      console.error(`  ❌ Erro: ${err.message}\n`);
      report.errors.push({ file: file.name, reason: err.message });
    }
  }

  // Relatório final
  console.log(`\n═══════════════════════════════════════════`);
  console.log(`📊 RELATÓRIO FINAL`);
  console.log(`═══════════════════════════════════════════`);
  console.log(`✅ Importados:  ${report.imported.length}`);
  console.log(`⏭  Pulados:     ${report.skipped.length}`);
  console.log(`❌ Erros:       ${report.errors.length}`);

  if (report.imported.length > 0) {
    console.log(`\nImportados:`);
    report.imported.forEach(r => console.log(`  • ${r.artist} - ${r.title} (${r.stems} stems)`));
  }
  if (report.skipped.length > 0) {
    console.log(`\nPulados:`);
    report.skipped.forEach(r => console.log(`  • ${r.file} — ${r.reason}`));
  }
  if (report.errors.length > 0) {
    console.log(`\nErros:`);
    report.errors.forEach(r => console.log(`  • ${r.file} — ${r.reason}`));
  }

  // Salvar relatório em arquivo
  const reportPath = `import-report-${new Date().toISOString().slice(0,19).replace(/:/g,"-")}.json`;
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📄 Relatório salvo: ${reportPath}\n`);

  await prisma.$disconnect();
}

main().catch(err => {
  console.error("Erro fatal:", err);
  prisma.$disconnect();
  process.exit(1);
});
