FROM surrealdb/surrealdb:latest

# Официальный образ запускается от непривилегированного пользователя.
# Для корректной работы с дисками на Amvera меняем на root (как в твоём docker-compose)
USER root

# Порт, на котором слушает SurrealDB
EXPOSE 8000

# Запуск базы с использованием движка RocksDB и пути к данным
CMD ["start", "--log", "info", "rocksdb:/data/surreal"]