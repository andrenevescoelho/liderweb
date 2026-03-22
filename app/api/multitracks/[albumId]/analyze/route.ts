export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { SessionUser } from "@/lib/types";
import { createS3Client, getBucketConfig } from "@/lib/aws-config";
import { GetObjectCommand } from "@aws-sdk/client-s3";

interface Marker {
  label: string;
  time: number; // segundos
  color: string;
}

const MARKER_COLORS: Record<string, string> = {
  "Intro":       "#6366F1",
  "Verso":       "#10B981",
  "Pré-Refrão":  "#F59E0B",
  "Refrão":      "#EF4444",
  "Ponte":       "#8B5CF6",
  "Interlúdio":  "#06B6D4",
  "Solo":        "#F97316",
  "Outro":       "#64748B",
};

function getMarkerColor(label: string): string {
  for (const [key, color] of Object.entries(MARKER_COLORS)) {
    if (label.toLowerCase().includes(key.toLowerCase())) return color;
  }
  return "#94A3B8";
}

async function fetchStemFromR2(r2Key: string): Promise<Buffer> {
  const s3Client = createS3Client();
  const { bucketName } = getBucketConfig();

  const command = new GetObjectCommand({ Bucket: bucketName, Key: r2Key });
  const response = await s3Client.send(command);

  if (!response.Body) throw new Error("Arquivo não encontrado no R2");

  const chunks: Uint8Array[] = [];
  const reader = response.Body.transformToWebStream().getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

async function analyzeGuiaWithGemini(audioBuffer: Buffer, mimeType: string): Promise<Marker[]> {
  const base64Audio = audioBuffer.toString("base64");

  const prompt = `Você é um especialista em análise de músicas gospel e worship.
Analise este arquivo de áudio que é a faixa "Guia" de uma multitrack gospel.
A Guia contém a voz do cantor guiando a música com marcações de seções.

Identifique as seções da música com seus timestamps precisos em segundos.
As seções típicas são: Intro, Verso, Pré-Refrão, Refrão, Ponte, Interlúdio, Solo, Outro.

Responda APENAS com um JSON válido no formato:
[
  { "label": "Intro", "time": 0 },
  { "label": "Verso", "time": 12.5 },
  { "label": "Refrão", "time": 45.2 }
]

Regras:
- time deve ser em segundos (número decimal)
- label deve ser em português
- Inclua APENAS seções claramente identificáveis
- Não inclua texto explicativo, apenas o JSON`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            {
              inline_data: {
                mime_type: mimeType,
                data: base64Audio,
              },
            },
            { text: prompt },
          ],
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 1000,
        },
      }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API error: ${response.status} — ${err}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

  // Extrair JSON da resposta
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error("Gemini não retornou JSON válido");

  const rawMarkers = JSON.parse(jsonMatch[0]) as { label: string; time: number }[];

  return rawMarkers.map((m) => ({
    label: m.label,
    time: Number(m.time),
    color: getMarkerColor(m.label),
  }));
}

export async function POST(
  req: NextRequest,
  { params }: { params: { albumId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    const user = session.user as SessionUser;
    if (!["SUPERADMIN"].includes(user.role)) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    const { albumId } = params;
    const album = await prisma.multitracksAlbum.findUnique({ where: { id: albumId } });
    if (!album) return NextResponse.json({ error: "Album não encontrado" }, { status: 404 });

    const stems = Array.isArray(album.stems)
      ? album.stems as { name: string; r2Key: string }[]
      : [];

    // Encontrar a faixa Guia
    const guiaStem = stems.find((s) =>
      s.name.toLowerCase().includes("guia") || s.name.toLowerCase().includes("guide")
    );

    if (!guiaStem) {
      return NextResponse.json({ error: "Faixa Guia não encontrada neste album" }, { status: 404 });
    }

    // Buscar o áudio da Guia do R2
    const audioBuffer = await fetchStemFromR2(guiaStem.r2Key);
    const mimeType = guiaStem.r2Key.endsWith(".mp3") ? "audio/mp3" : "audio/wav";

    // Analisar com Gemini
    const markers = await analyzeGuiaWithGemini(audioBuffer, mimeType);

    if (markers.length === 0) {
      return NextResponse.json({ error: "Nenhuma marcação detectada" }, { status: 422 });
    }

    // Salvar no banco
    await prisma.multitracksAlbum.update({
      where: { id: albumId },
      data: { markers } as any,
    });

    return NextResponse.json({ markers, count: markers.length });
  } catch (err) {
    console.error("[analyze] error:", err);
    return NextResponse.json({
      error: err instanceof Error ? err.message : "Erro interno",
    }, { status: 500 });
  }
}
