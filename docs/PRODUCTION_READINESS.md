# Production Readiness

This suite is production-ready only when every automated gate passes and the external launch gates are complete.

## Automated Gates

Run locally before any public mainnet launch:

```cmd
npm.cmd run compile
npm.cmd run test:smoke
npm.cmd test
npm.cmd run coverage
npm.cmd run security:slither
npm.cmd run security:slither:full
npm.cmd run audit:deps
npm.cmd run audit:tooling
npm.cmd run mainnet:readiness
npm.cmd run production:check
```

After mainnet deployment:

```cmd
npm.cmd run verify:mainnet
npm.cmd run reserve:check:mainnet
npm.cmd run suite:health:mainnet
npm.cmd run suite:revenue:mainnet
```

## Required External Gates

These cannot be completed by scripts and must be signed off before public launch:

- Independent smart contract audit completed.
- All audit findings triaged and resolved or explicitly accepted.
- Static analysis findings triaged and resolved or explicitly accepted.
- Production dependency audit passes with no high-severity findings.
- Dev toolchain dependency findings triaged and resolved or explicitly accepted.
- Legal/regulatory review completed for target users and jurisdictions.
- Mainnet Safe owners and threshold reviewed.
- Monitoring and alerting configured.
- Emergency runbook reviewed by every Safe signer.
- Emergency drill completed with tiny mainnet funds or a realistic fork.
- Frontend production config reviewed.

Set these only after the work is actually complete:

```env
AUDIT_REPORT_PATH=docs/audits/latest-mainnet-audit.pdf
AUDIT_FINDINGS_RESOLVED=true
STATIC_ANALYSIS_REVIEWED=true
DEPENDENCY_AUDIT_REVIEWED=true
TOOLING_AUDIT_REVIEWED=true
LEGAL_REVIEW_DONE=true
MAINNET_SAFE_REVIEWED=true
MONITORING_CONFIGURED=true
INCIDENT_RESPONSE_REVIEWED=true
EMERGENCY_DRILL_COMPLETED=true
FRONTEND_PRODUCTION_REVIEWED=true
```

## Mainnet Launch Posture

Use a staged launch:

1. Deploy with very low TVL caps.
2. Verify contracts.
3. Fund only the minimum required reserves.
4. Run health and revenue reports.
5. Complete an emergency drill.
6. Open to a small allowlisted/private group if your frontend supports it.
7. Raise caps only after observed operations are stable.

Do not launch with meaningful TVL until an independent audit is complete.
