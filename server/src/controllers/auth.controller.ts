// server/src/controllers/auth.controller.ts
import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { query } from '../db/postgres';

const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_EXPIRES = '7d';

export const register = async (req: Request, res: Response) => {
  const { email, password, name, role = 'student' } = req.body;

  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Email, password, name required' });
  }

  const hashed = await bcrypt.hash(password, 10);

  try {
    const result = await query(
      'INSERT INTO users (email, password, name, role) VALUES ($1, $2, $3, $4) RETURNING id, email, name, role',
      [email, hashed, name, role]
    );

    const user = result.rows[0];

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: 'strict',
    });

    return res.json({ user });
  } catch (err: any) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'User already exists' });
    }
    console.error('Register error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};


export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  const result = await query('SELECT * FROM users WHERE email = $1', [email]);
  const user = result.rows[0];

  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );

  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    sameSite: 'strict',
  });

  return res.json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  });
};


export const me = async (req: Request, res: Response) => {
  return res.json({ user: req.user });
};

export const logout = async (req: Request, res: Response) => {
  res.cookie('token', '', { maxAge: 0 });
  return res.json({ message: 'Logged out' });
};