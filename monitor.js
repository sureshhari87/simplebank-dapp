const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

const rpcUrl = process.env.MONITOR_WS_RPC_URL || process.env.SEPOLIA_WS_RPC_URL;
const contractAddress =
  process.env.CONTRACT_ADDRESS || "0x13e8e9f745E6E9f7Ab512fe25E153359AADCD73b";
const largeWithdrawalThresholdEth = process.env.LARGE_WITHDRAWAL_THRESHOLD_ETH || "10";
const contractName = process.env.MONITOR_CONTRACT_NAME || "SimpleBankV3";
const contractFile = process.env.MONITOR_CONTRACT_FILE || `${contractName}.sol`;

if (!rpcUrl) {
  throw new Error("Set MONITOR_WS_RPC_URL or SEPOLIA_WS_RPC_URL before running monitor.js");
}

if (!ethers.isAddress(contractAddress)) {
  throw new Error(`Invalid CONTRACT_ADDRESS: ${contractAddress}`);
}

const artifactPath = path.join(
  process.cwd(),
  "artifacts",
  "contracts",
  contractFile,
  `${contractName}.json`
);
const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
const contractABI = artifact.abi;

const provider = new ethers.WebSocketProvider(rpcUrl);
const contract = new ethers.Contract(contractAddress, contractABI, provider);
const largeWithdrawalThreshold = ethers.parseEther(largeWithdrawalThresholdEth);

async function main() {
  console.log(`Monitoring ${contractAddress} for WithdrawalMade events...`);

  contract.on("WithdrawalMade", (user, amount) => {
    const ethAmount = ethers.formatEther(amount);

    console.log(`WithdrawalMade: ${user} withdrew ${ethAmount} ETH`);

    if (amount > largeWithdrawalThreshold) {
      console.log(`Large withdrawal detected. Amount: ${ethAmount} ETH`);
    }
  });

  provider.websocket?.on?.("error", (error) => {
    console.error("Event subscription error:", error);
  });

  process.once("SIGINT", async () => {
    contract.removeAllListeners();
    await provider.destroy();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error("Monitor failed:", error);
  process.exitCode = 1;
});
