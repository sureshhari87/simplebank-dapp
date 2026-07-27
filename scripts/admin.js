const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const ACTIONS = new Set([
  "status",
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

function parseAction() {
  const action = normalizeEnvValue(process.env.ACTION || "status");
  if (!ACTIONS.has(action)) {
    throw new Error(`ACTION must be one of ${Array.from(ACTIONS).join(", ")}, got: ${action}`);
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

  return BigInt(rawBps);
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
  if (days === 0n) {
    throw new Error(`${name} must be greater than zero`);
  }

  return days;
}

function getDeploymentPath(networkName) {
  return path.join(process.cwd(), "deployments", `${networkName}.json`);
}

function readDeployment(networkName) {
  const deploymentPath = getDeploymentPath(networkName);
  if (!fs.existsSync(deploymentPath)) {
    throw new Error(`${deploymentPath} does not exist. Set CONTRACT_ADDRESS or deploy first.`);
  }

  return JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
}

function resolveContractAddress(networkName) {
  const configuredAddress = normalizeEnvValue(process.env.CONTRACT_ADDRESS);
  if (configuredAddress) {
    if (!hre.ethers.isAddress(configuredAddress)) {
      throw new Error(`Invalid CONTRACT_ADDRESS: ${configuredAddress}`);
    }

    return configuredAddress;
  }

  const deployment = readDeployment(networkName);
  if (!hre.ethers.isAddress(deployment.contractAddress)) {
    throw new Error(`Invalid contractAddress in ${getDeploymentPath(networkName)}`);
  }

  return deployment.contractAddress;
}

function resolveContractName(networkName) {
  const configuredName = normalizeEnvValue(process.env.CONTRACT_NAME);
  if (configuredName) return configuredName;

  const deployment = readDeployment(networkName);
  return deployment.contractName || "SimpleBankV2";
}

async function requireOwner(bank, signer) {
  const owner = await bank.owner();
  if (owner.toLowerCase() !== signer.address.toLowerCase()) {
    throw new Error(
      `Signer ${signer.address} is not contract owner ${owner}. ` +
        "Use the owner private key, execute this action through the owner Safe, or run ACTION=status for read-only status."
    );
  }

  return owner;
}

async function printStatus(bank, contractName, contractAddress, signer) {
  const [
    owner,
    interestReserve,
    totalDeposits,
    contractBalance,
    withdrawalLockDays,
  ] = await Promise.all([
    bank.owner(),
    bank.interestReserve(),
    bank.totalDeposits(),
    hre.ethers.provider.getBalance(contractAddress),
    bank.withdrawalLockDays(),
  ]);

  console.log("\nSimpleBank admin status");
  console.log("Network:", hre.network.name);
  console.log("Contract:", contractName);
  console.log("Address:", contractAddress);
  console.log("Signer:", signer.address);
  console.log("Owner:", owner);
  console.log("Total deposits:", `${hre.ethers.formatEther(totalDeposits)} ETH`);
  console.log("Interest reserve:", `${hre.ethers.formatEther(interestReserve)} ETH`);
  console.log("Contract balance:", `${hre.ethers.formatEther(contractBalance)} ETH`);
  console.log("Withdrawal lock:", `${withdrawalLockDays.toString()} days`);

  if (typeof bank.treasury === "function") {
    const [
      treasury,
      protocolFees,
      depositFeeBps,
      withdrawalFeeBps,
    ] = await Promise.all([
      bank.treasury(),
      bank.protocolFees(),
      bank.depositFeeBps(),
      bank.withdrawalFeeBps(),
    ]);

    console.log("Treasury:", treasury);
    console.log("Protocol fees:", `${hre.ethers.formatEther(protocolFees)} ETH`);
    console.log("Deposit fee:", `${depositFeeBps.toString()} bps`);
    console.log("Withdrawal fee:", `${withdrawalFeeBps.toString()} bps`);
  }
}

async function main() {
  const action = parseAction();
  const networkName = hre.network.name;
  const contractAddress = resolveContractAddress(networkName);
  const contractName = resolveContractName(networkName);
  const [signer] = await hre.ethers.getSigners();

  if (!signer) {
    throw new Error("No signer available. Check PRIVATE_KEY and network config.");
  }

  const bank = await hre.ethers.getContractAt(contractName, contractAddress, signer);

  if (action === "status") {
    await printStatus(bank, contractName, contractAddress, signer);
    return;
  }

  await requireOwner(bank, signer);

  if (action === "fund-reserve") {
    const amount = parseEthAmountEnv("RESERVE_AMOUNT_ETH");
    console.log(`Funding interest reserve with ${hre.ethers.formatEther(amount)} ETH...`);
    const tx = await bank.fundInterestReserve({ value: amount });
    await tx.wait();
    console.log("Interest reserve funded.");
    console.log("Tx:", tx.hash);
    return;
  }

  if (action === "set-withdrawal-lock") {
    const daysLock = parseDaysEnv("WITHDRAWAL_LOCK_DAYS");
    const [minDays, maxDays] = await Promise.all([
      bank.MIN_WITHDRAWAL_LOCK_DAYS(),
      bank.MAX_WITHDRAWAL_LOCK_DAYS(),
    ]);

    if (daysLock < minDays || daysLock > maxDays) {
      throw new Error(
        `WITHDRAWAL_LOCK_DAYS must be between ${minDays.toString()} and ${maxDays.toString()}`
      );
    }

    console.log(`Setting withdrawal lock to ${daysLock.toString()} days...`);
    const tx = await bank.setWithdrawalLockDays(daysLock);
    await tx.wait();
    console.log("Withdrawal lock updated.");
    console.log("Tx:", tx.hash);
    return;
  }

  if (contractName !== "SimpleBankV3") {
    throw new Error(`${action} requires SimpleBankV3`);
  }

  if (action === "set-deposit-fee") {
    const feeBps = parseBpsEnv("DEPOSIT_FEE_BPS");
    console.log(`Setting deposit fee to ${feeBps.toString()} bps...`);
    const tx = await bank.setDepositFeeBps(feeBps);
    await tx.wait();
    console.log("Deposit fee updated.");
    console.log("Tx:", tx.hash);
    return;
  }

  if (action === "set-withdrawal-fee") {
    const feeBps = parseBpsEnv("WITHDRAWAL_FEE_BPS");
    console.log(`Setting withdrawal fee to ${feeBps.toString()} bps...`);
    const tx = await bank.setWithdrawalFeeBps(feeBps);
    await tx.wait();
    console.log("Withdrawal fee updated.");
    console.log("Tx:", tx.hash);
    return;
  }

  if (action === "set-treasury") {
    const treasury = parseAddressEnv("BANK_TREASURY");
    console.log(`Setting bank treasury to ${treasury}...`);
    const tx = await bank.setTreasury(treasury);
    await tx.wait();
    console.log("Bank treasury updated.");
    console.log("Tx:", tx.hash);
    return;
  }

  if (action === "claim-fees") {
    console.log("Claiming protocol fees...");
    const tx = await bank.claimProtocolFees();
    await tx.wait();
    console.log("Protocol fees claimed.");
    console.log("Tx:", tx.hash);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Admin action failed:", error);
    process.exitCode = 1;
  });
}

module.exports = {
  main,
  normalizeEnvValue,
  resolveContractAddress,
  resolveContractName,
};
