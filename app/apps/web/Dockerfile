# Image de production du serveur Next.js (utilisée par deploy/docker-compose.yml). Construire depuis la racine :
#   docker build -f apps/web/Dockerfile -t six-web .
FROM node:22.22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /repo

FROM base AS builder
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL     NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY     NEXT_OUTPUT=standalone NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN pnpm install --frozen-lockfile
# Petit serveur (1 Go + échange) : types déjà vérifiés avant l'envoi ; Node peut déborder sur l'échange.
ENV SIX_SANS_VERIF_TYPES=1 NODE_OPTIONS=--max-old-space-size=1536
RUN pnpm --filter "@six/web..." build

FROM node:22.22-alpine AS runtime
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000 NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=builder --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=builder --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=node:node /repo/apps/web/public ./apps/web/public
RUN mkdir -p /app/travail && chown node:node /app/travail
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
