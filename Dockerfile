# Brawl Dashboard pour une machine allumée 24 h/24 (Raspberry Pi, NAS, serveur…).
# docker compose up -d   (voir docker-compose.yml)
FROM node:24-slim

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --include=dev --no-audit --no-fund

COPY . .
RUN npm run build

ENV HOST=0.0.0.0 PORT=4777 DATA_DIR=/app/data
EXPOSE 4777
VOLUME ["/app/data"]

CMD ["node", "--import", "tsx", "server/index.ts"]
