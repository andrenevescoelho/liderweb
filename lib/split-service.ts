// lib/split-service.ts
// Integração com lalal.ai + geração de metrônomo e guia TTS via Gemini

import { PutObjectCommand } from "@aws-sdk/client-s3";
import { createS3Client, getBucketConfig } from "./aws-config";

const LALAL_API = "https://www.lalal.ai/api/v1";
const LALAL_KEY = process.env.LALAL_API_KEY ?? "";

// ── Mapeamento de stems lalal.ai → nomes em PT-BR ─────────────────────────────
export const STEM_DISPLAY_NAMES: Record<string, string> = {
  vocals:           "Vocais",
  "vocals@0":       "Voz Principal",
  "vocals@1":       "Backing Vocals",
  drum:             "Bateria",
  bass:             "Baixo",
  piano:            "Piano",
  electric_guitar:  "Guitarra Elétrica",
  acoustic_guitar:  "Violão",
  synthesizer:      "Sintetizador",
  strings:          "Cordas",
  wind:             "Sopros",
  no_vocals:        "Instrumental (sem voz)",
  no_drum:          "Sem Bateria",
  no_bass:          "Sem Baixo",
};

// ── 1. Upload do arquivo para o lalal.ai ──────────────────────────────────────
export async function lalalUpload(fileBuffer: Buffer, fileName: string): Promise<string> {
  const res = await fetch(`${LALAL_API}/upload/`, {
    method: "POST",
    headers: {
      "X-License-Key": LALAL_KEY,
      "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
      "Content-Type": "application/octet-stream",
    },
    body: fileBuffer,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`lalal.ai upload falhou (${res.status}): ${err}`);
  }

  const data = await res.json();
  return data.id as string; // source_id
}

// ── 2. Iniciar separação de stems ─────────────────────────────────────────────
export type LalalStem = "vocals" | "drum" | "bass" | "piano" | "electric_guitar" | "acoustic_guitar" | "synthesizer" | "strings" | "wind";

// Mapeamento de stems para presets da API v1
const STEM_TO_PRESET: Record<string, string> = {
  vocals:          "vocals_and_instrumental",
  drum:            "drum_and_drumless",
  bass:            "bass_and_bassless",
  piano:           "piano_and_pianoless",
  electric_guitar: "electric_guitar_and_guitarless",
  acoustic_guitar: "acoustic_guitar_and_guitarless",
  synthesizer:     "synthesizer_and_synthless",
  strings:         "strings_and_stringsless",
  wind:            "wind_and_windless",
};

