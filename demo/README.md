# Demo Walkthrough Video

The 3-minute project demo walkthrough video is hosted on Google Drive:

- **Video Link:** [SandboxGuard Demo Walkthrough (Google Drive)](https://drive.google.com/file/d/1o0CUlSHlpVQotgq-D0PM0U7OEPaKLFhB/view?usp=sharing)

### Video Outline (3:00)
1. **0:00 – 0:25:** Project introduction and problem statement (preventing credential exfiltration and system damage with microVM isolation).
2. **0:25 – 1:00:** Starting the control plane and PostgreSQL ledger via Docker Compose, verifying `http://localhost:8080/health` and `http://localhost:8080/api/runs`.
3. **1:00 – 1:35:** Pre-execution safety inspection in `src/agent/safety.js` and audit trail logging in `logs/commands.jsonl`.
4. **1:35 – 2:15:** Verified Celesto Cloud microVM execution (`reports/evidence/celesto_live_test.json`), showing remote command execution and sandbox deletion.
5. **2:15 – 2:45:** Running the automated test suites: `npm test` (12 tests) and `python tests/test_reports.py` (10 tests).
6. **2:45 – 3:00:** Conclusion and summary.

