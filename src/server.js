import "dotenv/config";
import express from "express";
import { fileURLToPath } from "node:url";
import { pool, checkDatabase } from "./db.js";

export const app = express();

export const PORT = Number(process.env.API_PORT || 8080);

export const SANDBOX_NAME_PATTERN = /^sbx-[a-z0-9]{8,}$/;

export const VALID_STATES = new Set([
  "created",
  "ready",
  "running",
  "succeeded",
  "failed",
  "deleted"
]);

app.use(express.json({ limit: "32kb" }));

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

// List all runs in descending order of creation
app.get("/api/runs", async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT
        run_id,
        sandbox_name,
        problem_id,
        state,
        execution_target,
        created_at,
        updated_at
      FROM runs
      ORDER BY created_at DESC
    `);

    res.status(200).json(result.rows);
  } catch (error) {
    next(error);
  }
});

// Record a new run
app.post("/api/runs", async (req, res, next) => {
  try {
    const {
      run_id,
      sandbox_name,
      problem_id,
      state,
      execution_target
    } = req.body ?? {};

    if (
      typeof run_id !== "string" ||
      !run_id.trim() ||
      typeof problem_id !== "string" ||
      !problem_id.trim() ||
      typeof sandbox_name !== "string" ||
      !SANDBOX_NAME_PATTERN.test(sandbox_name) ||
      !VALID_STATES.has(state) ||
      execution_target !== "celesto_sandbox"
    ) {
      return res.status(400).json({
        error: "Invalid run data: execution_target must be 'celesto_sandbox', sandbox_name must match 'sbx-[a-z0-9]{8,}', and state must be valid"
      });
    }

    const result = await pool.query(
      `INSERT INTO runs (
        run_id,
        sandbox_name,
        problem_id,
        state,
        execution_target
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING
        run_id,
        sandbox_name,
        problem_id,
        state,
        execution_target,
        created_at,
        updated_at`,
      [
        run_id.trim(),
        sandbox_name,
        problem_id.trim(),
        state,
        execution_target
      ]
    );

    return res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        error: "run_id already exists"
      });
    }

    if (error.code === "23514") {
      return res.status(400).json({
        error: "Database constraint rejected the run"
      });
    }

    next(error);
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error("API error:", error.message);

  if (res.headersSent) {
    return next(error);
  }

  res.status(500).json({
    error: "Internal server error"
  });
});

// Start only after PostgreSQL is reachable
export async function startServer(port = PORT) {
  let connected = false;
  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      await checkDatabase();
      connected = true;
      break;
    } catch (err) {
      console.log(`Waiting for database (attempt ${attempt}/10): ${err.message}`);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  if (!connected) {
    throw new Error("Could not connect to PostgreSQL after 10 attempts");
  }

  return new Promise((resolve) => {
    const server = app.listen(port, "0.0.0.0", () => {
      console.log(`SandboxGuard API listening on port ${port}`);
      resolve(server);
    });
  });
}

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? fileURLToPath(new URL(`file://${process.argv[1]}`)) : "";

if (invokedFile && currentFile === invokedFile) {
  startServer().catch((error) => {
    console.error("Failed to start API:", error.message);
    process.exit(1);
  });
}