export async function lalalSplit(sourceId: string, stems: LalalStem[]): Promise<string[]> {
  const taskIds: string[] = [];

  for (const stem of stems) {
    const preset = STEM_TO_PRESET[stem];
    if (!preset) {
      console.warn(`[lalalSplit] preset desconhecido para stem ${stem}, pulando`);
      continue;
    }

    console.error("[lalalSplit debug] sourceId:", sourceId, "preset:", preset);
    // synthesizer, strings, wind só funcionam com phoenix
    const phoenixOnly = ["synthesizer", "strings", "wind"];
    const splitter = phoenixOnly.includes(stem) ? "phoenix" : "orion";

    const body: any = {
      source_id: sourceId,
      presets: {
        stem,
        splitter,
      },
    };

    // Para vocals, também separar lead/backing
    if (stem === "vocals") {
      body.presets.multivocal = "lead_back";
    }

    console.error("[lalal body]", JSON.stringify(body));
    const res = await fetch(`${LALAL_API}/split/stem_separator/`, {
      method: "POST",
      headers: {
        "X-License-Key": LALAL_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`lalal.ai split falhou para stem ${stem} (${res.status}): ${err}`);
    }

    const data = await res.json();
    console.error("[lalalSplit result]", JSON.stringify(data));
    taskIds.push(String(data.task_id ?? data.id ?? ""));
  }

  return taskIds;
}

// ── 3. Verificar status das tarefas ──────────────────────────────────────────
export interface LalalTrack {
  type: "stem" | "back";
  label: string;
  url: string;
}

export interface LalalTaskResult {
  id: string;
  status: "progress" | "success" | "error" | "cancelled";
  error?: string;
  tracks?: LalalTrack[];
}

export async function lalalCheck(taskIds: string[]): Promise<LalalTaskResult[]> {
  const res = await fetch(`${LALAL_API}/check/`, {
    method: "POST",
    headers: {
      "X-License-Key": LALAL_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ task_ids: taskIds }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`lalal.ai check falhou (${res.status}): ${err}`);
  }

  const data = await res.json();
  console.error("[lalalCheck result]", JSON.stringify(data).slice(0,200));
  // API retorna {result: {taskId: {...}, ...}}
  const resultObj = data.result ?? data.tasks ?? data;
  if (Array.isArray(resultObj)) return resultObj as LalalTaskResult[];
  // Converter objeto para array
  return Object.entries(resultObj).map(([id, v]: [string, any]) => ({
    id,
    status: v.status ?? "progress",
    error: v.error,
    tracks: v.result?.tracks ?? v.result_tracks ?? v.tracks ?? [],
  })) as LalalTaskResult[];
}

// ── 4. Polling até concluir (com timeout) ────────────────────────────────────
export async function lalalWaitForCompletion(
  taskIds: string[],
  maxWaitMs = 10 * 60 * 1000, // 10 minutos
  intervalMs = 5000
): Promise<LalalTaskResult[]> {
  const start = Date.now();

  while (Date.now() - start < maxWaitMs) {
    const results = await lalalCheck(taskIds);
    const allDone = results.every(r => r.status === "success" || r.status === "error" || r.status === "cancelled");

    if (allDone) return results;

    const anyError = results.find(r => r.status === "error");
    if (anyError) throw new Error(`lalal.ai erro na tarefa: ${anyError.error}`);

    await new Promise(r => setTimeout(r, intervalMs));
  }

  throw new Error("lalal.ai timeout: processamento demorou mais que 10 minutos");
}

// ── 5. Baixar arquivo da lalal.ai e fazer upload para R2 ─────────────────────
export async function downloadAndUploadToR2(
  sourceUrl: string,
  r2Key: string,
  contentType = "audio/wav"
): Promise<void> {
  const s3Client = createS3Client();
  const { bucketName } = getBucketConfig();

  const res = await fetch(sourceUrl);
  if (!res.ok) throw new Error(`Falha ao baixar stem: ${res.status}`);

  const buffer = Buffer.from(await res.arrayBuffer());

  await s3Client.send(new PutObjectCommand({
    Bucket: bucketName,
    Key: r2Key,
    Body: buffer,
    ContentType: contentType,
  }));
}

// ── 6. Gerar metrônomo WAV via Node.js puro ───────────────────────────────────
// Gera um WAV PCM mono com cliques a cada batida
export function generateMetronomeWav(bpm: number, durationSec: number): Buffer {
  const sampleRate = 44100;
  const totalSamples = Math.ceil(sampleRate * durationSec);
  const beatInterval = (60 / bpm) * sampleRate; // amostras por batida
  const clickDurationSamples = Math.floor(sampleRate * 0.02); // 20ms de clique
  const clickFreq = 1000; // Hz — clique de downbeat
  const subClickFreq = 800; // Hz — subdivisão

  // PCM 16-bit
  const pcm = Buffer.alloc(totalSamples * 2, 0);
  let beatCount = 0;

  for (let i = 0; i < totalSamples; i++) {
    const posInBeat = i % beatInterval;
    if (posInBeat < clickDurationSamples) {
      // Primeiro tempo: clique mais forte
      const freq = beatCount % 4 === 0 ? clickFreq : subClickFreq;
      const amplitude = beatCount % 4 === 0 ? 20000 : 12000;
      const t = posInBeat / sampleRate;
      const envelope = 1 - posInBeat / clickDurationSamples; // fade out
      const sample = Math.round(amplitude * envelope * Math.sin(2 * Math.PI * freq * t));
      pcm.writeInt16LE(Math.max(-32768, Math.min(32767, sample)), i * 2);
    }
    if (posInBeat === 0) beatCount++;
  }

  return buildWavFromPCM(pcm, sampleRate, 1);
}

function buildWavFromPCM(pcm: Buffer, sampleRate: number, channels: number): Buffer {
  const byteRate = sampleRate * channels * 2;
  const blockAlign = channels * 2;
  const header = Buffer.alloc(44);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);       // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(16, 34);       // bits per sample
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);

  return Buffer.concat([header, pcm]);
}

