import type { Request, Response, NextFunction } from "express";
import { z } from "zod";

/** Uniform error responder: 400 for validation errors, 500 otherwise. */
export function handleError(res: Response, e: unknown) {
  if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors });
  res.status(500).json({ error: String(e) });
}

/** Session-auth guard for API routes. */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ error: "Unauthorized" });
}
