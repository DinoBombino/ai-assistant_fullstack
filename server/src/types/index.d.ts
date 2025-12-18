// // server/src/types/index.d.ts
import 'express';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        email: string;
        name: string;
        role: 'student' | 'teacher' | 'admin';
        // role: string[];  
      };
    }
  }
}