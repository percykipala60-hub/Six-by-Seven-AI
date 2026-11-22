# Image de production de l'API. Construire depuis la racine :
#   docker build -f apps/api/Dockerfile -t six-api .
FROM node:22.22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /repo

FROM base AS builder
COPY . .
RUN pnpm install --frozen-lockfile
# « ... » : construit aussi les paquets dont l'API dépend (@six/shared).
RUN pnpm --filter "@six/api..." build
RUN pnpm --filter @six/api deploy --prod --legacy /out

FROM node:22.22-alpine AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4000
WORKDIR /app
COPY --from=builder --chown=node:node /out ./
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/health || exit 1
CMD ["node", "dist/server.js"]
