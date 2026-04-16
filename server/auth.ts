import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import session from "express-session";
import createMemoryStore from "memorystore";
import { storage } from "./storage";
import type { User } from "@shared/schema";

const MemoryStore = createMemoryStore(session);

export const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || "dev-secret-please-change",
  resave: false,
  saveUninitialized: false,
  store: new MemoryStore({ checkPeriod: 86400000 }), // prune expired entries every 24h
  cookie: {
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
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
    (_accessToken, _refreshToken, profile, done) => {
      try {
        const user = storage.upsertUser({
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

passport.deserializeUser((id: number, done) => {
  try {
    const user = storage.getUserById(id);
    done(null, user ?? false);
  } catch (e) {
    done(e);
  }
});

export { passport };
