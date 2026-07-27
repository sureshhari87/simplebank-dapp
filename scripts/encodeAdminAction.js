const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const ACTIONS = new Set([
  "fund-reserve",
  "set-deposit-fee",
  "set-withdrawal-fee",
  "set-treasury",
  "set-withdrawal-lock",
  "claim-fees",
]);

function normalizeEnvValue(value) {
  const normalized = (value || "").trim();
  if (
    (normalized.startsWith('"') && normalized.endsWith('"')) ||
    (normalized.startsWith("'") && normalized.endsWith("'"))
  ) {
    return normalized.slice(1, -1).trim();
  }

  return normalized;
}

function getDeploymentPath(networkName) {
  return path.join(process.cwd(), "deployments", `${networkName}.json`);
}

function readDeployment(networkName) {
  const deploymentPath = getDeploymentPath(networkName);
  if (!fs.existsSync(deploymentPath)) {
    throw new Error(`${deploymentPath} does not exist`);
  }

  return JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
}

function parseAction() {
  const action = normalizeEnvValue(process.env.ACTION);
  if (!ACTIONS.has(action)) {
    throw new Error(`ACTION must be one of ${Array.from(ACTIONS).join(", ")}, got: ${action || "(empty)"}`);
  }

  return action;
}

function parseEthAmountEnv(name) {
  const rawAmount = normalizeEnvValue(process.env[name]);
  if (!/^\d+(\.\d+)?$/.test(rawAmount)) {
    throw new Error(`${name} must be a non-negative ETH amount, got: ${process.env[name]}`);
  }

  return hre.ethers.parseEther(rawAmount);
}

function parseBpsEnv(name) {
  const rawBps = normalizeEnvValue(process.env[name]);
  if (!/^\d+$/.test(rawBps)) {
    throw new Error(`${name} must be a non-negative integer basis-point value, got: ${process.env[name]}`);
  }

  const feeBps = BigInt(rawBps);
  if (feeBps > 100n) {
    throw new Error(`${name} cannot exceed the SimpleBankV3 on-chain cap of 100 bps`);
  }

  return feeBps;
}

function parseAddressEnv(name) {
  const address = normalizeEnvValue(process.env[name]);
  if (!hre.ethers.isAddress(address) || address === hre.ethers.ZeroAddress) {
    throw new Error(`${name} must be a non-zero address, got: ${address || "(empty)"}`);
  }

  return address;
}

function parseDaysEnv(name) {
  const rawDays = normalizeEnvValue(process.env[name]);
  if (!/^\d+$/.test(rawDays)) {
    throw new Error(`${name} must be a positive integer day value, got: ${process.env[name]}`);
  }

  const days = BigInt(rawDays);
  if (days < 1n || days > 30n) {
    throw new Error(`${name} must be between the SimpleBank on-chain bounds of 1 and 30 days`);
  }

  return days;
}

async function main() {
  const action = parseAction();
  const deployment = readDeployment(hre.network.name);
  const contractName = deployment.contractName || "SimpleBankV2";
  const contractAddress = normalizeEnvValue(process.env.CONTRACT_ADDRESS) || deployment.contractAddress;

  if (contractName !== "SimpleBankV3") {
    throw new Error(`Admin fee actions require SimpleBankV3, got ${contractName}`);
  }

  if (!hre.ethers.isAddress(contractAddress)) {
    throw new Error(`Invalid contract address: ${contractAddress}`);
  }

  const artifact = await hre.artifacts.readArtifact(contractName);
  const iface = new hre.ethers.Interface(artifact.abi);
  let value = 0n;
  let data;

  if (action === "fund-reserve") {
    value = parseEthAmountEnv("RESERVE_AMOUNT_ETH");
    data = iface.encodeFunctionData("fundInterestReserve", []);
  } else if (action === "set-deposit-fee") {
    data = iface.encodeFunctionData("setDepositFeeBps", [parseBpsEnv("DEPOSIT_FEE_BPS")]);
  } else if (action === "set-withdrawal-fee") {
    data = iface.encodeFunctionData("setWithdrawalFeeBps", [parseBpsEnv("WITHDRAWAL_FEE_BPS")]);
  } else if (action === "set-treasury") {
    data = iface.encodeFunctionData("setTreasury", [parseAddressEnv("BANK_TREASURY")]);
  } else if (action === "set-withdrawal-lock") {
    data = iface.encodeFunctionData("setWithdrawalLockDays", [parseDaysEnv("WITHDRAWAL_LOCK_DAYS")]);
  } else if (action === "claim-fees") {
    data = iface.encodeFunctionData("claimProtocolFees", []);
  }

  console.log("\nSafe transaction fields");
  console.log("Network:", hre.network.name);
  console.log("Safe owner:", deployment.owner);
  console.log("To:", contractAddress);
  console.log("Value wei:", value.toString());
  console.log("Value ETH:", hre.ethers.formatEther(value));
  console.log("Data:", data);
  console.log("Operation:", "Call");
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Admin calldata encoding failed:", error);
    process.exitCode = 1;
  });
}

module.exports = {
  main,
};
