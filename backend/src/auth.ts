import type { RequestHandler } from "express";
import { OAuth2Client } from "google-auth-library";
import { config } from "./config.js";
import { prisma } from "./db.js";

const google = new OAuth2Client(config.GOOGLE_CLIENT_ID);

/**
 * Expects `Authorization: Bearer <Google id_token>` (sent by the NextAuth frontend).
 * Verifies the token's signature + audience with Google, upserts the User, and sets req.user.
 */
export const requireAuth: RequestHandler = async (req, res, next) => {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: "Missing bearer token" });
    return;
  }

  let payload;
  try {
    const ticket = await google.verifyIdToken({ idToken: token, audience: config.GOOGLE_CLIENT_ID });
    payload = ticket.getPayload();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }
  if (!payload?.sub || !payload.email) {
    res.status(401).json({ error: "Token missing user info" });
    return;
  }

  const profile = { email: payload.email, name: payload.name ?? null, avatarUrl: payload.picture ?? null };
  req.user = await prisma.user.upsert({
    where: { googleId: payload.sub },
    update: profile,
    create: { googleId: payload.sub, ...profile },
  });
  next();
};
