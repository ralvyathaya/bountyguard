import { db, json } from "../lib/db";
import { demoTemplates } from "../lib/demo";
import { existsSync } from "node:fs";

for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

async function main() {
  for (const task of demoTemplates.slice(0, 3)) {
    await db().bounty.upsert({
      where: { id: `sandbox-template-${task.id}` },
      update: {},
      create: {
        id: `sandbox-template-${task.id}`,
        title: task.title,
        rewardCents: task.rewardCents,
        criteria: json([
          {
            id: "implementation",
            text: "Supply the implementation diff with clear evidence of the requested behavior.",
          },
          {
            id: "tests",
            text: "Supply regression tests for success and failure paths.",
          },
          {
            id: "documentation",
            text: "Document verification steps and limitations.",
          },
        ]),
        events: {
          create: {
            type: "BOUNTY_CREATED",
            message:
              "Unfunded sandbox task template. Complete a real sandbox capture before submitting work.",
          },
        },
      },
    });
  }
  console.log(
    "Seeded three unfunded sandbox templates. No captures or payouts were invented.",
  );
}
main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Seed failed");
    process.exitCode = 1;
  })
  .finally(() => db().$disconnect());
