// // server/src/types/index.d.ts
// import 'express';

// declare global {
//   namespace Express {
//     interface Request {
//       user?: {
//         id: number;
//         email: string;
//         role: string;
//       };
//     }
//   }
// }

// server/src/types/index.d.ts
// import 'express';

// declare module 'express-serve-static-core' {
//   interface Request {
//     user?: {
//       id: number;
//       email: string;
//       role: string;
//     };
//   }
// }
import 'express';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        email: string;
        name: string;
        role: 'student' | 'teacher' | 'admin';
      };
    }
  }
}