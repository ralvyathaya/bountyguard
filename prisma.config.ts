import { defineConfig } from "prisma/config";
import { existsSync } from "node:fs";

for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // Generation works without credentials; migration commands require DIRECT_URL.
  ...(process.env.DIRECT_URL
    ? { datasource: { url: process.env.DIRECT_URL } }
    : {}),
});
