# Mainnet Deployment Runbook

Use this runbook after audit sign-off and after `npm.cmd run production:check` has no failures.

## 1. Configure Mainnet Environment

Use a mainnet Safe for owners. Do not use the deployer EOA as protocol owner.

```cmd
set MAINNET_RPC_URL=https://...
set PRIVATE_KEY=0x...
set ETHERSCAN_API_KEY=...

set INITIAL_OWNER=0xYOUR_MAINNET_SAFE
set TREASURY_OWNER=0xYOUR_MAINNET_SAFE

set WETH_ADDRESS=0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2
set AAVE_POOL_ADDRESS=0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2
set AAVE_AWETH_ADDRESS=0x4d5F47FA6A74757f35C14fD3a6Ef8E3C9BC514E8
```

Use low launch caps:

```cmd
set INITIAL_MAX_TOTAL_DEPOSITS_ETH=1
set VAULT_MAX_TOTAL_ASSETS_ETH=1
set STRATEGY_MAX_ASSETS_ETH=0.5
set LENDING_MAX_POOL_LIQUIDITY_ETH=1
```

Use real production token addresses:

```cmd
set SWAP_TOKEN0_ADDRESS=0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2
set SWAP_TOKEN1_ADDRESS=0xYOUR_PRODUCTION_TOKEN
set DEPLOY_SWAP_TEST_TOKEN=false
```

## 2. Preflight

```cmd
set PREFLIGHT_ONLY=true
npm.cmd run preflight:mainnet
npm.cmd run mainnet:readiness
npm.cmd run production:check
```

## 3. Deploy Treasury First

```cmd
npm.cmd run deploy:treasury:mainnet
npm.cmd run compile
```

Set all protocol treasuries to the new treasury contract:

```cmd
set INITIAL_TREASURY=0xTREASURY_CONTRACT
set VAULT_TREASURY=0xTREASURY_CONTRACT
set LENDING_TREASURY=0xTREASURY_CONTRACT
set SWAP_TREASURY=0xTREASURY_CONTRACT
```

## 4. Deploy Protocols

Bank:

```cmd
set PREFLIGHT_ONLY=false
npm.cmd run deploy:mainnet
```

Vault and strategy manager:

```cmd
npm.cmd run deploy:strategy-vault:mainnet
npm.cmd run deploy:strategy-manager:mainnet
```

If the deployer is not the owner Safe, submit the Safe calldata printed by the deployment scripts.

Lending:

```cmd
npm.cmd run deploy:lending:mainnet
```

Swap:

```cmd
npm.cmd run deploy:swap:mainnet
```

## 5. Verify and Check

```cmd
npm.cmd run verify:mainnet
npm.cmd run compile
npm.cmd run reserve:check:mainnet
npm.cmd run suite:health:mainnet
npm.cmd run suite:revenue:mainnet
```

## 6. Fund Reserves

Use Safe calldata for `fundInterestReserve()`:

```cmd
set ACTION=fund-reserve
set RESERVE_AMOUNT_ETH=0.01
npm.cmd run admin:encode:mainnet
```

Use the reserve check output to decide the exact amount.

## 7. Emergency Drill

Generate and review emergency calldata:

```cmd
set ACTION=full-drill
npm.cmd run emergency:encode:mainnet
```

Execute only if this is an approved tiny-funds drill or real emergency.

## 8. Launch Controls

Before public launch:

- Keep caps low.
- Keep owner as Safe.
- Keep treasury as `SimpleTreasury`.
- Confirm no protocol is paused.
- Confirm all revenue routes to treasury.
- Confirm monitoring alerts are active.
