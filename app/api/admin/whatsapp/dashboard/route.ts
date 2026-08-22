export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { getFunnelPrisma } from "@/lib/funnel-db";

type MetricRow = {
  enviados: bigint;
  pulados: bigint;
  eventos_total: bigint;
  respostas_recebidas: bigint;
  nao_interessados: bigint;
  interessados: bigint;
  encaminhados_humano: bigint;
  opt_out: bigint;
};

function numberize(value: bigint | number | null | undefined) {
  return Number(value ?? 0);
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as { role?: string } | undefined;

    if (!session || user?.role !== "SUPERADMIN") {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    const db = getFunnelPrisma();

    const [metricRows, stateRows, segmentRows, conversationRows, eventRows] =
      await Promise.all([
        db.$queryRawUnsafe<MetricRow[]>(`
          SELECT
            COUNT(*) FILTER (WHERE e.event_type = 'SENT') AS enviados,
            COUNT(*) FILTER (WHERE e.event_type = 'SKIPPED') AS pulados,
            COUNT(*) AS eventos_total,
            (
              SELECT COUNT(*)
              FROM whatsapp_messages m
              WHERE m.direction = 'IN'
            ) AS respostas_recebidas,
            (
              SELECT COUNT(*)
              FROM whatsapp_conversations c
              WHERE c.state = 'NOT_INTERESTED'
            ) AS nao_interessados,
            (
              SELECT COUNT(*)
              FROM whatsapp_conversations c
              WHERE c.state IN (
                'WANTS_TO_KNOW_MORE',
                'WANTS_MORE_INFO',
                'INFO_PROVIDED'
              )
            ) AS interessados,
            (
              SELECT COUNT(*)
              FROM whatsapp_conversations c
              WHERE c.state = 'HANDED_TO_HUMAN'
            ) AS encaminhados_humano,
            (
              SELECT COUNT(*)
              FROM whatsapp_conversations c
              WHERE c.state = 'OPT_OUT'
                 OR c.opt_out = true
            ) AS opt_out
          FROM whatsapp_campaign_events e
        `),

        db.$queryRawUnsafe<Array<{ state: string; quantidade: bigint }>>(`
          SELECT state, COUNT(*) AS quantidade
          FROM whatsapp_conversations
          GROUP BY state
          ORDER BY quantidade DESC, state
        `),

        db.$queryRawUnsafe<
          Array<{
            segmento: string;
            event_type: string;
            reason: string;
            quantidade: bigint;
          }>
        >(`
          SELECT
            segmento,
            event_type,
            reason,
            COUNT(*) AS quantidade
          FROM whatsapp_campaign_events
          GROUP BY segmento, event_type, reason
          ORDER BY segmento, event_type, reason
        `),

        db.$queryRawUnsafe<
          Array<{
            conversation_id: bigint;
            customer_id: bigint | null;
            name: string | null;
            email: string | null;
            telefone: string;
            segmento: string;
            estado_atual: string;
            ultimo_evento: string;
            motivo_evento: string | null;
            opt_out: boolean;
            primeiro_envio: Date | null;
            ultima_interacao: Date | null;
            ultima_mensagem_recebida: string | null;
            ultima_mensagem_recebida_em: Date | null;
            ultima_mensagem_enviada_em: Date | null;
            ultimo_evento_em: Date | null;
          }>
        >(`
          WITH ultimo_evento AS (
            SELECT DISTINCT ON (
              COALESCE(
                'customer:' || source_customer_id::text,
                'phone:' || phone_normalized
              )
            )
              COALESCE(
                'customer:' || source_customer_id::text,
                'phone:' || phone_normalized
              ) AS event_key,
              event_type,
              reason,
              segmento,
              created_at AS evento_em
            FROM whatsapp_campaign_events
            ORDER BY
              COALESCE(
                'customer:' || source_customer_id::text,
                'phone:' || phone_normalized
              ),
              created_at DESC
          ),
          ultima_mensagem_in AS (
            SELECT DISTINCT ON (c.id)
              c.id AS conversation_id,
              m.content,
              m.created_at
            FROM whatsapp_messages m
            INNER JOIN whatsapp_conversations c
              ON c.id = m.conversation_id
            WHERE m.direction = 'IN'
            ORDER BY c.id, m.created_at DESC
          ),
          ultima_mensagem_out AS (
            SELECT DISTINCT ON (c.id)
              c.id AS conversation_id,
              m.created_at
            FROM whatsapp_messages m
            INNER JOIN whatsapp_conversations c
              ON c.id = m.conversation_id
            WHERE m.direction = 'OUT'
            ORDER BY c.id, m.created_at DESC
          )
          SELECT
            c.id AS conversation_id,
            c.source_customer_id AS customer_id,
            c.name,
            c.email,
            c.phone_normalized AS telefone,
            COALESCE(ue.segmento, 'NAO_INFORMADO') AS segmento,
            c.state AS estado_atual,
            COALESCE(ue.event_type, 'SEM_EVENTO') AS ultimo_evento,
            ue.reason AS motivo_evento,
            c.opt_out,
            c.initial_message_at AS primeiro_envio,
            c.last_interaction_at AS ultima_interacao,
            umi.content AS ultima_mensagem_recebida,
            umi.created_at AS ultima_mensagem_recebida_em,
            umo.created_at AS ultima_mensagem_enviada_em,
            ue.evento_em AS ultimo_evento_em
          FROM whatsapp_conversations c
          LEFT JOIN ultimo_evento ue
            ON ue.event_key =
              CASE
                WHEN c.source_customer_id IS NOT NULL
                  THEN 'customer:' || c.source_customer_id::text
                ELSE 'phone:' || c.phone_normalized
              END
          LEFT JOIN ultima_mensagem_in umi
            ON umi.conversation_id = c.id
          LEFT JOIN ultima_mensagem_out umo
            ON umo.conversation_id = c.id
          ORDER BY COALESCE(c.last_interaction_at, c.initial_message_at) DESC
          LIMIT 200
        `),

        db.$queryRawUnsafe<
          Array<{
            id: bigint;
            customer_id: bigint | null;
            order_id: bigint | null;
            name: string | null;
            email: string | null;
            telefone: string | null;
            segmento: string | null;
            event_type: string;
            reason: string | null;
            created_at: Date;
          }>
        >(`
          SELECT
            id,
            source_customer_id AS customer_id,
            order_id,
            name,
            email,
            phone_normalized AS telefone,
            segmento,
            event_type,
            reason,
            created_at
          FROM whatsapp_campaign_events
          ORDER BY created_at DESC, id DESC
          LIMIT 300
        `),
      ]);

    const rawMetrics = metricRows[0] ?? ({} as MetricRow);
    const enviados = numberize(rawMetrics.enviados);
    const pulados = numberize(rawMetrics.pulados);
    const respostas = numberize(rawMetrics.respostas_recebidas);

    return NextResponse.json({
      metrics: {
        enviados,
        pulados,
        eventosTotal: numberize(rawMetrics.eventos_total),
        respostasRecebidas: respostas,
        taxaRespostaPercentual:
          enviados > 0 ? Number(((respostas / enviados) * 100).toFixed(2)) : 0,
        naoInteressados: numberize(rawMetrics.nao_interessados),
        interessados: numberize(rawMetrics.interessados),
        encaminhadosHumano: numberize(rawMetrics.encaminhados_humano),
        optOut: numberize(rawMetrics.opt_out),
      },
      states: stateRows.map((row) => ({
        state: row.state,
        quantidade: numberize(row.quantidade),
      })),
      segments: segmentRows.map((row) => ({
        ...row,
        quantidade: numberize(row.quantidade),
      })),
      conversations: conversationRows.map((row) => ({
        ...row,
        conversation_id: numberize(row.conversation_id),
        customer_id: row.customer_id == null ? null : numberize(row.customer_id),
      })),
      events: eventRows.map((row) => ({
        ...row,
        id: numberize(row.id),
        customer_id: row.customer_id == null ? null : numberize(row.customer_id),
        order_id: row.order_id == null ? null : numberize(row.order_id),
      })),
    });
  } catch (error) {
    console.error("[admin/whatsapp/dashboard] GET error:", error);
    const message =
      error instanceof Error && error.message.includes("FUNNEL_DATABASE_URL")
        ? "Banco do funil não configurado"
        : "Erro ao consultar métricas do WhatsApp";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
