import "express-serve-static-core";

declare global {
  namespace Express {
    interface Request {
      login(user: unknown, callback: (error?: unknown) => void): void;
      logout(callback: (error?: unknown) => void): void;
      isAuthenticated(): boolean;
    }
  }
}

export {};
