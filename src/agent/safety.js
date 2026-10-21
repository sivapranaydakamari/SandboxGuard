import { auditCommand } from "./logger.js";

export class CommandBlockedError extends Error {
  constructor(reason, command) {
    super(`Command blocked by safety policy: ${reason}`);
    this.name = "CommandBlockedError";
    this.command = command;
    this.reason = reason;
  }
}

/**
 * Forbidden rules and heuristics.
 * Evaluates command strings for:
 * 1. Secret / Credential Exfiltration (curl/wget/nc exfiltrating environment variables or keys)
 * 2. Unsafe host-escape attempts
 * 3. Catastrophic destruction outside bounded workspace
 */
const BLOCKED_RULES = [
  {
    name: "secret_exfiltration_env",
    pattern: /(?:curl|wget|nc|bash -i|python.*http)\s+.*(?:\$API_KEY|\$CELESTO_API_KEY|\$LLM_API_KEY|\.env)/i,
    reason: "Attempted exfiltration of environment credentials or .env file"
  },
  {
    name: "prompt_injection_webhook_leak",
    pattern: /(?:webhook\.site|pipedream\.net|requestbin|ngrok-free\.app|pastebin\.com).*?(?:api_key|token|auth|key=)/i,
    reason: "Outbound leak to exfiltration sink detected"
  },
  {
    name: "destructive_root_deletion",
    pattern: /rm\s+-(?:rf|fr)\s+(?:\/\s*$|\/\*|\/root|\/etc|\/boot)/,
    reason: "Destructive root filesystem wipe blocked"
  },
  {
    name: "host_device_write",
    pattern: /dd\s+if=.*of=\/dev\/(?:sd|hd|nvme|loop)/i,
    reason: "Direct block device write forbidden"
  }
];

/**
 * Inspects a command against security policies before dispatching to the sandbox.
 * @param {string} command
 * @returns {{ decision: "allow" | "block", reason?: string, rule?: string }}
 */
export function inspectCommand(command) {
  const trimmed = command.trim();

  for (const rule of BLOCKED_RULES) {
    if (rule.pattern.test(trimmed)) {
      return {
        decision: "block",
        reason: rule.reason,
        rule: rule.name
      };
    }
  }

  return { decision: "allow" };
}

/**
 * Executes a command within a Celesto Computer with pre-execution safety inspection
 * and automatic append-only audit logging to logs/commands.jsonl.
 *
 * @param {Object} params
 * @param {import("@celestoai/sdk").Computer} params.computer
 * @param {string} params.sandboxName
 * @param {string} params.command
 * @param {Object} [params.options]
 * @returns {Promise<{ exitCode: number, stdout: string, stderr: string, blocked: boolean }>}
 */
export async function executeSandboxedCommand({ computer, sandboxName, command, options = {} }) {
  const inspection = inspectCommand(command);

  // Requirement 4: Record EVERY command attempt to logs/commands.jsonl, including blocked attempts
  await auditCommand({
    sandboxName,
    command,
    decision: inspection.decision
  });

  if (inspection.decision === "block") {
    // Never allow blocked commands to reach the guest VM or host!
    throw new CommandBlockedError(inspection.reason, command);
  }

  // Execute inside Celesto Sandbox (never on host!)
  const response = await computer.run(command, options);

  return {
    exitCode: response.exitCode,
    stdout: response.stdout || "",
    stderr: response.stderr || "",
    blocked: false
  };
}

