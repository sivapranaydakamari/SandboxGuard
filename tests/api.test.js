import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { app, SANDBOX_NAME_PATTERN, VALID_STATES } from "../src/server.js";

describe("SandboxGuard API Validation & Regex", () => {
  test("SANDBOX_NAME_PATTERN accepts valid sandbox names", () => {
    const validNames = [
      "sbx-seeddemo1",
      "sbx-a1b2c3d4",
      "sbx-abcdef012345",
      "sbx-00000000"
    ];

    for (const name of validNames) {
      assert.equal(
        SANDBOX_NAME_PATTERN.test(name),
        true,
        `Expected ${name} to be valid`
      );
    }
  });

  test("SANDBOX_NAME_PATTERN rejects invalid sandbox names", () => {
    const invalidNames = [
      "sbx-short",           // only 5 chars after sbx- (minimum is 8)
      "sbx-UPPERCASE123",    // uppercase not allowed
      "vm-a1b2c3d4e5f6",     // must start with sbx-
      "sbx-with-hyphens-12", // no hyphens inside the suffix
      "",
      "sbx-!@#$%^&*"
    ];

    for (const name of invalidNames) {
      assert.equal(
        SANDBOX_NAME_PATTERN.test(name),
        false,
        `Expected ${name} to be invalid`
      );
    }
  });

  test("VALID_STATES contains all allowed lifecycle states", () => {
    const expected = ["created", "ready", "running", "succeeded", "failed", "deleted"];
    for (const state of expected) {
      assert.equal(VALID_STATES.has(state), true, `Expected state ${state} to be valid`);
    }
    assert.equal(VALID_STATES.has("unknown"), false);
    assert.equal(VALID_STATES.has("pending"), false);
  });
});

describe("SandboxGuard HTTP Endpoints", () => {
  let server;
  let baseUrl;

  before(async () => {
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const { port } = server.address();
    baseUrl = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  test("GET /health returns 200 and { status: 'ok' }", async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, { status: "ok" });
  });

  test("POST /api/runs rejects execution_target !== 'celesto_sandbox' with 400", async () => {
    const res = await fetch(`${baseUrl}/api/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        run_id: "run-test-01",
        sandbox_name: "sbx-validname01",
        problem_id: "prob-01",
        state: "created",
        execution_target: "host" // Invalid execution target!
      })
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error);
    assert.match(body.error, /celesto_sandbox/i);
  });

  test("POST /api/runs rejects invalid sandbox_name with 400", async () => {
    const res = await fetch(`${baseUrl}/api/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        run_id: "run-test-02",
        sandbox_name: "bad-name", // Does not match sbx-[a-z0-9]{8,}
        problem_id: "prob-01",
        state: "created",
        execution_target: "celesto_sandbox"
      })
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error);
  });

  test("POST /api/runs rejects unknown state with 400", async () => {
    const res = await fetch(`${baseUrl}/api/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        run_id: "run-test-03",
        sandbox_name: "sbx-validname03",
        problem_id: "prob-01",
        state: "in_progress", // Invalid state
        execution_target: "celesto_sandbox"
      })
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error);
  });
});

