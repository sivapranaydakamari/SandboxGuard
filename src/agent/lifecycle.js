import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { Computer } from "@celestoai/sdk";

const activeSandboxes = new Map();
let interruptHandlerRegistered = false;

// Generates a random sandbox name like sbx-a1b2c3d4e5f6
export function generateSandboxName(prefix = "sbx") {
  const randomSuffix = crypto.randomBytes(6).toString("hex");
  return `${prefix}-${randomSuffix}`;
}

// Clean up any remaining sandboxes on process exit or Ctrl-C
export function registerInterruptHandlers() {
  if (interruptHandlerRegistered) return;
  interruptHandlerRegistered = true;

  const cleanupAll = async (signal) => {
    console.warn(`\nReceived ${signal}. Cleaning up ${activeSandboxes.size} active sandbox(es)...`);
    const deletions = [];
    for (const [name, computer] of activeSandboxes.entries()) {
      deletions.push(
        computer.delete().catch((err) => {
          console.error(`Failed to clean up ${name}:`, err.message);
        })
      );
    }
    await Promise.all(deletions);
    activeSandboxes.clear();
    process.exit(0);
  };

  process.once("SIGINT", () => cleanupAll("SIGINT"));
  process.once("SIGTERM", () => cleanupAll("SIGTERM"));
}

// Helper wrapper to create a sandbox, run work, and guarantee deletion in finally
export async function withSandbox(options, fn) {
  registerInterruptHandlers();

  const sandboxName = options.name || generateSandboxName();
  let computer = null;
  let status = "failed";

  try {
    computer = await Computer.create(
      {
        templateId: options.templateId || "scratch",
        ...options.params
      },
      {
        headers: {
          "Idempotency-Key": crypto.randomUUID()
        }
      }
    );

    activeSandboxes.set(sandboxName, computer);

    const result = await fn(computer, sandboxName);
    status = "succeeded";
    return result;
  } catch (error) {
    status = "failed";
    throw error;
  } finally {
    if (computer) {
      try {
        await computer.delete();
      } catch (delError) {
        console.error(`Cleanup error for ${sandboxName}:`, delError.message);
      }
      activeSandboxes.delete(sandboxName);
    }
  }
}

// Writes lifecycle metadata to reports/lifecycle.json
export async function writeLifecycleReport(sandboxNames) {
  const reportsDir = path.resolve(process.cwd(), "reports");
  await fs.mkdir(reportsDir, { recursive: true });

  const data = {
    cleanup_on_success: true,
    cleanup_on_failure: true,
    cleanup_on_interrupt: true,
    sandbox_names: Array.from(new Set(sandboxNames))
  };

  await fs.writeFile(
    path.join(reportsDir, "lifecycle.json"),
    JSON.stringify(data, null, 2),
    "utf-8"
  );

  return data;
}

export { activeSandboxes };
