# Módulo Comunicação — Arquitetura e Entregáveis

## 1) Arquitetura proposta (diagrama textual)

```text
[UI Next.js]
  ├─ /comunicados (lista + envio ADMIN/SUPERADMIN)
  └─ /chat-grupo (lista + envio membros + SSE)
          |
          v
[Next.js Route Handlers]
  ├─ GET/POST /api/groups/:groupId/broadcasts
  ├─ GET/POST /api/groups/:groupId/messages
  └─ GET /api/groups/:groupId/messages/stream (SSE)
          |
          v
[Service helpers em lib/messages.ts]
  ├─ sanitizeTextInput
  ├─ validateMessageContent (1..1000 chars)
  ├─ checkRateLimit (in-memory)
  └─ isBroadcastSenderRole
          |
          v
[Prisma ORM]
  ├─ GroupBroadcast
  └─ GroupMessage
          |
          v
[PostgreSQL]
```

## 2) Decisão de modelagem

**Decisão:** duas tabelas (`GroupMessage` e `GroupBroadcast`) em vez de uma tabela única com `type`.

**Justificativa:**
- Permissões diferentes por natureza (broadcast exige ADMIN/SUPERADMIN).
- Evolução independente (ex.: métricas e fluxos de leitura distintos).
- Queries mais simples/performáticas por canal sem filtros por tipo.

## 3) Prisma schema (resumo)

- `GroupMessage`: `id`, `groupId`, `senderUserId`, `content`, `createdAt`.
- `GroupBroadcast`: `id`, `groupId`, `senderUserId`, `senderRole`, `content`, `createdAt`.
- Relações adicionadas em `Group` e `User`.
- Índices: `(groupId, createdAt)` para paginação temporal.

## 4) Migração

Criada em:
- `prisma/migrations/20260301193000_add_group_communication/migration.sql`

Inclui:
- criação de tabelas,
- índices,
- FKs com cascade.

## 5) Endpoints e payloads

### Broadcasts
- `GET /api/groups/:groupId/broadcasts?take=20&cursor=<id>`
  - Auth + pertencimento ao grupo.
  - Retorna `{ items, nextCursor }`.
- `POST /api/groups/:groupId/broadcasts`
  - Somente ADMIN/SUPERADMIN.
  - Body:
    ```json
    { "content": "Culto especial às 19h" }
    ```

### Chat
- `GET /api/groups/:groupId/messages?take=30&cursor=<id>`
  - Auth + pertencimento ao grupo.
  - Retorna `{ items, nextCursor }` (histórico incremental).
- `POST /api/groups/:groupId/messages`
  - Auth + pertencimento ao grupo.
  - Body:
    ```json
    { "content": "Alguém pode levar extensão?" }
    ```
- `GET /api/groups/:groupId/messages/stream`
  - SSE para atualização em tempo real (com heartbeat + polling backend de 3s).

## 6) Segurança implementada

- Autenticação via sessão (`getServerSession`).
- Autorização por:
  - role (broadcast ADMIN/SUPERADMIN),
  - pertencimento ao grupo (`user.groupId === groupId`, exceto SUPERADMIN).
- Sanitização: remove `<` e `>` + trim + normalização de espaços.
- Validação:
  - texto obrigatório,
  - limite de 1000 caracteres.
- Rate limit básico in-memory por usuário+grupo:
  - chat: até 5 req / 10s,
  - broadcast: até 2 req / 60s.

## 7) UX implementada

- **Tela Comunicados** (`/comunicados`)
  - ADMIN/SUPERADMIN vê textarea + botão enviar.
  - Todos os membros veem lista paginada.
  - Exibe remetente + role + data/hora.
- **Tela Chat do Grupo** (`/chat-grupo`)
  - Input fixado no rodapé.
  - Lista de mensagens com remetente + horário.
  - Estado de "Enviando..." no botão.
  - Carregamento incremental de histórico + SSE.

## 8) Checklist de testes (proposto)

### Unitários
- `sanitizeTextInput`:
  - remove tags e espaços extras.
- `validateMessageContent`:
  - falha vazio,
  - falha >1000,
  - sucesso para limite exato.
- `checkRateLimit`:
  - bloqueia após limite,
  - retorna `retryAfterSeconds`.

### Integração/API
- chat:
  - 401 sem sessão,
  - 403 fora do grupo,
  - 201 payload válido,
  - 429 spam.
- broadcast:
  - 403 para MEMBER/LEADER,
  - 201 ADMIN/SUPERADMIN,
  - 400 vazio.

### E2E
- ADMIN envia comunicado e MEMBER enxerga.
- Membro envia mensagem no chat e outra aba atualiza por SSE.
- Paginação (cursor) funciona sem duplicar itens.

## 9) Casos de borda

- Usuário sem `groupId`: bloqueio de acesso nas telas e endpoints.
- Reconexão SSE: cliente fecha conexão em erro (fallback natural para refresh manual).
- Duplicidade visual por SSE + POST resolvida por deduplicação por `id` no estado.

## 10) Plano de rollout (feature flag + monitoramento)

### Feature flag
Sugestão de flags:
- `FEATURE_GROUP_CHAT=true|false`
- `FEATURE_GROUP_BROADCAST=true|false`

Aplicar:
- no sidebar (exibir menu condicional),
- nos endpoints (retornar 404/403 quando desabilitado),
- inicialmente habilitar para 1 grupo piloto.

### Monitoramento
- métricas mínimas:
  - taxa de erro 4xx/5xx por endpoint,
  - latência p95,
  - mensagens por minuto por grupo,
  - eventos 429 (spam).
- logs estruturados com `groupId`, `userId`, `route`, `statusCode`.
- alertas:
  - aumento súbito de 5xx,
  - pico anormal de 429.
