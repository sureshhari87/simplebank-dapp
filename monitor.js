const { Web3 } = require("web3");
const fs = require("fs");
const path = require("path");

const rpcUrl = process.env.MONITOR_WS_RPC_URL || process.env.SEPOLIA_WS_RPC_URL;
const contractAddress =
  process.env.CONTRACT_ADDRESS || "0x13e8e9f745E6E9f7Ab512fe25E153359AADCD73b";
const largeWithdrawalThresholdEth = process.env.LARGE_WITHDRAWAL_THRESHOLD_ETH || "10";

if (!rpcUrl) {
  throw new Error("Set MONITOR_WS_RPC_URL or SEPOLIA_WS_RPC_URL before running monitor.js");
}

if (!Web3.utils.isAddress(contractAddress)) {
  throw new Error(`Invalid CONTRACT_ADDRESS: ${contractAddress}`);
}

const artifactPath = path.join(
  process.cwd(),
  "artifacts",
  "contracts",
  "SimpleBankV2.sol",
  "SimpleBankV2.json"
);
const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
const contractABI = artifact.abi;

const web3 = new Web3(rpcUrl);
const contract = new web3.eth.Contract(contractABI, contractAddress);
const largeWithdrawalThreshold = web3.utils.toWei(largeWithdrawalThresholdEth, "ether");

async function main() {
  console.log(`Monitoring ${contractAddress} for WithdrawalMade events...`);

  const subscription = await contract.events.WithdrawalMade();

  subscription.on("data", (event) => {
    const { user, amount } = event.returnValues;
    const ethAmount = web3.utils.fromWei(amount, "ether");

    console.log(`WithdrawalMade: ${user} withdrew ${ethAmount} ETH`);

    if (BigInt(amount) > BigInt(largeWithdrawalThreshold)) {
      console.log(`Large withdrawal detected. Amount: ${ethAmount} ETH`);
    }
  });

  subscription.on("error", (error) => {
    console.error("Event subscription error:", error);
  });
}

main().catch((error) => {
  console.error("Monitor failed:", error);
  process.exitCode = 1;
});
