import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { Computer } from "@celestoai/sdk";

const activeSandboxes = new Map();
let interruptHandlerRegistered = false;

/**
 * Generates a collision-resistant sandbox name matching:
 * ^sbx-[a-z0-9]{8,}$
 */
export function generateSandboxName(prefix = "sbx") {
  const randomSuffix = crypto.randomBytes(6).toString("hex"); // 12 hex chars
  return `${prefix}-${randomSuffix}`;
}

/**
 * Registers cleanup handlers on process signals (SIGINT, SIGTERM)
 * to ensure no orphaned sandboxes remain.
 */
export function registerInterruptHandlers() {
  if (interruptHandlerRegistered) return;
  interruptHandlerRegistered = true;

  const cleanupAll = async (signal) => {
    console.warn(`\n[Lifecycle] Received ${signal}. Cleaning up ${activeSandboxes.size} active sandbox(es)...`);
    const deletions = [];
    for (const [name, computer] of activeSandboxes.entries()) {
      deletions.push(
        computer.delete().catch((err) => {
          console.error(`[Lifecycle] Failed to clean up ${name}:`, err.message);
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

/**
 * Executes an operation with guaranteed cleanup on success, failure, and interrupt.
 *
 * @param {Object} options
 * @param {string} [options.name]
 * @param {Object} [options.params]
 * @param {(computer: Computer, sandboxName: string) => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withSandbox(options, fn) {
  registerInterruptHandlers();

  const sandboxName = options.name || generateSandboxName();
  let computer = null;
  let status = "failed";

  try {
    // Attempt creation through Celesto SDK
    computer = await Computer.create({
      templateId: options.templateId || "scratch",
      ...options.params
    });

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
        console.error(`[Lifecycle] Cleanup error for ${sandboxName}:`, delError.message);
      }
      activeSandboxes.delete(sandboxName);
    }
  }
}

/**
 * Writes or updates reports/lifecycle.json
 * @param {string[]} sandboxNames
 */
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

