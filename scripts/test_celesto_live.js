import "dotenv/config";
import crypto from "node:crypto";
import { Computer } from "@celestoai/sdk";

async function main() {
  console.log("=== Celesto Cloud Live Sandbox Probe ===");

  const config = {
    headers: {
      "Idempotency-Key": crypto.randomUUID()
    }
  };

  console.log("Step 1: Invoking Computer.create() with template 'scratch'...");
  const t0 = Date.now();
  const computer = await Computer.create({ templateId: "scratch" }, config);
  const bootSec = ((Date.now() - t0) / 1000).toFixed(2);
  console.log(`Step 1 Success! Computer ID: ${computer.id}, status: ${computer.status}, boot time: ${bootSec}s`);

  try {
    console.log("Step 2: Executing remote command: uname -a && whoami && date -u");
    const execRes = await computer.run("uname -a && whoami && date -u");
    console.log(`Step 2 Success! Remote exitCode: ${execRes.exitCode}`);
    console.log(`Remote stdout:\n${execRes.stdout}`);
    if (execRes.stderr) {
      console.log(`Remote stderr:\n${execRes.stderr}`);
    }
  } finally {
    console.log("Step 3: Cleaning up: invoking computer.delete()...");
    await computer.delete();
    console.log("Step 3 Success! Sandbox deleted. Zero orphans remaining.");
  }
}

main().catch((err) => {
  console.error("Celesto Live Test Failed:", err.status || "", err.data || err.message);
  process.exit(1);
});
