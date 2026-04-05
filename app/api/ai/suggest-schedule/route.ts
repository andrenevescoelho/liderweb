export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { SessionUser } from "@/lib/types";
import { hasPermission } from "@/lib/authorization";

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

    const body = await req.json();
    const { period, dates, numServices, observation } = body ?? {};

    if (!dates || !Array.isArray(dates) || dates.length === 0) {
      return NextResponse.json({ error: "Datas são obrigatórias" }, { status: 400 });
    }

    // ── Buscar contexto do ministério ──────────────────────────────────

    // Membros ativos com roles aprovados
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
      }));

    // Músicas do repertório (top 30 mais recentes)
    const songs = await prisma.song.findMany({
      where: { groupId: user.groupId },
      select: { id: true, title: true, artist: true, originalKey: true, bpm: true },
      orderBy: { createdAt: "desc" },
      take: 30,
    });

    // ── Montar prompt ──────────────────────────────────────────────────

    const membersText = activeMembers.length > 0
      ? activeMembers.map((m) =>
          `- ${m.name}: funções=[${m.roles.join(", ") || "sem função definida"}]` +
          (m.availability?.length ? `, disponível=[${m.availability.join(", ")}]` : "") +
          (m.voiceType ? `, voz=${m.voiceType}` : "")
        ).join("\n")
      : "Nenhum membro cadastrado ainda.";

    const songsText = songs.length > 0
      ? songs.map((s) => `- ${s.title}${s.artist ? ` (${s.artist})` : ""}${s.originalKey ? ` | Tom: ${s.originalKey}` : ""}${s.bpm ? ` | BPM: ${s.bpm}` : ""}`).join("\n")
      : "Nenhuma música no repertório ainda.";

    const datesText = dates.join(", ");
    const obsText = observation?.trim() ? `\nObservação do líder: ${observation}` : "";

    const prompt = `Você é um assistente especializado em gestão de ministérios de louvor evangélicos brasileiros.

Seu trabalho é sugerir escalas de culto com base nos membros disponíveis e no repertório da igreja.

## Membros do ministério:
${membersText}

## Repertório disponível:
${songsText}

## Pedido:
O líder quer criar escalas para as seguintes datas: ${datesText}
Número de cultos por data: ${numServices ?? 1}${obsText}

## Instruções:
- Para cada data (e culto, se houver mais de um), sugira quem deve ministrar em cada função
- Priorize membros com a função correspondente cadastrada
- Tente equilibrar a participação (não sobrecarregar sempre os mesmos)
- Sugira entre 3 e 6 músicas por culto, variando estilos quando possível
- Se não houver músicas ou membros suficientes, preencha o que for possível e deixe o resto em branco
- Se um membro não tiver função definida mas o nome sugerir a função (ex: "João Guitarrista"), use o bom senso

## Formato de resposta:
Responda APENAS com JSON válido, sem texto antes ou depois, sem blocos de código markdown.
O JSON deve seguir exatamente esta estrutura:

{
  "schedules": [
    {
      "date": "YYYY-MM-DD",
      "time": "HH:MM ou null",
      "name": "nome do culto ou null",
      "roles": [
        { "role": "nome da função", "memberId": "id do membro ou null", "memberName": "nome do membro ou null" }
      ],
      "songs": [
        { "songId": "id da música", "title": "título", "key": "tom sugerido" }
      ],
      "aiNotes": "observações da IA sobre esta escala (opcional)"
    }
  ]
}

IDs dos membros para usar no JSON:
${activeMembers.map((m) => `${m.name}: "${m.id}"`).join(", ")}

IDs das músicas para usar no JSON:
${songs.map((s) => `${s.title}: "${s.id}"`).join(", ")}`;

    // ── Chamar Gemini ──────────────────────────────────────────────────
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 4096,
          },
        }),
      }
    );

    if (!geminiRes.ok) {
      const err = await geminiRes.text();
      console.error("[suggest-schedule] Gemini error:", err);
      return NextResponse.json({ error: "Erro ao consultar IA" }, { status: 500 });
    }

    const geminiData = await geminiRes.json();
    const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    // Parse defensivo do JSON
    let parsed: any;
    try {
      const clean = rawText
        .replace(/```json\s*/gi, "")
        .replace(/```\s*/g, "")
        .trim();
      parsed = JSON.parse(clean);
    } catch {
      // Tenta extrair JSON com regex
      const match = rawText.match(/\{[\s\S]*\}/);
      if (match) {
        try { parsed = JSON.parse(match[0]); }
        catch { return NextResponse.json({ error: "IA retornou formato inválido" }, { status: 500 }); }
      } else {
        return NextResponse.json({ error: "IA retornou formato inválido" }, { status: 500 });
      }
    }

    return NextResponse.json({
      schedules: parsed.schedules ?? [],
      context: {
        membersCount: activeMembers.length,
        songsCount: songs.length,
      },
    });
  } catch (error) {
    console.error("[suggest-schedule] error:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
