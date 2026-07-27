# Incident Response

This runbook is for suspected protocol loss, bad accounting, compromised signer, oracle/adapter issue, frontend compromise, or abnormal treasury movement.

## Immediate Triage

1. Stop frontend actions that increase exposure.
2. Identify affected modules: Bank, Vault, Manager, Lending, Swap, Treasury.
3. Run read-only checks:

```cmd
npm.cmd run suite:health:mainnet
npm.cmd run suite:revenue:mainnet
```

4. Capture transaction hashes, block numbers, balances, and affected addresses.

## Emergency Actions

Generate Safe calldata for the relevant action:

```cmd
set ACTION=halt
npm.cmd run emergency:encode:mainnet
```

```cmd
set ACTION=freeze-caps
npm.cmd run emergency:encode:mainnet
```

```cmd
set ACTION=unwind
npm.cmd run emergency:encode:mainnet
```

```cmd
set ACTION=full-drill
npm.cmd run emergency:encode:mainnet
```

Execute the minimum action that stops the risk:

- `halt`: pause Bank and Vault.
- `freeze-caps`: stop new inflows by setting caps to current TVL.
- `unwind`: divest vault strategy assets to idle WETH.
- `full-drill`: freeze caps, unwind, and pause.

## Treasury Response

Pause treasury if outgoing movement is risky:

```cmd
set ACTION=pause
npm.cmd run treasury:encode:mainnet
```

Disable an operator:

```cmd
set ACTION=set-operator
set TREASURY_OPERATOR=0xOPERATOR
set TREASURY_OPERATOR_ALLOWED=false
npm.cmd run treasury:encode:mainnet
```

## Recovery

Only resume after root cause is understood and fixed:

```cmd
set ACTION=resume
npm.cmd run emergency:encode:mainnet
```

Then run:

```cmd
npm.cmd run suite:health:mainnet
npm.cmd run suite:revenue:mainnet
```

## Post-Incident

- Preserve logs and transaction history.
- Write a timeline.
- Quantify affected funds.
- Prepare user communication.
- Patch and test locally.
- Get external review for the fix.
- Raise caps only after stability is confirmed.
