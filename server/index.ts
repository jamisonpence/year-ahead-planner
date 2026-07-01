import express, { type Request, Response, NextFunction } from "express";
import compression from "compression";
import helmet from "helmet";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { sessionMiddleware, passport } from "./auth";
import { initializeStorage, seedSystemRecipes } from "./storage";
import { createMcpRouter, createOAuthRouter, createOAuthEndpoints } from "./mylifos-mcp-server";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

// Security headers. CSP is disabled (the SPA loads inline styles/scripts and
// external images); crossOriginResourcePolicy is relaxed so Capacitor native
// builds (capacitor:// origin) can load images/assets from this server.
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: false,
  }),
);

// Gzip responses (JSON API payloads and static assets)
app.use(compression());

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

// Trust Railway's reverse proxy so HTTPS is detected correctly
app.set("trust proxy", 1);

// Session + Auth middleware (must come before routes)
app.use(sessionMiddleware);
app.use(passport.initialize());
app.use(passport.session());

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

// Request logging. Never log response bodies — they contain personal data
// (messages, health metrics, journal entries) that must not end up in logs.
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      log(`${req.method} ${path} ${res.statusCode} in ${duration}ms`);
    }
  });

  next();
});

(async () => {
  try {
    log("Starting up — initializing storage…");
    await initializeStorage();
    log("Storage initialized — seeding system recipes…");
    await seedSystemRecipes();
    log("System recipes seeded — registering routes…");
    await registerRoutes(httpServer, app);
    log("Routes registered.");

    // OAuth endpoints (required by MCP spec for Cowork/Claude connectors)
    app.use("/.well-known", createOAuthRouter());
    app.use("/oauth", createOAuthEndpoints());
    // MCP server (AI tool access)
    app.use("/mcp", createMcpRouter());

    app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";

      console.error("Internal Server Error:", err);

      if (res.headersSent) {
        return next(err);
      }

      return res.status(status).json({ message });
    });

    // importantly only setup vite in development and after
    // setting up all the other routes so the catch-all route
    // doesn't interfere with the other routes
    if (process.env.NODE_ENV === "production") {
      log("Production mode — serving static files.");
      serveStatic(app);
    } else {
      const { setupVite } = await import("./vite");
      await setupVite(httpServer, app);
    }

    // ALWAYS serve the app on the port specified in the environment variable PORT
    // Other ports are firewalled. Default to 5000 if not specified.
    // this serves both the API and the client.
    // It is the only port that is not firewalled.
    const port = parseInt(process.env.PORT || "5000", 10);
    httpServer.listen(
      {
        port,
        host: "0.0.0.0",
        reusePort: true,
      },
      () => {
        log(`serving on port ${port}`);
      },
    );
  } catch (startupErr) {
    console.error("FATAL: Server failed to start:", startupErr);
    process.exit(1);
  }
})();
