# Detecção automática de BPM e TOM

## 1) Arquitetura sugerida

```text
[Next.js UI]
  -> POST /api/songs (cadastro com youtubeUrl ou audioUrl)
  -> Prisma cria Song com analysisStatus=PENDING
  -> enqueueSongAnalysis(songId)
      -> envia job para AUDIO_ANALYSIS_SERVICE_URL/jobs

[Python Audio Worker]
  -> recebe job
  -> marca PROCESSING (opcional no backend)
  -> baixa trecho de 60-90s (YouTube) ou arquivo do storage
  -> detecta BPM + key/mode + confiança
  -> POST /api/songs/:id/analysis-result

[Next API callback]
  -> atualiza Song: bpmDetected/keyDetected/confidence*/analysisStatus

[UI]
  -> GET /api/songs/:id e lista /api/songs
  -> renderiza estado: Analisando / Detectado / Falha
  -> usuário pode sobrescrever via PUT /api/songs/:id
```

## 2) Estratégia técnica recomendada

- **Heurística primeiro (librosa/chroma CQT)**: baixo custo, sem dependência de GPU e rápido para uso de igreja.
- **Fallback IA opcional (somente quando confiança baixa)**: enviar para um modelo de key detection apenas quando `confidenceKey < 0.45`.
- **Fila**: BullMQ + Redis (ou Cloud Tasks/SQS) para não travar cadastro.
- **YouTube**: priorizar upload próprio por termos de uso. Se usar YouTube, restringir a trecho curto para reduzir custo e latência.

## 3) Modelagem Prisma adicionada

Campos adicionados no `Song`:

- `sourceType`: `YOUTUBE | UPLOAD`
- `analysisStatus`: `PENDING | PROCESSING | DONE | FAILED`
- `analysisError`
- `bpmDetected`, `keyDetected`, `modeDetected`
- `confidenceBpm`, `confidenceKey`
- `bpmUserOverride`, `keyUserOverride`

## 4) Endpoints base

- `POST /api/songs`
  - cria música
  - define status inicial da análise
  - enfileira job se houver `youtubeUrl` ou `audioUrl`
- `POST /api/songs/:id/analyze`
  - força reanálise manual
- `GET /api/songs/:id`
  - retorna música com `bpmEffective` e `keyEffective`
- `POST /api/songs/:id/analysis-result`
  - callback interno do worker para persistir resultado

## 5) UX recomendada

- Badge por status:
  - `PENDING` / `PROCESSING`: “Analisando…”
  - `DONE`: “Detectado automaticamente”
  - `FAILED`: “Falha na análise — preencha manualmente”
- Sempre permitir editar BPM/Tom manualmente.
- Mostrar “Detectado vs Ajustado por você” no formulário.
- Botão “Reanalisar” chama `POST /api/songs/:id/analyze`.

## 6) Erros e bordas

- **Variação de tempo**: mostrar BPM principal; opcionalmente guardar `bpmRange` no futuro.
- **Ao vivo/ruído**: filtrar silêncio, usar trecho central, aumentar tolerância de confiança.
- **Tons ambíguos**: se confiança baixa, não sobrescrever campos manuais.
- **Link inválido**: status `FAILED` + `analysisError` amigável.

## 7) Rollout

1. Feature flag (`AUDIO_ANALYSIS_ENABLED`).
2. Grupo piloto.
3. Medir:
   - taxa de sucesso da análise
   - tempo médio por job
   - taxa de override manual (proxy de qualidade)
4. Logs estruturados com `songId`, `sourceType`, `duration_ms`, `status`.
