// // server/src/types/index.d.ts
import 'multer';
import 'express';

declare global {
  namespace Express {
    interface Request {
      file?: Express.Multer.File;
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