// ── 7. Analisar BPM, tom e seções com Gemini ────────────────────────────────
export interface MusicAnalysis {
  bpm: number;
  musicalKey: string;
  sections: { label: string; startSec: number; endSec: number }[];
}

export async function analyzeWithGemini(
  audioBase64: string,
  mimeType: string,
  durationSec: number
): Promise<MusicAnalysis> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY não configurada");

  const prompt = `Analise este áudio musical e retorne APENAS este JSON (sem texto extra):
{"bpm": <inteiro>, "musicalKey": "<ex: G Major, A minor>", "sections": []}
Detecte o BPM contando as batidas. Músicas gospel estão geralmente entre 60-180 BPM.`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: mimeType, data: audioBase64 } },
            { text: prompt },
          ],
        }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
      }),
    }
  );

  if (!res.ok) throw new Error(`Gemini analyze falhou: ${res.status}`);

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  // Limpar markdown se vier
  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}");
  if (jsonStart === -1 || jsonEnd === -1) throw new Error("Gemini não retornou JSON");
  let parsed: MusicAnalysis;
  try {
    parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as MusicAnalysis;
  } catch {
    // JSON truncado — extrair bpm e key via regex como fallback
    const bpmMatch = text.match(/"bpm"\s*:\s*(\d+)/);
    const keyMatch = text.match(/"musicalKey"\s*:\s*"([^"]+)"/);
    parsed = {
      bpm: bpmMatch ? Number(bpmMatch[1]) : 120,
      musicalKey: keyMatch ? keyMatch[1] : "C Major",
      sections: [],
    };
  }

  // Validar e normalizar
  parsed.bpm = Math.round(parsed.bpm) || 120;
  parsed.musicalKey = parsed.musicalKey || "C Major";
  parsed.sections = (parsed.sections || []).map((s: any) => ({
    label: s.label || "Seção",
    startSec: Number(s.startSec) || 0,
    endSec: Number(s.endSec) || durationSec,
  }));

  return parsed;
}

// ── 8. Gerar guia TTS com Gemini ────────────────────────────────────────────
// Retorna PCM 16-bit mono 24kHz (formato nativo do Gemini TTS)
export async function generateGuideTTS(
  sections: { label: string; startSec: number; endSec: number }[],
  bpm: number,
  songName: string
): Promise<Buffer> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY não configurada");

  // Montar script com pausas baseadas nos tempos reais
  const scriptLines: string[] = [];
  scriptLines.push(`${songName}.`);

  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    const next = sections[i + 1];
    const durationSec = (next?.startSec ?? s.endSec) - s.startSec;
    scriptLines.push(s.label + ".");
    // Pausa proporcional (silêncio implícito — o TTS vai respeitar as quebras)
    if (durationSec > 4) scriptLines.push("...");
  }

  const script = scriptLines.join(" ");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: script }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: "Aoede" }, // voz clara e profissional
            },
          },
        },
      }),
    }
  );

  if (!res.ok) throw new Error(`Gemini TTS falhou: ${res.status}`);

  const data = await res.json();
  const audioData = data.candidates?.[0]?.content?.parts?.[0]?.inlineData;
  if (!audioData) throw new Error("Gemini TTS não retornou áudio");

  // Gemini TTS retorna PCM L16 24kHz — converter para WAV
  const pcm = Buffer.from(audioData.data, "base64");
  return buildWavFromPCM(pcm, 24000, 1);
}
