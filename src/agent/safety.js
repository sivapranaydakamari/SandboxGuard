import { auditCommand } from "./logger.js";

export class CommandBlockedError extends Error {
  constructor(reason, command) {
    super(`Command blocked by safety policy: ${reason}`);
    this.name = "CommandBlockedError";
    this.command = command;
    this.reason = reason;
  }
}

// Rules to catch obvious credential leaks, destructive operations, or prompt injection sinks
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

// Checks a command string against known dangerous patterns before running
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

// Intercepts the command, logs the decision, and executes inside the guest if allowed
export async function executeSandboxedCommand({ computer, sandboxName, command, options = {} }) {
  const inspection = inspectCommand(command);

  // Always log attempts, including blocked commands
  await auditCommand({
    sandboxName,
    command,
    decision: inspection.decision
  });

  if (inspection.decision === "block") {
    throw new CommandBlockedError(inspection.reason, command);
  }

  const response = await computer.run(command, options);

  return {
    exitCode: response.exitCode,
    stdout: response.stdout || "",
    stderr: response.stderr || "",
    blocked: false
  };
}
