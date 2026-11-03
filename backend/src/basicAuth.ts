import type { RequestHandler } from "express";
import crypto from "node:crypto";

// Constant-time string compare (avoids leaking the password via response timing).
function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/** HTTP Basic auth — used to protect Bull Board, which can retry/delete jobs. */
export function basicAuth(user: string, pass: string): RequestHandler {
  return (req, res, next) => {
    const header = req.headers.authorization ?? "";
    if (header.startsWith("Basic ")) {
      const decoded = Buffer.from(header.slice(6), "base64").toString();
      const i = decoded.indexOf(":");
      if (i >= 0 && safeEqual(decoded.slice(0, i), user) && safeEqual(decoded.slice(i + 1), pass)) {
        return next();
      }
    }
    res.set("WWW-Authenticate", 'Basic realm="Bull Board"').status(401).send("Authentication required");
  };
}
