export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { SessionUser } from "@/lib/types";

interface ParsedMetadata {
  title: string | null;
  artist: string | null;
  bpm: number | null;
  musicalKey: string | null;
  raw: string | null;
}

// Padrão real: "Artista - Título - 123Bpm - B.zip"
// Ex: "ONE Service, Jéssica Augusto - Livres - 123Bpm - B.zip"
// Ex: "Nenhum Deus Como Tu - Nivea Soares - 144Bpm - Bm.zip"
function parseFilename(name: string): ParsedMetadata {
  // Remove extensão
  const clean = name.replace(/\.(zip|rar|7z)$/i, "").trim();

  let title: string | null = null;
  let artist: string | null = null;
  let bpm: number | null = null;
  let musicalKey: string | null = null;

  // Separar pelas partes com " - "
  const parts = clean.split(/\s*-\s*/).map((p) => p.trim()).filter(Boolean);

  // Identificar cada parte
  const meaningfulParts: string[] = [];

  for (const part of parts) {
    // BPM: ex "123Bpm", "144BPM", "120bpm"
    const bpmMatch = part.match(/^(\d{2,3})\s*[Bb][Pp][Mm]$/);
    if (bpmMatch) { bpm = parseInt(bpmMatch[1]); continue; }

    // Tom: ex "B", "Bm", "C#", "Ebm", "F#m"
    const keyMatch = part.match(/^([A-G][b#]?m?)$/);
    if (keyMatch) { musicalKey = keyMatch[1]; continue; }

    meaningfulParts.push(part);
  }

  // Com o padrão real: primeiro parte = artista, segundo = título
  if (meaningfulParts.length >= 2) {
    artist = meaningfulParts[0];
    title = meaningfulParts[1];
  } else if (meaningfulParts.length === 1) {
    title = meaningfulParts[0];
  }

  return { title, artist, bpm, musicalKey, raw: clean };
}

async function getGoogleDriveFilename(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      redirect: "follow",
    });

    if (!res.ok) return null;

    const html = await res.text();

    // O título da página do Drive já é o nome do arquivo
    // Ex: "ONE Service, Jéssica Augusto - Livres - 123Bpm - B.zip - Google Drive"
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) {
      const pageTitle = titleMatch[1]
        .replace(/\s*-\s*Google Drive\s*$/i, "")
        .trim();
      if (pageTitle && pageTitle.length > 2) return pageTitle;
    }

    return null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    const user = session.user as SessionUser;
    if (!["SUPERADMIN"].includes(user.role)) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    const { url } = await req.json();
    if (!url) return NextResponse.json({ error: "URL obrigatória" }, { status: 400 });

    // Buscar nome do arquivo no Google Drive
    const filename = await getGoogleDriveFilename(url);

    if (!filename) {
      return NextResponse.json({
        parsed: null,
        message: "Não foi possível extrair o nome do arquivo. Preencha os dados manualmente.",
      });
    }

    const parsed = parseFilename(filename);

    return NextResponse.json({ parsed, filename });
  } catch (err) {
    console.error("[multitracks/admin/parse] error:", err);
    return NextResponse.json({ error: "Erro ao processar URL" }, { status: 500 });
  }
}
