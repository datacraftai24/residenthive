import dotenv from "dotenv";
dotenv.config();

import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { log } from "./vite";

// ESM-safe __dirname for all path handling
import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Log critical envs at boot
console.log("ENV CHECK DATABASE_URL:", process.env.DATABASE_URL);

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Logging middleware: unchanged, still best practice
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }
      log(logLine);
    }
  });

  next();
});
app.get('/ip', async (_req, res) => {
  try {
    const { default: fetch } = await import('node-fetch');
    const response = await fetch('https://api.ipify.org');
    const ip = await response.text();
    res.send(`Outbound IP is: ${ip}`);
  } catch (err) {
    res.status(500).send('Error fetching IP');
  }
});


// Health check for deploy monitoring
app.get('/health', async (_req: Request, res: Response) => {
  const healthData = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0',
    database: {
      status: 'unknown',
      connection: false
    }
  };

  try {
    const { healthCheck } = await import('./db.js');
    const isDbHealthy = await healthCheck();
    healthData.database.status = isDbHealthy ? 'healthy' : 'unhealthy';
    healthData.database.connection = isDbHealthy;
    
    if (!isDbHealthy) {
      healthData.status = 'degraded';
    }
  } catch (error) {
    console.error('Health check database error:', error);
    healthData.database.status = 'error';
    healthData.database.connection = false;
    healthData.status = 'degraded';
  }

  const statusCode = healthData.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(healthData);
});

(async () => {
  // Register all custom routes first
  await registerRoutes(app);
  
  // Test database connection on startup
  console.log('🔍 Testing database connection during startup...');
  try {
    const { testConnection } = await import('./db.js');
    const isDbConnected = await testConnection();
    if (!isDbConnected) {
      console.error('❌ Database connection failed during startup. Application may not work correctly.');
      // Don't exit in Cloud Run - let it attempt to serve static content and health check
      // process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error importing or testing database connection:', error);
    // Don't exit in Cloud Run - let it attempt to serve static content
  }

  // Robust error handler
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
    throw err;
  });
  // === STATIC FILES: PRODUCTION-SAFE, NEVER-UNDEFINED ===
  if (process.env.NODE_ENV === "production") {
    // Always serve from 'public' inside /app/dist
    const staticDir = process.env.STATIC_DIR || "public";
    console.log("STATIC_DIR:", staticDir);
    console.log("__dirname:", __dirname);
    const resolvedStatic = path.resolve(__dirname, staticDir);
    console.log("Resolved static path:", resolvedStatic);

    if (!staticDir) {
      throw new Error("STATIC_DIR environment variable is undefined or empty.");
    }

    // Serve static files, no chance of undefined
    app.use(express.static(resolvedStatic));

    // Optional: Fallback for SPA routing
    app.get("*", (req, res) => {
      res.sendFile(path.join(resolvedStatic, "index.html"));
    });
  }

  // === SERVER STARTUP ===
  // Use Cloud Run's PORT or 5000 locally (Cloud Run injects PORT=8080)
  const port = parseInt(process.env.PORT || "5000");

  const server = app.listen(port, "0.0.0.0", () => {
    log(`[express] serving on port ${port}`);
  });

  // Setup Vite for hot reload in dev, AFTER all other routes (unchanged logic)
  if (app.get("env") === "development") {
    const { setupVite } = await import("./vite.js");
    await setupVite(app, server);
  } else {
    // In prod, optional: serveStatic or other prod optimizations
    try {
      const { serveStatic } = await import("./vite.js");
      if (typeof serveStatic === "function") {
        serveStatic(app);
      }
    } catch (err) {
      // OK if not present, we're already serving static above
    }
  }
})();

