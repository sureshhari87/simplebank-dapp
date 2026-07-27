# Dependency Audit Baseline

Last local dependency cleanup removed unused broad tooling packages:

- `@nomicfoundation/hardhat-toolbox`
- `@tenderly/hardhat-tenderly`
- `hardhat-coverage`
- `web3`

The monitor script now uses `ethers`, and the Hardhat config loads only the plugins the suite uses.

## Production Dependencies

Run:

```cmd
npm.cmd run audit:deps
```

Current result: production dependencies report `0 vulnerabilities` with `npm audit --omit=dev --audit-level=high`.

## Dev Toolchain

Run:

```cmd
npm.cmd run audit:tooling
```

Current result: the Hardhat 2 / coverage / gas-reporter toolchain still reports dev-only findings. Latest local count after cleanup was 34 total vulnerabilities, including 18 high and no critical findings.

Do not set `TOOLING_AUDIT_REVIEWED=true` until the remaining Hardhat/tooling findings are either remediated by a tested toolchain migration or explicitly accepted as local trusted-dev-environment risk.
