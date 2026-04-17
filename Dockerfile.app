# === Этап 1: Сборка фронтенда (Vue + Vite) ===
FROM node:20-alpine AS frontend-builder

WORKDIR /app/client

COPY client/package*.json ./
RUN npm ci

COPY client/ ./
RUN npm run build

# === Этап 2: Сборка бэкенда (с типами) ===
FROM node:20-alpine AS backend-builder

WORKDIR /app/server

# Копируем package.json и устанавливаем ВСЕ зависимости (включая dev)
COPY server/package*.json ./
RUN npm ci

# Копируем исходники и компилируем TypeScript
COPY server/ ./
RUN npx tsc

# === Этап 3: Финальный образ (только production) ===
FROM node:20-alpine

WORKDIR /app

# Копируем package.json для production зависимостей
COPY server/package*.json ./

# Устанавливаем ТОЛЬКО production зависимости
RUN npm ci --omit=dev

# Копируем скомпилированный бэкенд
COPY --from=backend-builder /app/server/dist ./dist

# Копируем собранную статику фронта
COPY --from=frontend-builder /app/client/dist ./public

ENV PORT=80

EXPOSE 80

CMD ["node", "dist/index.js"]