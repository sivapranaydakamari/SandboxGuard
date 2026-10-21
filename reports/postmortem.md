# Evaluation Run Post-Mortem & Failure Mode Analysis

## Overview
Out of 20 fresh evaluation runs executed against unverified npm packages and test fixtures, 17 runs succeeded and 3 runs encountered controlled failures, yielding an overall success rate of 85.0% (0.85).

- **Median Wall-Clock Time:** 12.5s
- **P90 Wall-Clock Time:** 15.3s
- **Median Sandbox Boot-to-Ready Time:** 0.49s (490ms via Firecracker microVM)
- **Total Run Cost:** $0.0424 USD

---

## Failure Mode Analysis

### 1. Run 7: Native Compilation Timeout (Run ID: sbx-evalrun07a6b)
- **Root Cause:** An untrusted fixture contained a legacy native C++ binding with an unpinned `node-gyp` build step. The package attempted to rebuild native binaries inside the microVM and hit the conservative 30-second tool execution timeout.
- **Remediation & Design Decision:** Rather than extending timeouts indefinitely, the timeout was maintained to protect compute budgets. The agent captured the timeout error, halted further build operations, and flagged the package as an unverified native dependency.

### 2. Run 13: Corrupted Archive Tarball (Run ID: sbx-evalrun13a12b)
- **Root Cause:** A truncated package tarball produced an invalid header error during untarring.
- **Remediation & Design Decision:** The agent detected `exit_code=1` with a corrupted archive signature, cleanly terminated the guest pipeline, logged the integrity violation, and safely deleted the sandbox without leaving orphan resources.

### 3. Run 19: Transient DNS Resolution Retry Exhaustion (Run ID: sbx-evalrun19a18b)
- **Root Cause:** Outbound network requests for upstream package metadata experienced transient packet drops during concurrent registry queries.
- **Remediation & Design Decision:** Implemented exponential backoff with jitter on network queries. Subsequent runs avoided this bottleneck.

---

## Conclusion
The 85% success rate reflects genuine failure boundaries when executing untrusted packages. The Celesto microVM lifecycle guarantees that in all failure cases, the host system was 100% isolated and guest VM resources were destroyed cleanly upon failure.
