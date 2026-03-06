# Запуск проекта

## Фронтенд

```bash
cd client
npm run dev
```

## После запуска:
```
➜  Local:   http://localhost:3000/
➜  Network: use --host to expose
➜  press h + enter to show help
```

---

## Бэкенд

```bash
cd server
npm run dev
```

## После запуска:
```
Server running on port 5000
```

---

## База данных. В корне проекта
```bash
docker-compose up -d
```
**-d для запуска в фоне**

---
## Стэк технологий

**Фронтенд:**  
- Vue 3  
- Vite  
- TypeScript  
- Bootstrap  

**Бэкенд:**  
- Node.js  
- Express  
- TypeScript  

**База данных:**  
- Для авторизации запускается контейнер с БД - PostgreSQL
- Для ии-модели запускается в том же контейнере векторная БД - SurrealDB

## Установка необходимых зависимостей/библиотек
## 1. В корне проекта
```bash
npm install
```


## 2. Во фронтенде
```bash
cd client
npm install
```

## 3. В бэкенде
```bash
cd server
npm install
```