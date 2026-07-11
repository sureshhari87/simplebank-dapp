---

### 2. User Guide (Simple) – Can be Added to Frontend

Create a `USER_GUIDE.md` or add a "Help" section in your `index.html`. Here's a minimal version:

```markdown
# SimpleBank User Guide

## Getting Started

1. Install [MetaMask](https://metamask.io/).
2. Switch to **Sepolia Test Network**.
3. Get free Sepolia ETH from a faucet (e.g., [Google Cloud Faucet](https://cloud.google.com/application/web3/faucet/ethereum/sepolia)).
4. Visit [SimpleBank dApp](https://sureshhari87.github.io/simplebank-dapp/).
5. Click "Connect MetaMask" and approve.

## How to Deposit

- Enter an amount (between min and max deposit).
- Click "Deposit".
- Confirm the transaction in MetaMask.
- Your balance will update after confirmation.

## How to Withdraw

- **Note:** Withdrawals are locked for 7 days after each deposit.
- After the lock period, enter the amount and click "Withdraw".
- Confirm the transaction.

## How to Claim Interest

- Interest accrues daily at the current APY (shown on the dashboard).
- After at least 24 hours, click "Claim Interest".
- The claimed amount is added to your balance.

## Troubleshooting

- **"Insufficient balance"** – You don't have enough deposited funds.
- **"Withdrawal locked"** – Wait until the lock period ends.
- **"Below min deposit"** – Deposit at least the minimum amount.
- **Transaction stuck** – Increase gas limit or wait.

## Support

For issues, contact hari.cadbury@gmail.com.