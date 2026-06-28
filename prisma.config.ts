import "dotenv/config";
import path from "node:path";
import type { PrismaConfig } from "prisma";

/**
 * Build the migration URL for Aurora.
 *
 * Prisma's migration engine uses its own Rust TLS stack and validates the
 * server certificate properly — it does not honour rejectUnauthorized:false.
 * We point it at the downloaded AWS RDS CA bundle instead of skipping SSL.
 *
 * The bundle lives at prisma/rds-ca.pem (downloaded from AWS truststore).
 * For local dev without Aurora, just set DATABASE_URL without sslmode and
 * remove the sslcert param — Prisma will connect without SSL.
 */
function migrationUrl(): string {
  const raw = process.env.DATABASE_URL ?? "";

  // Strip any existing sslmode/sslcert params so we control them cleanly
  const base = raw
    .replace(/[?&]sslmode=[^&]*/g, "")
    .replace(/[?&]sslcert=[^&]*/g, "")
    .replace(/[?&]sslrootcert=[^&]*/g, "")
    .replace(/[?&]uselibpqcompat=[^&]*/g, "")
    .replace(/\?$/, "")
    .replace(/&$/, "");

  // Absolute path to the AWS CA bundle we downloaded
  const caBundle = path.resolve(__dirname, "prisma", "rds-ca.pem");

  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}sslmode=verify-ca&sslrootcert=${caBundle}`;
}

export default {
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    path: path.join("prisma", "migrations"),
  },
  datasource: {
    url: migrationUrl(),
  },
} satisfies PrismaConfig;
