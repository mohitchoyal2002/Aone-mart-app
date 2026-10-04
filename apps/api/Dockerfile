FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/mobile/package.json ./apps/mobile/package.json
RUN npm ci --workspace @aone/api
COPY apps/api/tsconfig.json ./apps/api/tsconfig.json
COPY apps/api/src ./apps/api/src
RUN npm run build --workspace @aone/api && npm prune --omit=dev --workspace @aone/api
FROM node:24-bookworm-slim
ENV NODE_ENV=production PORT=4000 DATABASE_PATH=/data/aone.sqlite
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./dist
COPY apps/api/package.json ./
COPY apps/api/start-server.sh ./start-server.sh
RUN mkdir /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 4000
CMD ["sh","./start-server.sh"]
