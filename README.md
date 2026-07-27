# SimpleBank V2 – Decentralized Savings dApp

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Solidity](https://img.shields.io/badge/Solidity-0.8.19-blue)](https://soliditylang.org/)
[![Hardhat](https://img.shields.io/badge/Hardhat-2.22.0-green)](https://hardhat.org/)
[![Tests](https://img.shields.io/badge/tests-23%20passing-brightgreen)](./test)

## 📖 Description

**SimpleBank V2** is a decentralized bank that pays interest on ETH deposits. Users can deposit, withdraw, claim daily compound interest, and benefit from a withdrawal time‑lock for added security. The contract is owned by a Gnosis Safe multisig, ensuring admin actions require multiple approvals.

## ✨ Features

- ✅ **Deposit & Withdraw ETH** – Users can deposit and withdraw any amount (subject to min/max limits).
- ✅ **Daily Compound Interest** – Interest accrues daily based on the current rate (set by owner).
- ✅ **Withdrawal Time Lock** – Funds are locked for 7 days after deposit to prevent bank runs.
- ✅ **Minimum & Maximum Deposit Limits** – Owner configurable, enforced on‑chain.
- ✅ **Pausable** – Owner can pause the contract in emergencies.
- ✅ **Reentrancy Protection** – Uses OpenZeppelin's `ReentrancyGuard`.
- ✅ **Multisig Ownership** – Owner functions controlled by a Gnosis Safe (2-of-3).
- ✅ **Full Test Suite** – 23 passing tests (unit, invariant, fuzz).
- ✅ **Gas Optimized** – Storage packing, `unchecked` blocks, and caching.

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| Smart Contract | Solidity 0.8.19, OpenZeppelin |
| Development | Hardhat, Ethers.js |
| Testing | Mocha, Chai, Waffle, Tenderly, Foundry, Slither |
| Frontend | HTML, CSS, JavaScript, Web3.js |
| Hosting | GitHub Pages |
| Wallet | MetaMask |
| Multisig | Gnosis Safe (Sepolia) |

## 🚀 Live dApp

**Testnet (Sepolia):** [https://sureshhari87.github.io/simplebank-dapp/](https://sureshhari87.github.io/simplebank-dapp/)

> ⚠️ **Note:** This is a testnet demo. Use Sepolia ETH only.

## 📄 Smart Contract

| Network | Address | Verification |
|---------|---------|--------------|
| Sepolia | `0x01374a4b858E31DC779794A1e9F4F9207ec9a84e` | [Etherscan](https://sepolia.etherscan.io/address/0x01374a4b858E31DC779794A1e9F4F9207ec9a84e) |
| Mainnet | *Coming soon after audit* | – |

## 🔧 Local Development

### Prerequisites
- Node.js v18+
- npm or yarn
- MetaMask extension

### Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/sureshhari87/simplebank-dapp.git
   cd simplebank-dapp

2. Install dependencies:
   ```bash
   npm install

3. Compile contracts:
   ```bash
   npx hardhat compile

4.Run tests:
   ```bash
   npx hardhat test

5. Deploy to Sepolia (update .env with your private key):
   ```bash
   npx hardhat run scripts/deploy.js --network sepolia

Frontend
   
   The frontend files (index.html, app.js, style.css, contract-config.js) are in the root folder.
   Open index.html with Live Server or deploy to GitHub Pages.

Security

   Automated Analysis: Slither,Tenderly and Foundry ran with no high-severity findings.

   Manual Review: Followed security best practices(check-effects-interactions, reentranct guard, access control).

   Multisig Ownership: Owner functions require 2-of-3 signatures via Gnosis Safe.

   Audit: Pending professional audit for mainnet deployment.

Interest Reserve Policy:

   `interestReserve` must be funded by the owner Safe before deposits are opened on mainnet.

   Policy formula:
   ```text
   required reserve ~= expected TVL * APY * period_days / 365
   ```

   In repo terms, APY is `INITIAL_INTEREST_RATE / 10000`, so:
   ```text
   required reserve wei = expectedTvlWei * interestRateBps * periodDays / (365 * 10000)
   ```

   The deploy preflight prints the required reserve target. By default, expected TVL is the global TVL cap and the reserve period is 30 days. Override with:
   ```env
   EXPECTED_TVL_ETH=10
   INTEREST_RESERVE_PERIOD_DAYS=30
   ```

   After deployment, the owner Safe should call `fundInterestReserve()` with at least the required amount. Then verify the live reserve:
   ```bash
   npm run reserve:check:mainnet
   ```

ETH/WETH Vault Operations:

   Auto-invest keeps a configurable idle buffer in the vault and prints Safe calldata unless `EXECUTE=true` is used with the vault owner signer:
   ```bash
   set IDLE_BUFFER_BPS=2000
   set MIN_INVEST_ETH=0.000001
   set MAX_INVEST_ETH=
   npm.cmd run vault:auto-invest:sepolia
   ```

   Treasury performance fees are minted as treasury-owned vault shares. Encode treasury redemption calldata for the Safe with:
   ```bash
   set VAULT_DEPLOYMENT_NAME=strategy-vault
   set REDEEM_SHARES=all
   npm.cmd run vault:treasury:encode:sepolia
   ```

   Strategy manager owner operations can be encoded from the command line:
   ```bash
   npm.cmd run strategy-manager:encode:sepolia
   ```

   Check mainnet deployment inputs before running any mainnet deployment command:
   ```bash
   npm.cmd run mainnet:readiness
   ```

Lending Pool Operations:

   Deploy the isolated ETH lending pool:
   ```bash
   set LENDING_OWNER=0xYOUR_SAFE
   set LENDING_TREASURY=0xYOUR_SAFE
   set LENDING_BORROW_APR_BPS=800
   set LENDING_ORIGINATION_FEE_BPS=10
   set LENDING_MAX_POOL_LIQUIDITY_ETH=2
   npm.cmd run deploy:lending:sepolia
   ```

   Run basic user flows:
   ```bash
   set ACTION=supply
   set SUPPLY_AMOUNT_ETH=0.01
   npm.cmd run lending:sepolia

   set ACTION=borrow-with-collateral
   set COLLATERAL_AMOUNT_ETH=0.01
   set BORROW_AMOUNT_ETH=0.005
   npm.cmd run lending:sepolia

   set ACTION=repay
   set REPAY_ALL=true
   npm.cmd run lending:sepolia
   ```

   The frontend Lending Pool panel is generated from `deployments/lending-pool-<network>.json`:
   ```bash
   npm.cmd run compile
   py -m http.server 5500
   ```

   Encode Safe owner actions:
   ```bash
   set ACTION=set-risk-params
   set LENDING_MAX_LTV_BPS=6000
   set LENDING_LIQUIDATION_THRESHOLD_BPS=8000
   set LENDING_LIQUIDATION_BONUS_BPS=500
   npm.cmd run lending:encode:sepolia
   ```

DEX / Swap Fee Operations:

   Deploy a WETH/test-token swap pool on Sepolia:
   ```bash
   set SWAP_TOKEN0_ADDRESS=0xYOUR_WETH_ADDRESS
   set DEPLOY_SWAP_TEST_TOKEN=true
   set SWAP_OWNER=0xYOUR_SAFE
   set SWAP_TREASURY=0xYOUR_SAFE
   set SWAP_FEE_BPS=30
   set SWAP_PROTOCOL_FEE_SHARE_BPS=2000
   npm.cmd run deploy:swap:sepolia
   npm.cmd run compile
   ```

   Add liquidity and run a test swap:
   ```bash
   set ACTION=wrap-token0
   set WRAP_AMOUNT_ETH=0.002
   npm.cmd run swap:sepolia

   set ACTION=add-liquidity
   set SWAP_ADD_TOKEN0_AMOUNT=0.001
   set SWAP_ADD_TOKEN1_AMOUNT=100
   npm.cmd run swap:sepolia

   set ACTION=swap
   set TOKEN_IN=token1
   set SWAP_AMOUNT_IN=1
   set SWAP_MIN_AMOUNT_OUT=0
   npm.cmd run swap:sepolia
   ```

   Encode Safe owner actions:
   ```bash
   set ACTION=set-swap-fee
   set SWAP_FEE_BPS=25
   npm.cmd run swap:encode:sepolia
   ```

Treasury Contract Operations:

   Deploy a Safe-owned suite treasury:
   ```bash
   set TREASURY_OWNER=0xYOUR_SAFE
   npm.cmd run deploy:treasury:sepolia
   npm.cmd run compile
   ```

   Check treasury balances, tracked assets, and operator spend policy:
   ```bash
   set ACTION=status
   npm.cmd run treasury:sepolia
   ```

   Route protocol fee recipients to the treasury contract with Safe calldata:
   ```bash
   set ACTION=set-treasury
   set BANK_TREASURY=0xYOUR_TREASURY_CONTRACT
   npm.cmd run admin:encode:sepolia

   set ACTION=set-treasury
   set VAULT_TREASURY=0xYOUR_TREASURY_CONTRACT
   npm.cmd run strategy-vault:encode:sepolia

   set ACTION=set-treasury
   set LENDING_TREASURY=0xYOUR_TREASURY_CONTRACT
   npm.cmd run lending:encode:sepolia

   set ACTION=set-treasury
   set SWAP_TREASURY=0xYOUR_TREASURY_CONTRACT
   npm.cmd run swap:encode:sepolia
   ```

   Encode Safe owner actions:
   ```bash
   set ACTION=set-asset-policy
   set ASSET_ADDRESS=ETH
   set ASSET_ENABLED=true
   set SPEND_LIMIT=0.01
   npm.cmd run treasury:encode:sepolia

   set ACTION=set-operator
   set TREASURY_OPERATOR=0xYOUR_OPERATOR
   set TREASURY_OPERATOR_ALLOWED=true
   npm.cmd run treasury:encode:sepolia

   set ACTION=withdraw-eth
   set RECIPIENT=0xYOUR_RECIPIENT
   set AMOUNT_ETH=0.001
   npm.cmd run treasury:encode:sepolia
   ```

   Operators can spend only assets with enabled policy and remaining cap:
   ```bash
   set ACTION=spend-eth
   set RECIPIENT=0xYOUR_RECIPIENT
   set AMOUNT_ETH=0.001
   npm.cmd run treasury:sepolia
   ```

Monetization Readiness:

   Run the local smoke test that proves Bank, Vault, Lending, and Swap can generate revenue for the central treasury:
   ```bash
   npm.cmd run test:smoke
   ```

   Run the live read-only revenue report:
   ```bash
   set EXPECTED_TREASURY=0xYOUR_TREASURY_CONTRACT
   npm.cmd run suite:revenue:sepolia
   ```

   The report checks treasury routing, active fee settings, pending protocol fees, vault treasury shares, and treasury spend policy. A warning means the suite is safe but not earning on that path yet; a failure means routing or deployment config needs correction.

   The treasury owner Safe can execute arbitrary calls from treasury custody when needed, for example to redeem vault shares held by the treasury:
   ```bash
   set ACTION=execute
   set TARGET=0xTARGET_CONTRACT
   set CALL_VALUE_ETH=0
   set CALL_DATA=0xENCODED_CALLDATA
   npm.cmd run treasury:encode:sepolia
   ```

Production Mainnet Gate:

   Before public mainnet launch, run:
   ```bash
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

   After mainnet deployment, verify and run live checks:
   ```bash
   npm.cmd run verify:mainnet
   npm.cmd run reserve:check:mainnet
   npm.cmd run suite:health:mainnet
   npm.cmd run suite:revenue:mainnet
   ```

   Mainnet runbooks:
   - `docs/PRODUCTION_READINESS.md`
   - `docs/MAINNET_DEPLOYMENT_RUNBOOK.md`
   - `docs/INCIDENT_RESPONSE.md`
   - `docs/STATIC_ANALYSIS.md`
   - `docs/DEPENDENCY_AUDIT.md`

Contract Overview:

   | Function                     | Description                                 | Access              |
    |-----------------------------|---------------------------------------------|---------------------|
    | deposit()                   | Deposit ETH and earn interest               | Public              |
    | withdraw(uint amount)       | Withdraw ETH (subject to lock)              | Public              |
    | claimInterest()             | Claim accrued interest                      | Public              |
    | setInterestRate(uint newRate)| Change APY (100 = 1%)                      | Owner (multisig)    |
    | setMinDeposit(uint newMin)  | Set minimum deposit in wei                  | Owner (multisig)    |
    | setMaxDeposit(uint newMax)  | Set maximum deposit per user                | Owner (multisig)    |
    | pause() / unpause()         | Emergency stop / resume contract            | Owner (multisig)    |
    | recoverETH(uint amount)     | Withdraw stuck ETH from contract            | Owner (multisig)    |

Test Coverage
```bash
npx hardhat coverage

Lines: 95%+
Functions: 100%
Branches: 88%

Contributing

 Contributions are welcome! Please open an issue or pull request.
 For security vulnerabilities, contact directly (see below).

Contact

  Developer: sureshhari
  Email: hari.cadbury@gmail.com
  GitHub: sureshhari87

License
 MIT License -- see LICENSE file

Acknowledgements

 OpenZeppelin for secure contract libraries

 Hardhat for development environment

 Gnosis Safe for multisig infrastructure

 
