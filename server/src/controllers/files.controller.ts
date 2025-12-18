// server/src/controllers/files.controller.ts
import { Request, Response } from 'express';
import { query } from '../db/postgres';

export const uploadFile = async (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Файл не загружен' });
  }

  const { originalname, mimetype, buffer, size } = req.file;
  const userId = req.user!.id;

  try {
    const result = await query(
      `INSERT INTO files (user_id, original_name, filename, mimetype, size, data)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [userId, originalname, originalname, mimetype, size, buffer]
    );

    res.json({ message: 'Файл успешно загружен', fileId: result.rows[0].id });
  } catch (err: any) {
    console.error('Ошибка загрузки:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};


export const getFiles = async (req: Request, res: Response) => {
  console.log('Получение файлов для пользователя ID:', req.user!.id);
  try {
    const result = await query(
      `SELECT id, original_name, size, uploaded_at FROM files 
       WHERE user_id = $1 
       ORDER BY uploaded_at DESC`,
      [req.user!.id]
    );
    
    console.log('Найдено файлов в БД:', result.rowCount);
    console.log('Данные файлов:', result.rows);
    
    res.json({ files: result.rows });
  } catch (err) {
    console.error('Ошибка при получении файлов:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

export const downloadFile = async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const result = await query(
      `SELECT original_name, mimetype, data FROM files WHERE id = $1 AND user_id = $2`,
      [id, req.user!.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Файл не найден' });
    }

    const file = result.rows[0];
    res.set('Content-Type', file.mimetype);
    res.set('Content-Disposition', `attachment; filename="${encodeURIComponent(file.original_name)}"`);
    res.send(file.data);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

export const deleteFile = async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const result = await query(
      `DELETE FROM files WHERE id = $1 AND user_id = $2 RETURNING id`,
      [id, req.user!.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Файл не найден или нет прав' });
    }

    res.json({ message: 'Файл удалён' });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};