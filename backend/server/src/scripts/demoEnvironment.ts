import { existsSync } from "fs";
import path from "path";
import dotenv from "dotenv";

export function loadDemoEnvironment(): void {
  const envPath = path.resolve(process.cwd(), ".env.demo");
  if (!existsSync(envPath)) {
    throw new Error(
      "Create backend/server/.env.demo from .env.demo.example before running demo commands",
    );
  }

  dotenv.config({ path: envPath, override: true });
  process.env.CAREFLOW_DEMO_MODE = "true";

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not configured in .env.demo");

  assertLocalDemoDatabaseUri(uri);
  const localUri = new URL(uri);
  localUri.searchParams.set("directConnection", "true");
  process.env.MONGODB_URI = localUri.toString();
}

export function assertLocalDemoDatabaseUri(uri: string): string {
  const parsed = new URL(uri);
  if (parsed.protocol !== "mongodb:" || parsed.host.includes(",")) {
    throw new Error("Demo commands require a single local MongoDB server");
  }
  const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
  if (!localHosts.has(parsed.hostname.toLowerCase())) {
    throw new Error("Demo commands only allow MongoDB on this machine");
  }

  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  if (
    !databaseName ||
    !/(dev|test|demo|sandbox|local)/i.test(databaseName) ||
    databaseName.toLowerCase() === "careflow"
  ) {
    throw new Error(
      `Demo commands require a development database name; refusing "${databaseName}"`,
    );
  }
  return databaseName;
}
