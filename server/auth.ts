import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { storage, pool } from "./storage";
import type { User } from "@shared/schema";

const PgSession = connectPgSimple(session);

export const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || "dev-secret-please-change",
  resave: false,
  saveUninitialized: false,
  store: new PgSession({ pool, createTableIfMissing: true }),
  cookie: {
    secure: false, // Railway handles TLS at proxy level; keep false to avoid cookie rejection
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
});

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      callbackURL: process.env.GOOGLE_CALLBACK_URL || "/auth/google/callback",
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        const user = await storage.upsertUser({
          googleId: profile.id,
          email: profile.emails?.[0]?.value ?? "",
          name: profile.displayName,
          avatarUrl: profile.photos?.[0]?.value ?? null,
        });
        done(null, user);
      } catch (e) {
        done(e as Error);
      }
    }
  )
);

passport.serializeUser((user: Express.User, done) => {
  done(null, (user as User).id);
});

passport.deserializeUser(async (id: number, done) => {
  try {
    const user = await storage.getUserById(id);
    done(null, user ?? false);
  } catch (e) {
    done(e);
  }
});

export { passport };
