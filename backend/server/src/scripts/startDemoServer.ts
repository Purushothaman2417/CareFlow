import { loadDemoEnvironment } from "./demoEnvironment.js";

async function startDemoServer(): Promise<void> {
  try {
    loadDemoEnvironment();
    await import("../server.js");
  } catch (error) {
    console.error(
      "Demo server could not start:",
      error instanceof Error ? error.message : "Unknown error",
    );
    process.exitCode = 1;
  }
}

void startDemoServer();
