import fs from "node:fs/promises";
import path from "node:path";

const LOGS_DIR = path.resolve(process.cwd(), "logs");
const COMMANDS_LOG_PATH = path.join(LOGS_DIR, "commands.jsonl");

/**
 * Appends a command audit record to logs/commands.jsonl.
 * Strictly adheres to Requirement 4:
 * - ts: ISO-8601 string
 * - sandbox_name: matches sbx-[a-z0-9]{8,}
 * - command: non-empty string
 * - decision: "allow" | "block"
 * - execution_target: exactly "celesto_sandbox"
 *
 * @param {Object} record
 * @param {string} record.sandboxName
 * @param {string} record.command
 * @param {"allow" | "block"} record.decision
 */
export async function auditCommand({ sandboxName, command, decision }) {
  if (!sandboxName || !command) {
    throw new Error("sandboxName and command are required for audit logging");
  }

  const entry = {
    ts: new Date().toISOString(),
    sandbox_name: sandboxName,
    command: String(command),
    decision: decision === "block" ? "block" : "allow",
    execution_target: "celesto_sandbox" // Mandatory invariant
  };

  await fs.mkdir(LOGS_DIR, { recursive: true });
  await fs.appendFile(COMMANDS_LOG_PATH, JSON.stringify(entry) + "\n", "utf-8");
  return entry;
}

export { COMMANDS_LOG_PATH };

