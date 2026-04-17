# === Этап 1: Сборка фронтенда (Vue + Vite) ===
FROM node:20-alpine AS frontend-builder

WORKDIR /app/client

# Копируем только package*.json для кэширования зависимостей
COPY client/package*.json ./
RUN npm ci

# Копируем исходники фронта и собираем
COPY client/ ./
RUN npm run build

# === Этап 2: Сборка бэкенда ===
FROM node:20-alpine AS backend-builder

WORKDIR /app/server

COPY server/package*.json ./
RUN npm ci --only=production

COPY server/ ./
RUN npx tsc

# === Этап 3: Финальный образ ===
FROM node:20-alpine

WORKDIR /app

# Копируем собранный бэкенд
COPY --from=backend-builder /app/server/dist ./dist
COPY --from=backend-builder /app/server/node_modules ./node_modules
COPY --from=backend-builder /app/server/package*.json ./

# Копируем собранную статику фронта
COPY --from=frontend-builder /app/client/dist ./public

# Переменная для порта (Amvera может переопределять)
ENV PORT=80

EXPOSE 80

# Запуск сервера
CMD ["node", "dist/index.js"]