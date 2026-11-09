import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient, Prisma } from "./generated/prisma/client";
import { requiredEnv } from "./errors";

const globalDb = globalThis as typeof globalThis & {
  bountyguardDb?: PrismaClient;
};
export function db(): PrismaClient {
  if (!globalDb.bountyguardDb) {
    globalDb.bountyguardDb = new PrismaClient({
      adapter: new PrismaNeon({
        connectionString: requiredEnv("DATABASE_URL"),
      }),
    });
  }
  return globalDb.bountyguardDb;
}

export function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function transaction<T>(
  work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db().$transaction(work, {
        isolationLevel: "Serializable",
        timeout: 10000,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ["P2034", "P2002"].includes(error.code) &&
        attempt < 3
      )
        continue;
      throw error;
    }
  }
}
