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

 
