# ─── Stage 1: deps ───────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma

RUN npm install --legacy-peer-deps || npm install --legacy-peer-deps

# ─── Stage 2: builder ────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV NEXT_OUTPUT_MODE=standalone
ENV SKIP_ENV_VALIDATION=1
ENV STRIPE_SECRET_KEY=sk_build_placeholder
ENV STRIPE_WEBHOOK_SECRET=whsec_placeholder
ENV NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_build_placeholder
ENV NEXTAUTH_SECRET=build_placeholder
ENV NEXTAUTH_URL=https://liderweb.multitrackgospel.com
ENV DATABASE_URL=postgresql://user:pass@localhost:5432/db

# Garantir que o Prisma client é gerado com o schema correto
# Evita erros de "field not found" quando schema foi atualizado
RUN npx prisma generate

RUN npm run build

# ─── Stage 3: runner ─────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nextjs

# ffmpeg para conversão de áudio (WAV → MP3)
RUN apk add --no-cache ffmpeg

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./app/.next/static
COPY --from=builder /app/public ./app/public

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "app/server.js"]
