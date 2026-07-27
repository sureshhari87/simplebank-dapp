# Static Analysis Baseline

Last local Slither pass was run with:

```cmd
npm.cmd run security:slither:full
```

The contracts are pinned to Solidity `0.8.26` for production builds. The previous compiler-range, cache-length, and uninitialized-local findings have been removed.

The current full baseline is 87 Slither findings across reviewed detector categories. The `security:slither` script excludes those baseline categories so new unreviewed detector classes still fail the gate. The `security:slither:full` script prints the complete baseline for auditors.

## Current Review Items

Slither still reports findings that require auditor review before public mainnet launch:

- `arbitrary-send-eth` and `low-level-calls`: expected for owner/Safe treasury execution and ETH transfer paths, but every call site must be reviewed for access control and accounting.
- `reentrancy-balance`: appears around allowlisted vault/manager strategy calls. Public entry points are guarded with `nonReentrant`, but the strategy trust boundary must be reviewed.
- `divide-before-multiply`: expected bps rounding in fees and proportional liquidity math; confirm rounding direction is acceptable.
- `incorrect-equality`: mostly zero-value, no-debt, no-interest, and sentinel checks. Confirm none depend on exact external balances where tolerance is needed.
- `timestamp`: expected for bank lock/interest and lending interest accrual. Confirm timestamp tolerance is acceptable for each product.
- `calls-loop`: strategy manager loops over the owner-controlled strategy list. Keep strategy count small enough for gas-bounded withdrawals.
- Mock-only findings are not production blockers, but keep mocks excluded from audit scope where appropriate.

Do not set `STATIC_ANALYSIS_REVIEWED=true` until each item is either fixed, documented as intended behavior, or accepted by the independent auditor.
