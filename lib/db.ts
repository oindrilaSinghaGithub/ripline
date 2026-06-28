/**
 * Prisma client factory with Aurora IAM auth token rotation.
 *
 * Two modes — chosen automatically based on environment variables:
 *
 * Mode A — Standard password (recommended):
 *   Set DATABASE_URL in your .env.
 *   SSL cert verification is disabled for Aurora compatibility.
 *
 * Mode B — IAM authentication (no password set on cluster):
 *   Set AURORA_IAM_AUTH=true plus AWS env vars.
 *   Tokens are auto-rotated every 12 minutes.
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// ─── SSL-safe URL: strip sslmode from the URL string so we can pass
// ssl options directly — pg v8 overrides ssl:{} when sslmode= is in the URL
function stripSslParam(url: string): string {
  return url
    .replace(/[?&]sslmode=[^&]*/g, "")
    .replace(/[?&]uselibpqcompat=[^&]*/g, "")
    .replace(/\?$/, "")
    .replace(/&$/, "");
}

// ─── Mode A: Standard password ────────────────────────────────────────────────

function createClientFromUrl(url: string): PrismaClient {
  const cleanUrl = stripSslParam(url);

  const adapter = new PrismaPg({
    connectionString: cleanUrl,
    ssl: { rejectUnauthorized: false }, // Aurora uses AWS CA — skip local cert check
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });
}

// ─── Mode B: IAM token rotation ───────────────────────────────────────────────

type IamConfig = {
  host: string;
  port: number;
  user: string;
  db: string;
  region: string;
};

function getIamConfig(): IamConfig | null {
  const host = process.env.AWS_AURORA_HOST;
  if (!host) return null;
  return {
    host,
    port: parseInt(process.env.AWS_AURORA_PORT ?? "5432", 10),
    user: process.env.AWS_AURORA_USER ?? "postgres",
    db: process.env.AWS_AURORA_DB ?? "postgres",
    region: process.env.AWS_REGION ?? "us-east-1",
  };
}

async function generateIamToken(cfg: IamConfig): Promise<string> {
  const { Signer } = await import("@aws-sdk/rds-signer");
  const signer = new Signer({
    hostname: cfg.host,
    port: cfg.port,
    username: cfg.user,
    region: cfg.region,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      ...(process.env.AWS_SESSION_TOKEN
        ? { sessionToken: process.env.AWS_SESSION_TOKEN }
        : {}),
    },
  });
  return signer.getAuthToken();
}

async function createClientFromIam(cfg: IamConfig): Promise<PrismaClient> {
  const token = await generateIamToken(cfg);
  const url = `postgresql://${cfg.user}:${encodeURIComponent(token)}@${cfg.host}:${cfg.port}/${cfg.db}`;
  return createClientFromUrl(url);
}

// ─── Token rotation manager ───────────────────────────────────────────────────

class IamRotatingClient {
  private client: PrismaClient | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly cfg: IamConfig;
  private static readonly ROTATION_MS = 12 * 60 * 1000; // 3 min before 15-min expiry

  constructor(cfg: IamConfig) {
    this.cfg = cfg;
  }

  async getClient(): Promise<PrismaClient> {
    if (!this.client) {
      this.client = await createClientFromIam(this.cfg);
      this.scheduleRotation();
    }
    return this.client;
  }

  private scheduleRotation() {
    if (this.timer) return;
    this.timer = setInterval(async () => {
      try {
        const next = await createClientFromIam(this.cfg);
        const old = this.client;
        this.client = next;
        if (old) setTimeout(() => old.$disconnect().catch(() => {}), 5_000);
        console.info("[db] IAM token rotated");
      } catch (err) {
        console.error("[db] IAM token rotation failed:", err);
      }
    }, IamRotatingClient.ROTATION_MS);
    if (this.timer.unref) this.timer.unref();
  }
}

// ─── Singleton wiring ─────────────────────────────────────────────────────────

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
  // eslint-disable-next-line no-var
  var __iamRotator: IamRotatingClient | undefined;
}

export async function getDb(): Promise<PrismaClient> {
  const iamCfg =
    process.env.AURORA_IAM_AUTH === "true" ? getIamConfig() : null;

  if (iamCfg) {
    if (!globalThis.__iamRotator) {
      globalThis.__iamRotator = new IamRotatingClient(iamCfg);
    }
    return globalThis.__iamRotator.getClient();
  }

  return db;
}

function createStaticClient(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set.\n" +
        "Set it in .env (password mode) or set AURORA_IAM_AUTH=true with AWS env vars."
    );
  }
  return createClientFromUrl(url);
}

export const db: PrismaClient =
  globalThis.__prisma ?? createStaticClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = db;
}
