# Como testar a análise automática pela página

## 1) Subir o ambiente

```bash
docker compose up --build
```

Serviços esperados:
- App Next.js: `http://localhost:3000`
- API do worker de análise: `http://localhost:8001/health`

## 2) Fazer cadastro de música pela UI

Na página de cadastro de músicas:
1. Preencha **Título**.
2. Informe **YouTube URL** ou **Audio URL** (um dos dois).
3. Salve a música.

Ao salvar, a app envia job para `/jobs` com:
- `songId`
- `sourceType` (`YOUTUBE` ou `UPLOAD`)
- `sourceUrl`

## 3) Verificar andamento na própria página

Você deve ver os estados de análise:
- `PENDING` / `PROCESSING`: analisando
- `DONE`: análise concluída
- `FAILED`: falha

Se falhar, confira o campo `analysisError` no detalhe da música.

## 4) Verificar logs dos containers

```bash
docker compose logs -f app
docker compose logs -f audio_analysis
```

## 5) Teste rápido da API do worker (opcional)

```bash
curl http://localhost:8001/health
```

Retorno esperado:

```json
{"status":"ok"}
```

## 6) Causas comuns de falha

- `AUDIO_ANALYSIS_SERVICE_URL` ausente/inválida no container da app.
- Token divergente entre app e worker (`AUDIO_ANALYSIS_SERVICE_TOKEN`).
- Callback token divergente (`AUDIO_ANALYSIS_CALLBACK_TOKEN`).
- `APP_BASE_URL` do worker sem alcançar a app (`http://app:3000` no docker compose).
