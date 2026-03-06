// server/src/controllers/files.controller.ts
import { Request, Response } from 'express';
import { query } from '../db/postgres';
// import { deleteFileDocument, upsertFileDocument } from '../db/surreal';
import {
  deleteFileChunksByDocumentId,
  deleteFileDocument,
  getChunkCountByDocumentId,
  upsertFileChunks,
  upsertFileDocument,
} from '../db/surreal';

import {
  ALLOWED_MIME_TYPES,
  buildContentDigest,
  buildSurrealDocumentId,
  chunkText,
  extractTextFromFile,
  getMaxFileSizeBytes,
  resolveFileScope,
} from '../services/file-ingest.service';
import { embedChunksForDocument } from '../services/rag.service';

const withOwnershipFilter = (baseQuery: string): string => {
  const sharedMode = String(process.env.FILES_SHARED_MODE || 'false').toLowerCase() === 'true';
  return sharedMode ? baseQuery : `${baseQuery} AND user_id = $2`;
};

export const uploadFile = async (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Файл не загружен' });
  }

  const { originalname, mimetype, buffer, size } = req.file;
  const userId = req.user!.id;

if (!ALLOWED_MIME_TYPES.has(mimetype)) {
    return res.status(400).json({ error: 'Допустимы только DOCX файлы' });
  }

  const maxSize = getMaxFileSizeBytes();
  if (size > maxSize) {
    return res.status(413).json({ error: `Размер файла превышает лимит ${Math.floor(maxSize / (1024 * 1024))} MB` });
  }

  let textContent = '';
  try {
    textContent = await extractTextFromFile(buffer, mimetype);
  } catch (error: any) {
    return res.status(422).json({ error: `Не удалось извлечь текст из файла: ${error?.message || 'unknown error'}` });
  }

  if (!textContent) {
    return res.status(422).json({ error: 'Файл не содержит извлекаемого текста' });
  }

  const scope = resolveFileScope(userId);
  const surrealDocumentId = buildSurrealDocumentId(scope);
  const contentDigest = buildContentDigest(buffer);
  const uploadedAt = new Date();
  const chunks = chunkText(textContent);

  if (chunks.length === 0) {
    return res.status(422).json({ error: 'Текст документа слишком короткий для разбиения на чанки' });
  }

  try {
    await upsertFileDocument({
      id: surrealDocumentId,
      scope,
      userId,
      originalName: originalname,
      mimeType: mimetype,
      size,
      textContent,
      contentDigest,
      uploadedAtIso: uploadedAt.toISOString(),
    });

    await upsertFileChunks(chunks.map((chunk) => ({
      docId: surrealDocumentId,
      scope,
      userId,
      chunkIndex: chunk.index,
      content: chunk.content,
      uploadedAtIso: uploadedAt.toISOString(),
    })));

    const embeddingResult = await embedChunksForDocument(surrealDocumentId, chunks);

    try {
      const result = await query(
        `INSERT INTO files (user_id, original_name, filename, mimetype, size, data, surreal_doc_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [userId, originalname, originalname, mimetype, size, buffer, surrealDocumentId]
      );

      const chunkCount = await getChunkCountByDocumentId(surrealDocumentId);

      return res.json({
        message: 'Файл успешно загружен',
        fileId: result.rows[0].id,
        surrealSynced: true,
        extractedChars: textContent.length,
        chunksCount: chunkCount,
        embeddingStatus: embeddingResult.status,
        embeddingMessage: embeddingResult.message,
      });
    } catch (pgError) {
      await deleteFileChunksByDocumentId(surrealDocumentId);
      await deleteFileDocument(surrealDocumentId);
      throw pgError;
    }


///
  } catch (err: any) {
    console.error('Ошибка загрузки:', err);
    // res.status(500).json({ error: 'Ошибка сервера' });
    ///
    return res.status(500).json({ error: 'Ошибка сохранения в базе данных' });
    ///
  }
};

export const getFiles = async (req: Request, res: Response) => {
  console.log('Получение файлов для пользователя ID:', req.user!.id);
  try {
    // const result = await query(
    //   `SELECT id, original_name, size, uploaded_at FROM files 
    //    WHERE user_id = $1 
    //    ORDER BY uploaded_at DESC`,
    //   [req.user!.id]
    // );
    
    // console.log('Найдено файлов в БД:', result.rowCount);
    // console.log('Данные файлов:', result.rows);

    ///
    const sharedMode = String(process.env.FILES_SHARED_MODE || 'false').toLowerCase() === 'true';
    const sql = sharedMode
      ? `SELECT id, original_name, size, uploaded_at, (surreal_doc_id IS NOT NULL) as indexed_in_surreal
         FROM files
         ORDER BY uploaded_at DESC`
      : `SELECT id, original_name, size, uploaded_at, (surreal_doc_id IS NOT NULL) as indexed_in_surreal
         FROM files
         WHERE user_id = $1
         ORDER BY uploaded_at DESC`;

    const result = sharedMode ? await query(sql) : await query(sql, [req.user!.id]);
///
    
    res.json({ files: result.rows });
  } catch (err) {
    console.error('Ошибка при получении файлов:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

export const downloadFile = async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    ///
    const sql = withOwnershipFilter('SELECT original_name, mimetype, data FROM files WHERE id = $1');
    const params = String(process.env.FILES_SHARED_MODE || 'false').toLowerCase() === 'true'
      ? [id]
      : [id, req.user!.id];

    const result = await query(sql, params);
    ///

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Файл не найден' });
    }

    const file = result.rows[0];
    res.set('Content-Type', file.mimetype);
    res.set('Content-Disposition', `attachment; filename="${encodeURIComponent(file.original_name)}"`);
    // res.send(file.data);
    ///
    return res.send(file.data);
    ///
  } catch (err) {
    // res.status(500).json({ error: 'Ошибка сервера' });
    ///
    return res.status(500).json({ error: 'Ошибка сервера' });
    ///
  }
};

export const deleteFile = async (req: Request, res: Response) => {
  const { id } = req.params;
  ///
  const sharedMode = String(process.env.FILES_SHARED_MODE || 'false').toLowerCase() === 'true';  ///
  try {
    // const result = await query(
    //   `DELETE FROM files WHERE id = $1 AND user_id = $2 RETURNING id`,
    //   [id, req.user!.id]
    // );
    ///
    const selectSql = sharedMode
      ? `SELECT id, surreal_doc_id FROM files WHERE id = $1`
      : `SELECT id, surreal_doc_id FROM files WHERE id = $1 AND user_id = $2`;
    const selectParams = sharedMode ? [id] : [id, req.user!.id];
    const existing = await query(selectSql, selectParams);
    ///

    // if (result.rowCount === 0) {
    if (existing.rowCount === 0) {
      return res.status(404).json({ error: 'Файл не найден или нет прав' });
    }

    // res.json({ message: 'Файл удалён' });
    ///
    const surrealDocId: string | null = existing.rows[0].surreal_doc_id;
    if (surrealDocId) {
      await deleteFileChunksByDocumentId(surrealDocId);
      await deleteFileDocument(surrealDocId);
    }

    const deleteSql = sharedMode
      ? `DELETE FROM files WHERE id = $1 RETURNING id`
      : `DELETE FROM files WHERE id = $1 AND user_id = $2 RETURNING id`;
    const deleteParams = sharedMode ? [id] : [id, req.user!.id];
    await query(deleteSql, deleteParams);

    return res.json({ message: 'Файл удалён' });
    ///
  } catch (err) {
    // res.status(500).json({ error: 'Ошибка сервера' });
    ///
    console.error('Ошибка удаления файла:', err);
    return res.status(500).json({ error: 'Ошибка удаления файла' });
    ///
  }
};