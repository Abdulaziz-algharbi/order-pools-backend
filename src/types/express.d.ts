// import type { IUser } from "../services/users/user.model";

export {};

declare global {
  namespace Express {
    // interface User extends IUser {
    //   _id: string;
    // }

    // interface AuthInfo {
    //   message?: string;
    // }

    interface Request {
      meta: {
        user?: {
          userId: string;
        };
      };
    }
  }
}
