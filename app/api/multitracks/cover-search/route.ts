import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { SessionUser } from "@/lib/types";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const user = session.user as SessionUser;
  if (user.role !== "SUPERADMIN") return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const title = searchParams.get("title")?.trim();
  const artist = searchParams.get("artist")?.trim();
  if (!title || !artist) return NextResponse.json({ error: "title e artist obrigatórios" }, { status: 400 });

  const results: { url: string; source: string; thumb: string }[] = [];

  // iTunes Search — gratuita, sem chave
  try {
    const q = encodeURIComponent(`${title} ${artist}`);
    const res = await fetch(`https://itunes.apple.com/search?term=${q}&entity=song&limit=5&country=BR`, {
      headers: { "User-Agent": "LiderWeb/1.0" },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = await res.json();
      for (const item of data.results ?? []) {
        if (item.artworkUrl100) {
          results.push({
            url: item.artworkUrl100.replace("100x100bb", "600x600bb"),
            thumb: item.artworkUrl100,
            source: `iTunes — ${item.trackName} · ${item.artistName}`,
          });
        }
      }
    }
  } catch { /* silent */ }

  // Deezer — gratuita, sem chave
  try {
    const q = encodeURIComponent(`${title} ${artist}`);
    const res = await fetch(`https://api.deezer.com/search?q=${q}&limit=5`, {
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = await res.json();
      for (const item of data.data ?? []) {
        if (item.album?.cover_big) {
          results.push({
            url: item.album.cover_big,
            thumb: item.album.cover_medium ?? item.album.cover_big,
            source: `Deezer — ${item.title} · ${item.artist?.name}`,
          });
        }
      }
    }
  } catch { /* silent */ }

  const seen = new Set<string>();
  const unique = results.filter((r) => { if (seen.has(r.url)) return false; seen.add(r.url); return true; });
  return NextResponse.json({ results: unique.slice(0, 8) });
}
