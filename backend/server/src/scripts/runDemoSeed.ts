import { loadDemoEnvironment } from "./demoEnvironment.js";

async function runDemoSeed(): Promise<void> {
  try {
    loadDemoEnvironment();
    await import("./seedDemoData.js");
  } catch (error) {
    console.error(
      "Demo data seeding failed:",
      error instanceof Error ? error.message : "Unknown error",
    );
    process.exitCode = 1;
  }
}

void runDemoSeed();
