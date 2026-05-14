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
      useQualification = false,
      previousAssignments = [],
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

    // ── Histórico real de escalas (últimas 4 semanas) ─────────────────────────
    const fourWeeksAgo = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000);
    const recentSchedules = await prisma.schedule.findMany({
      where: {
        groupId: user.groupId,
        status: { in: ["PUBLISHED", "APPROVED"] },
        date: { gte: fourWeeksAgo },
      },
      include: {
        roles: {
          include: { member: { select: { id: true, name: true } } },
        },
        memberRoles: {
          include: { member: { select: { id: true, name: true } } },
        },
      },
      orderBy: { date: "desc" },
      take: 8,
    });

    const dbHistoryContext = recentSchedules.length > 0
      ? "\nHistórico real (últimas escalas salvas): " +
        recentSchedules.map(s => {
          const allRoles = [
            ...(s.roles ?? []).map((r: any) => r.member?.name).filter(Boolean),
            ...(s.memberRoles ?? []).map((r: any) => r.member?.name).filter(Boolean),
          ];
          const dateStr = new Date(s.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
          return `${dateStr}:[${allRoles.slice(0, 5).join(",")}]`;
        }).join(" | ")
      : "";

    // ── Contexto de músicas pela estratégia ───────────────────────────────────
    const { songsText, strategyNote } = await buildSongContext(
      user.groupId,
      strategy,
      strategy === "minister_history" ? ministerId : null
    );

    // ── Classificações dos membros (se useQualification) ─────────────────────
    let evaluationsMap: Record<string, Record<string, number>> = {};
    if (useQualification) {
      const evals = await prisma.$queryRaw<any[]>`
        SELECT "memberId", criteria FROM "MemberEvaluation" WHERE "groupId" = ${user.groupId}
      `.catch(() => []);
      for (const e of evals) {
        if (e.memberId && e.criteria) evaluationsMap[e.memberId] = e.criteria;
      }
    }

    // ── Montar prompt ─────────────────────────────────────────────────────────
    // Limitar membros para evitar prompt gigante (máx 30 membros)
    const membersForPrompt = activeMembers.slice(0, 30);
    const membersText = membersForPrompt.length > 0
      ? membersForPrompt.map((m) => {
          const eval_ = evaluationsMap[m.id];
          const avgScore = eval_
            ? (Object.values(eval_).reduce((a, b) => a + b, 0) / Object.values(eval_).length).toFixed(1)
            : null;
          // Versão compacta: apenas info essencial
          const parts = [`- ${m.name} [${m.roles.join("/") || "sem função"}]`];
          if (m.voiceType) parts.push(`voz:${m.voiceType}`);
          if (avgScore) parts.push(`★${avgScore}`);
          return parts.join(" ");
        }).join("\n")
      : "Nenhum membro cadastrado ainda.";

    const qualificationInstruction = useQualification && Object.keys(evaluationsMap).length > 0
      ? `\nPRIORIZE membros com ★ maior (mais próximo de 5.0).`
      : "";

    const datesText = dates.join(", ");
    const obsText = observation?.trim() ? `\nObservação: ${observation}` : "";

    // Contexto compacto de quem já foi escalado
    const previousContext = previousAssignments.length > 0 || dbHistoryContext
      ? `\nEvitar repetição:` +
        (dbHistoryContext ? dbHistoryContext : "") +
        (previousAssignments.length > 0
          ? " | Sessão atual: " + previousAssignments.map((p: any) =>
              `${p.date}:[${p.roles.map((r: any) => r.memberName).filter(Boolean).join(",")}]`
            ).join(" | ")
          : "")
      : "";

    const rolesText = templateRoles.length > 0
      ? "\nFunções: " + templateRoles.map((r) => `${r.role}(${r.count})`).join(", ")
      : "";
    const bandText = bandType === "full" ? "banda completa"
      : bandType === "reduced" ? "banda reduzida"
      : "somente vozes";
    const ministerContext = ministerName ? `\nMinistro: ${ministerName}` : "";

    // Gerar UMA data por vez para evitar truncamento
    const singleDate = dates[0];

    const prompt = `Assistente de escalas para ministério de louvor evangélico brasileiro.

MEMBROS (${membersForPrompt.length}):
${membersText}

MÚSICAS DISPONÍVEIS:
${songsText}

ESTRATÉGIA DE MÚSICAS: ${strategyNote}

PEDIDO:
Data: ${singleDate}
${templateName ? `Culto: ${templateName}` : ""}${defaultTime ? `\nHorário: ${defaultTime}` : ""}
Banda: ${bandText}
Músicas: ${songCount}${ministerContext}${obsText}${previousContext}${rolesText}${qualificationInstruction}

REGRAS:
- Use os IDs exatos das músicas (formato [ID:xxxxx])
- Preencha exatamente as funções solicitadas
- Equilibre participação entre membros
- Sugira exatamente ${songCount} músicas

IDs membros: ${membersForPrompt.map((m) => `${m.name}:"${m.id}"`).join(", ")}

Responda APENAS JSON válido:
{
  "schedules": [{
    "date": "${singleDate}",
    "time": "${defaultTime ?? null}",
    "name": "${templateName ?? null}",
    "roles": [{ "role": "função", "memberId": "id", "memberName": "nome" }],
    "songs": [{ "songId": "id", "title": "título", "key": "tom", "songReason": "motivo curto" }],
    "aiNotes": "observação opcional"
  }]
}`;

    // ── Chamar Gemini ─────────────────────────────────────────────────────────
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 8192,
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
    const finishReason = geminiData?.candidates?.[0]?.finishReason ?? "unknown";

    if (!rawText) {
      console.error("[suggest-schedule] Gemini resposta vazia. finishReason:", finishReason, JSON.stringify(geminiData).slice(0, 300));
      return NextResponse.json({ error: "IA retornou resposta vazia" }, { status: 500 });
    }

    if (finishReason === "MAX_TOKENS") {
      console.warn("[suggest-schedule] Resposta truncada por MAX_TOKENS — tentando reparar JSON");
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
