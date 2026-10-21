import json
import math
import os
import re
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

SANDBOX_NAME_RE = re.compile(r"^sbx-[a-z0-9]{8,}$")

ALLOWED_CAPABILITY_IDS = {
    "persistence",
    "snapshots",
    "celestofs",
    "browser",
    "published_ports",
    "network_policy",
    "safety_hooks",
    "host_mounts",
    "coding_agent_preset",
    "agentor_durable"
}

ALLOWED_ATTACK_IDS = {
    "prompt_injection_exfil",
    "destructive_command",
    "suspicious_package"
}

ALLOWED_POLICIES = {"resume", "rollback", "fresh"}


class TestSandboxGuardReports(unittest.TestCase):

    def test_01_problem_json(self):
        problem_file = REPO_ROOT / "reports" / "problem.json"
        self.assertTrue(problem_file.exists(), "reports/problem.json must exist")

        with open(problem_file, "r", encoding="utf-8") as f:
            data = json.load(f)

        self.assertIn("who", data)
        self.assertIn("agent_work", data)
        self.assertIn("proof_output", data)
        self.assertIn("idea_source", data)

        self.assertIn(data["idea_source"], ["idea_bank", "original"])
        self.assertGreaterEqual(len(data["who"]), 40, "who must be at least 40 chars")
        self.assertGreaterEqual(len(data["agent_work"]), 40, "agent_work must be at least 40 chars")
        self.assertGreaterEqual(len(data["proof_output"]), 20, "proof_output must be at least 20 chars")

    def test_02_capabilities_json(self):
        cap_file = REPO_ROOT / "reports" / "capabilities.json"
        self.assertTrue(cap_file.exists(), "reports/capabilities.json must exist")

        with open(cap_file, "r", encoding="utf-8") as f:
            data = json.load(f)

        self.assertIn("capabilities", data)
        caps = data["capabilities"]
        self.assertGreaterEqual(len(caps), 2, "Must declare at least 2 capabilities")

        ids = [c["id"] for c in caps]
        self.assertEqual(len(ids), len(set(ids)), "Capability ids must be unique")

        for c in caps:
            self.assertIn(c["id"], ALLOWED_CAPABILITY_IDS, f"Invalid capability id: {c['id']}")
            self.assertGreaterEqual(len(c["why"]), 80, "why must be at least 80 chars")
            evidence_file = REPO_ROOT / c["evidence_path"]
            self.assertTrue(evidence_file.exists(), f"evidence_path does not exist: {c['evidence_path']}")

    def test_03_lifecycle_json(self):
        lifecycle_file = REPO_ROOT / "reports" / "lifecycle.json"
        self.assertTrue(lifecycle_file.exists(), "reports/lifecycle.json must exist")

        with open(lifecycle_file, "r", encoding="utf-8") as f:
            data = json.load(f)

        self.assertIs(data.get("cleanup_on_success"), True)
        self.assertIs(data.get("cleanup_on_failure"), True)
        self.assertIs(data.get("cleanup_on_interrupt"), True)

        names = data.get("sandbox_names", [])
        self.assertIsInstance(names, list)
        self.assertGreater(len(names), 0, "sandbox_names must not be empty")
        self.assertEqual(len(names), len(set(names)), "sandbox_names must be unique")

        for name in names:
            self.assertTrue(SANDBOX_NAME_RE.match(name), f"Name does not match pattern: {name}")

        # Confirm each name appears in commands.jsonl or reliability.json
        commands_file = REPO_ROOT / "logs" / "commands.jsonl"
        rel_file = REPO_ROOT / "reports" / "reliability.json"

        commands_names = set()
        if commands_file.exists():
            with open(commands_file, "r", encoding="utf-8") as f:
                for line in f:
                    if line.strip():
                        commands_names.add(json.loads(line)["sandbox_name"])

        rel_names = set()
        if rel_file.exists():
            with open(rel_file, "r", encoding="utf-8") as f:
                for run in json.load(f).get("runs", []):
                    rel_names.add(run["sandbox_name"])

        combined_names = commands_names.union(rel_names)
        for name in names:
            self.assertIn(name, combined_names, f"Sandbox {name} not found in commands or reliability")

    def test_04_commands_jsonl(self):
        commands_file = REPO_ROOT / "logs" / "commands.jsonl"
        self.assertTrue(commands_file.exists(), "logs/commands.jsonl must exist")

        lines_count = 0
        with open(commands_file, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                lines_count += 1
                row = json.load(line) if hasattr(json, "load") and False else json.loads(line)
                self.assertIn("ts", row)
                self.assertTrue(SANDBOX_NAME_RE.match(row["sandbox_name"]))
                self.assertTrue(len(row["command"]) > 0)
                self.assertIn(row["decision"], ["allow", "block"])
                self.assertEqual(row["execution_target"], "celesto_sandbox")

        self.assertGreater(lines_count, 0, "logs/commands.jsonl must have at least one line")

    def test_05_reliability_and_postmortem(self):
        rel_file = REPO_ROOT / "reports" / "reliability.json"
        self.assertTrue(rel_file.exists(), "reports/reliability.json must exist")

        with open(rel_file, "r", encoding="utf-8") as f:
            data = json.load(f)

        runs = data.get("runs", [])
        run_count = data.get("run_count")
        self.assertEqual(run_count, len(runs), "run_count must match len(runs)")
        self.assertGreaterEqual(run_count, 20, "run_count must be at least 20")

        names = [r["sandbox_name"] for r in runs]
        self.assertEqual(len(names), len(set(names)), "sandbox names must be unique")

        for r in runs:
            self.assertTrue(SANDBOX_NAME_RE.match(r["sandbox_name"]))
            self.assertIs(r["fresh"], True)
            self.assertIsInstance(r["success"], bool)
            self.assertGreaterEqual(r["wall_clock_s"], 0)
            self.assertGreaterEqual(r["boot_to_ready_s"], 0)
            self.assertGreaterEqual(r["cost_usd"], 0)

        # Statistical arithmetic
        successes = sum(1 for r in runs if r["success"])
        expected_success_rate = successes / run_count
        self.assertAlmostEqual(data["success_rate"], expected_success_rate, places=3)

        sorted_wall = sorted(r["wall_clock_s"] for r in runs)
        n = len(sorted_wall)
        if n % 2 == 0:
            expected_median_wall = (sorted_wall[n // 2 - 1] + sorted_wall[n // 2]) / 2.0
        else:
            expected_median_wall = sorted_wall[n // 2]
        self.assertAlmostEqual(data["median_wall_clock_s"], expected_median_wall, places=3)

        p90_idx = math.ceil(0.90 * n) - 1
        expected_p90_wall = sorted_wall[p90_idx]
        self.assertAlmostEqual(data["p90_wall_clock_s"], expected_p90_wall, places=3)

        sorted_boot = sorted(r["boot_to_ready_s"] for r in runs)
        if n % 2 == 0:
            expected_median_boot = (sorted_boot[n // 2 - 1] + sorted_boot[n // 2]) / 2.0
        else:
            expected_median_boot = sorted_boot[n // 2]
        self.assertAlmostEqual(data["median_boot_to_ready_s"], expected_median_boot, places=3)

        expected_total_cost = sum(r["cost_usd"] for r in runs)
        self.assertAlmostEqual(data["total_cost_usd"], expected_total_cost, places=2)

        # Post-mortem
        pm_path = REPO_ROOT / data["postmortem_path"]
        self.assertTrue(pm_path.exists(), f"postmortem file {pm_path} must exist")
        with open(pm_path, "r", encoding="utf-8") as f:
            pm_content = f.read()
        self.assertGreaterEqual(len(pm_content), 200, "postmortem must be at least 200 chars")

    def test_06_containment_json(self):
        cont_file = REPO_ROOT / "reports" / "containment.json"
        self.assertTrue(cont_file.exists(), "reports/containment.json must exist")

        with open(cont_file, "r", encoding="utf-8") as f:
            data = json.load(f)

        self.assertIn(data.get("attack"), ALLOWED_ATTACK_IDS)
        self.assertIs(data.get("blocked"), True)
        self.assertIs(data.get("host_untouched"), True)

        paths = data.get("evidence_paths", [])
        self.assertGreaterEqual(len(paths), 1)
        for p in paths:
            self.assertTrue((REPO_ROOT / p).exists(), f"Evidence file does not exist: {p}")

    def test_07_failure_policy_and_trace(self):
        fp_file = REPO_ROOT / "reports" / "failure_policy.json"
        self.assertTrue(fp_file.exists(), "reports/failure_policy.json must exist")

        with open(fp_file, "r", encoding="utf-8") as f:
            data = json.load(f)

        self.assertEqual(data.get("failed_step"), 7)
        self.assertEqual(data.get("total_steps"), 10)
        self.assertIn(data.get("policy"), ALLOWED_POLICIES)
        self.assertGreaterEqual(len(data.get("rationale", "")), 200)

        trace_file = REPO_ROOT / data["trace_path"]
        self.assertTrue(trace_file.exists(), f"Trace path {trace_file} does not exist")

        policy_applied_found = False
        with open(trace_file, "r", encoding="utf-8") as f:
            for line in f:
                if line.strip():
                    item = json.loads(line)
                    if item.get("event") == "policy_applied" and item.get("policy") == data["policy"]:
                        policy_applied_found = True
                        break

        self.assertTrue(policy_applied_found, "Trace must have policy_applied event matching policy")

    def test_08_concurrency_json(self):
        conc_file = REPO_ROOT / "reports" / "concurrency.json"
        self.assertTrue(conc_file.exists(), "reports/concurrency.json must exist")

        with open(conc_file, "r", encoding="utf-8") as f:
            data = json.load(f)

        jobs = data.get("jobs", [])
        self.assertGreaterEqual(len(jobs), 5, "concurrency must report at least 5 jobs")

        names = [j["sandbox_name"] for j in jobs]
        self.assertEqual(len(names), len(set(names)), "concurrency sandbox names must be unique")

        for j in jobs:
            self.assertTrue(SANDBOX_NAME_RE.match(j["sandbox_name"]))
            self.assertTrue(len(j.get("started_at", "")) > 0)

        self.assertGreaterEqual(len(data.get("breakage_notes", "")), 40)

    def test_09_env_example_and_placeholders(self):
        env_example = REPO_ROOT / ".env.example"
        self.assertTrue(env_example.exists(), ".env.example must exist")

        with open(env_example, "r", encoding="utf-8") as f:
            text = f.read()

        required_keys = [
            "CELESTO_PROVIDER",
            "CELESTO_API_KEY",
            "LLM_API_KEY",
            "LLM_MODEL",
            "DATABASE_URL",
            "API_PORT"
        ]

        for k in required_keys:
            self.assertIn(k, text, f"Missing required env key in .env.example: {k}")

    def test_10_compose_and_dockerfile(self):
        compose_file = REPO_ROOT / "docker-compose.yml"
        self.assertTrue(compose_file.exists(), "docker-compose.yml must exist")

        dockerfile = REPO_ROOT / "Dockerfile"
        self.assertTrue(dockerfile.exists(), "Dockerfile must exist")

        with open(compose_file, "r", encoding="utf-8") as f:
            compose_text = f.read()

        self.assertIn("ledger:", compose_text)
        self.assertIn("api:", compose_text)
        self.assertIn("pg_isready", compose_text)
        self.assertIn("/health", compose_text)
        self.assertIn("interval:", compose_text)
        self.assertIn("timeout:", compose_text)
        self.assertIn("retries:", compose_text)
        self.assertIn("start_period:", compose_text)
        self.assertIn("./seeds:", compose_text)


if __name__ == "__main__":
    unittest.main()

