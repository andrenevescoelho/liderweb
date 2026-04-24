export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { SessionUser } from "@/lib/types";
import { hasPermission } from "@/lib/authorization";

// ─── Tipos ────────────────────────────────────────────────────────────────────

type SongStrategy =
  | "minister_history"   // músicas do histórico do ministro escalado
  | "group_top"          // músicas mais usadas pelo ministério
  | "exploration";       // músicas esquecidas / pouco usadas

// ─── Helpers de contexto por estratégia ──────────────────────────────────────

async function buildSongContext(
  groupId: string,
  strategy: SongStrategy,
  ministerId: string | null
): Promise<{ songsText: string; strategyNote: string }> {

  const allSongs = await prisma.song.findMany({
    where: { groupId },
    select: { id: true, title: true, artist: true, originalKey: true, bpm: true },
    orderBy: { createdAt: "desc" },
    take: 80,
  });

  if (allSongs.length === 0) {
    return {
      songsText: "Nenhuma música no repertório ainda.",
      strategyNote: "Nenhuma música cadastrada. Sugira músicas genéricas do louvor evangélico brasileiro.",
    };
  }

  // ── Estratégia 1: Perfil do ministro ──────────────────────────────────────
  if (strategy === "minister_history" && ministerId) {
    const history = await (prisma as any).scheduleSong.findMany({
      where: { ministerId },
      select: { songId: true, keyUsed: true },
      orderBy: { createdAt: "desc" },
      take: 60,
    });

    if (history.length > 0) {
      const freq = new Map<string, { count: number; lastKey: string | null }>();
      for (const h of history) {
        const cur = freq.get(h.songId) ?? { count: 0, lastKey: null };
        freq.set(h.songId, { count: cur.count + 1, lastKey: h.keyUsed ?? cur.lastKey });
      }

      const songMap = new Map(allSongs.map((s) => [s.id, s]));
      const ranked = [...freq.entries()]
        .sort((a, b) => b[1].count - a[1].count)
        .map(([songId, data]) => {
          const song = songMap.get(songId);
          if (!song) return null;
          return { ...song, count: data.count, lastKey: data.lastKey };
        })
        .filter(Boolean) as any[];

      const usedIds = new Set(freq.keys());
      const unused = allSongs.filter((s) => !usedIds.has(s.id)).slice(0, 10);

      const rankedText = ranked
        .slice(0, 20)
        .map((s) => `- [ID:${s.id}] ${s.title}${s.artist ? ` (${s.artist})` : ""} | Tom preferido: ${s.lastKey ?? s.originalKey} | Usada ${s.count}x pelo ministro`)
        .join("\n");

      const unusedText = unused.length > 0
        ? "\n\nMúsicas do repertório que este ministro ainda não usou:\n" +
          unused.map((s) => `- [ID:${s.id}] ${s.title}${s.artist ? ` (${s.artist})` : ""} | Tom: ${s.originalKey}`).join("\n")
        : "";

      return {
        songsText: rankedText + unusedText,
        strategyNote: "ESTRATÉGIA: Perfil do ministro. Priorize as músicas que ele mais usa, respeitando o tom preferido. Você pode incluir 1 ou 2 músicas que ele ainda não usou para variar.",
      };
    }

    // Fallback: ministro sem histórico ainda
    return buildSongContext(groupId, "group_top", null).then((ctx) => ({
      ...ctx,
      strategyNote: ctx.strategyNote + " (Ministro sem histórico ainda — usando músicas populares do ministério como base.)",
    }));
  }

  // ── Estratégia 2: Mais usadas pelo ministério ──────────────────────────────
  if (strategy === "group_top") {
    const history = await (prisma as any).scheduleSong.findMany({
      where: { schedule: { groupId } },
      select: { songId: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    if (history.length > 0) {
      const freq = new Map<string, number>();
      for (const h of history) {
        freq.set(h.songId, (freq.get(h.songId) ?? 0) + 1);
      }

      const songMap = new Map(allSongs.map((s) => [s.id, s]));
      const ranked = [...freq.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([songId, count]) => {
          const song = songMap.get(songId);
          return song ? { ...song, count } : null;
        })
        .filter(Boolean) as any[];

      const usedIds = new Set(freq.keys());
      const noHistory = allSongs.filter((s) => !usedIds.has(s.id)).slice(0, 10);

      const rankedText = ranked
        .slice(0, 25)
        .map((s) => `- [ID:${s.id}] ${s.title}${s.artist ? ` (${s.artist})` : ""} | Tom: ${s.originalKey} | Usada ${s.count}x no ministério`)
        .join("\n");

      const noHistoryText = noHistory.length > 0
        ? "\n\nMúsicas sem histórico de uso ainda:\n" +
          noHistory.map((s) => `- [ID:${s.id}] ${s.title}${s.artist ? ` (${s.artist})` : ""} | Tom: ${s.originalKey}`).join("\n")
        : "";

      return {
        songsText: rankedText + noHistoryText,
        strategyNote: "ESTRATÉGIA: Repertório popular do ministério. Priorize as músicas mais usadas, mas equilibre para não repetir sempre as mesmas.",
      };
    }

    // Sem histórico nenhum ainda
    const songsText = allSongs
      .slice(0, 30)
      .map((s) => `- [ID:${s.id}] ${s.title}${s.artist ? ` (${s.artist})` : ""} | Tom: ${s.originalKey}${s.bpm ? ` | BPM: ${s.bpm}` : ""}`)
      .join("\n");

    return {
      songsText,
      strategyNote: "ESTRATÉGIA: Sem histórico de uso ainda. Escolha músicas variadas do repertório.",
    };
  }

  // ── Estratégia 3: Exploração (músicas esquecidas) ──────────────────────────
  if (strategy === "exploration") {
    const eightWeeksAgo = new Date(Date.now() - 8 * 7 * 24 * 60 * 60 * 1000);
    const recentHistory = await (prisma as any).scheduleSong.findMany({
      where: {
        schedule: { groupId },
        createdAt: { gte: eightWeeksAgo },
      },
      select: { songId: true },
    });

    const recentIds = new Set(recentHistory.map((h: any) => h.songId));
    const forgotten = allSongs.filter((s) => !recentIds.has(s.id));
    const recent = allSongs.filter((s) => recentIds.has(s.id));

    const forgottenText = forgotten.length > 0
      ? forgotten
          .slice(0, 25)
          .map((s) => `- [ID:${s.id}] ${s.title}${s.artist ? ` (${s.artist})` : ""} | Tom: ${s.originalKey} | ⭐ Não usada há mais de 8 semanas`)
          .join("\n")
      : allSongs
          .slice(0, 20)
          .map((s) => `- [ID:${s.id}] ${s.title}${s.artist ? ` (${s.artist})` : ""} | Tom: ${s.originalKey}`)
          .join("\n");

    const recentText = recent.length > 0
      ? "\n\nMúsicas usadas recentemente (evite repetir):\n" +
        recent.slice(0, 10).map((s) => `- ${s.title}`).join("\n")
      : "";

    return {
      songsText: forgottenText + recentText,
      strategyNote: "ESTRATÉGIA: Exploração. Priorize músicas não usadas há mais de 8 semanas. Evite repetir as músicas recentes listadas. Objetivo é renovar o repertório.",
    };
  }

  // Fallback genérico
  const songsText = allSongs
    .slice(0, 30)
    .map((s) => `- [ID:${s.id}] ${s.title}${s.artist ? ` (${s.artist})` : ""} | Tom: ${s.originalKey}`)
    .join("\n");

  return { songsText, strategyNote: "" };
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const user = session.user as SessionUser;
    if (!user.groupId) return NextResponse.json({ error: "Sem grupo" }, { status: 400 });

    const canCreate =
      user.role === "ADMIN" ||
      user.role === "LEADER" ||
      user.role === "SUPERADMIN" ||
      hasPermission(user.role as any, "schedule.create", (user as any).permissions);

    if (!canCreate) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "GEMINI_API_KEY não configurada" }, { status: 500 });

    // Verificar se o grupo tem músicas cadastradas
    const repertorioCount = await prisma.song.count({ where: { groupId: user.groupId } });
    if (repertorioCount === 0) {
      return NextResponse.json(
        { error: "SEM_REPERTORIO", message: "Seu ministério não tem músicas cadastradas no repertório. Adicione músicas antes de usar o wizard de IA." },
        { status: 400 }
      );
    }

    const body = await req.json();
    const {
      dates,
      templateId,
      observation,
      songStrategy = "group_top",
      ministerId = null,
    } = body ?? {};

    const validStrategies: SongStrategy[] = ["minister_history", "group_top", "exploration"];
    const strategy: SongStrategy = validStrategies.includes(songStrategy) ? songStrategy : "group_top";

    let template: any = null;
    if (templateId) {
      template = await (prisma as any).scheduleTemplate.findFirst({
        where: { id: templateId, groupId: user.groupId },
      });
    }

    const songCount = template?.songCount ?? 5;
    const bandType = template?.bandType ?? "full";
    const templateRoles: { role: string; count: number }[] = Array.isArray(template?.roles) ? template.roles : [];
    const defaultTime = template?.defaultTime ?? null;
    const templateName = template?.name ?? null;

    if (!dates || !Array.isArray(dates) || dates.length === 0) {
      return NextResponse.json({ error: "Datas são obrigatórias" }, { status: 400 });
    }

    // ── Membros ativos ────────────────────────────────────────────────────────
    const members = await prisma.user.findMany({
      where: { groupId: user.groupId, role: { not: "SUPERADMIN" } },
      include: {
        profile: { select: { active: true, availability: true, voiceType: true } },
        memberFunctions: {
          where: { isPending: false },
          include: { roleFunction: { select: { name: true } } },
        },
      },
      orderBy: { name: "asc" },
    });

    const activeMembers = members
      .filter((m) => m.profile?.active !== false)
      .map((m) => ({
        id: m.id,
        name: m.name,
        roles: m.memberFunctions.map((mf) => mf.roleFunction.name),
        availability: m.profile?.availability ?? [],
        voiceType: m.profile?.voiceType ?? null,
      }))
      .slice(0, 40);

    const ministerName = ministerId
      ? (activeMembers.find((m) => m.id === ministerId)?.name ?? null)
      : null;

    // ── Contexto de músicas pela estratégia ───────────────────────────────────
    const { songsText, strategyNote } = await buildSongContext(
      user.groupId,
      strategy,
      strategy === "minister_history" ? ministerId : null
    );

    // ── Montar prompt ─────────────────────────────────────────────────────────
    const membersText = activeMembers.length > 0
      ? activeMembers.map((m) =>
          `- ${m.name}: funções=[${m.roles.join(", ") || "sem função definida"}]` +
          (m.availability?.length ? `, disponível=[${m.availability.join(", ")}]` : "") +
          (m.voiceType ? `, voz=${m.voiceType}` : "")
        ).join("\n")
      : "Nenhum membro cadastrado ainda.";

    const datesText = dates.join(", ");
    const obsText = observation?.trim() ? `\nObservação do líder: ${observation}` : "";
    const rolesText = templateRoles.length > 0
      ? "\n## Funções esperadas na escala:\n" + templateRoles.map((r) => `- ${r.role}: ${r.count} pessoa(s)`).join("\n")
      : "";
    const bandText = bandType === "full" ? "banda completa (todos os instrumentos)"
      : bandType === "reduced" ? "banda reduzida (instrumentos essenciais)"
      : "somente vozes (sem instrumentos)";
    const ministerContext = ministerName
      ? `\nMinistro selecionado para esta escala: ${ministerName} (id: ${ministerId})`
      : "";

    const prompt = `Você é um assistente especializado em gestão de ministérios de louvor evangélicos brasileiros.

Seu trabalho é sugerir uma escala de culto com base nos membros disponíveis e no repertório da igreja.

## Membros do ministério:
${membersText}

## Repertório disponível para seleção:
${songsText}

## Instrução de estratégia para escolha de músicas:
${strategyNote}

## Pedido:
O líder quer criar uma escala para a data: ${datesText}
${templateName ? `Nome do culto: ${templateName}` : ""}
${defaultTime ? `Horário: ${defaultTime}` : ""}
Tipo de banda: ${bandText}
Quantidade de músicas a sugerir: ${songCount}${ministerContext}${obsText}${rolesText}

## Instruções gerais:
- Cada música no repertório está listada com seu ID no formato [ID:xxxxx]. Use EXATAMENTE esse ID no campo "songId" da resposta — nunca invente ou modifique IDs
- Siga rigorosamente a instrução de estratégia acima para escolher as músicas
- Para cada música sugerida, inclua uma justificativa curta em "songReason" (ex: "João usou 5 vezes", "Não é usada há 6 semanas", "Favorita do ministério")
- Preencha exatamente as funções listadas acima (se houver), respeitando a quantidade de cada uma
- Priorize membros com a função correspondente cadastrada
- Tente equilibrar a participação (não sobrecarregar sempre os mesmos)
- Sugira exatamente ${songCount} músicas
- Se não houver músicas ou membros suficientes, preencha o que for possível e deixe o resto em branco

## Formato de resposta:
Responda APENAS com JSON válido, sem texto antes ou depois, sem blocos de código markdown.

{
  "schedules": [
    {
      "date": "YYYY-MM-DD",
      "time": "${defaultTime ?? "HH:MM ou null"}",
      "name": "${templateName ?? "nome do culto ou null"}",
      "roles": [
        { "role": "nome da função", "memberId": "id do membro ou null", "memberName": "nome do membro ou null" }
      ],
      "songs": [
        { "songId": "id da música", "title": "título", "key": "tom sugerido", "songReason": "justificativa curta" }
      ],
      "aiNotes": "observações da IA sobre esta escala (opcional)"
    }
  ]
}

IDs dos membros:
${activeMembers.map((m) => `${m.name}: "${m.id}"`).join(", ")}`;

    // ── Chamar Gemini ─────────────────────────────────────────────────────────
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 8192,
            responseMimeType: "application/json",
          },
        }),
      }
    );

    if (!geminiRes.ok) {
      const err = await geminiRes.text();
      console.error("[suggest-schedule] Gemini error:", geminiRes.status, err);
      return NextResponse.json({ error: "Erro ao consultar IA" }, { status: 500 });
    }

    const geminiData = await geminiRes.json();
    const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    if (!rawText) {
      console.error("[suggest-schedule] Gemini resposta vazia:", JSON.stringify(geminiData).slice(0, 300));
      return NextResponse.json({ error: "IA retornou resposta vazia" }, { status: 500 });
    }

    // ── Parse defensivo ───────────────────────────────────────────────────────
    let parsed: any;
    try {
      const clean = rawText.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
      parsed = JSON.parse(clean);
    } catch {
      let jsonStr = rawText;
      const match = rawText.match(/\{[\s\S]*\}/);
      if (match) jsonStr = match[0];
      try {
        parsed = JSON.parse(jsonStr);
      } catch {
        try {
          let repaired = jsonStr.trim();
          let opens = 0, closeNeeded = "";
          for (const ch of repaired) {
            if (ch === "{") opens++;
            else if (ch === "}") opens--;
            else if (ch === "[") closeNeeded = "]" + closeNeeded;
            else if (ch === "]") closeNeeded = closeNeeded.slice(1);
          }
          while (closeNeeded.length > 0) { repaired += closeNeeded[0]; closeNeeded = closeNeeded.slice(1); }
          while (opens > 0) { repaired += "}"; opens--; }
          repaired = repaired.replace(/,\s*([}\]])/g, "$1");
          parsed = JSON.parse(repaired);
          console.warn("[suggest-schedule] JSON reparado com sucesso");
        } catch {
          console.error("[suggest-schedule] Parse falhou:", rawText.slice(0, 500));
          return NextResponse.json({ error: "IA retornou formato inválido — tente novamente com menos datas" }, { status: 500 });
        }
      }
    }

    // Log temporário para debug de songIds
    console.log("[suggest-schedule] songs retornadas pela IA:", JSON.stringify((parsed.schedules ?? []).map((s: any) => ({ date: s.date, songs: s.songs }))));

    return NextResponse.json({
      schedules: parsed.schedules ?? [],
      context: {
        membersCount: activeMembers.length,
        strategy,
        ministerName,
      },
    });
  } catch (error) {
    console.error("[suggest-schedule] error:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
