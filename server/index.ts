import express, { type Request, type Response, type NextFunction } from "express";
import { createServer } from "http";
import { and, eq, isNull } from "drizzle-orm";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { db } from "./db";
import { categories } from "@shared/schema";
import {
  OFFICIAL_AI_CATEGORIES,
  normalizeOfficialCategoryName,
} from "@shared/official-ai-categories";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined;

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

      log(logLine);
    }
  });

  next();
});

async function syncOfficialDefaultCategories() {
  const existingDefaults = await db
    .select()
    .from(categories)
    .where(and(eq(categories.isDefault, true), isNull(categories.userId)));

  const officialByName = new Map(
    OFFICIAL_AI_CATEGORIES.map((category) => [category.name, category] as const)
  );

  const groupedByNormalizedName = new Map<string, typeof existingDefaults>();

  for (let i = 0; i < existingDefaults.length; i += 1) {
    const row = existingDefaults[i];
    const normalizedName = normalizeOfficialCategoryName(row.name);
    const current = groupedByNormalizedName.get(normalizedName) ?? [];
    current.push(row);
    groupedByNormalizedName.set(normalizedName, current);
  }

  const groupedEntries = Array.from(groupedByNormalizedName.entries());

  for (let i = 0; i < groupedEntries.length; i += 1) {
    const [normalizedName, rows] = groupedEntries[i];
    const official = officialByName.get(normalizedName);

    if (!official) {
      for (let j = 0; j < rows.length; j += 1) {
        await db
          .update(categories)
          .set({ isDefault: false })
          .where(eq(categories.id, rows[j].id));
      }
      continue;
    }

    const sortedRows = rows
      .slice()
      .sort(
        (
          a: (typeof existingDefaults)[number],
          b: (typeof existingDefaults)[number]
        ) => a.id - b.id
      );

    const primary = sortedRows[0];
    const duplicates = sortedRows.slice(1);

    await db
      .update(categories)
      .set({
        name: official.name,
        type: official.type,
        icon: official.icon,
        isDefault: true,
        userId: null,
      })
      .where(eq(categories.id, primary.id));

    for (let j = 0; j < duplicates.length; j += 1) {
      await db
        .update(categories)
        .set({ isDefault: false })
        .where(eq(categories.id, duplicates[j].id));
    }
  }

  const refreshedDefaults = await db
    .select()
    .from(categories)
    .where(and(eq(categories.isDefault, true), isNull(categories.userId)));

  const refreshedNames = new Set(
    refreshedDefaults.map((row) => normalizeOfficialCategoryName(row.name))
  );

  for (let i = 0; i < OFFICIAL_AI_CATEGORIES.length; i += 1) {
    const official = OFFICIAL_AI_CATEGORIES[i];

    if (!refreshedNames.has(official.name)) {
      await db.insert(categories).values({
        userId: null,
        name: official.name,
        type: official.type,
        icon: official.icon,
        isDefault: true,
      });
    }
  }
}

(async () => {
  await syncOfficialDefaultCategories();
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  const PORT = Number(process.env.PORT) || 8888;

  app.listen(PORT, () => {
    console.log(`API listening on http://localhost:${PORT}`);
  });
})();