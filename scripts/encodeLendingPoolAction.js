const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const ACTIONS = new Set([
  "status",
  "set-treasury",
  "set-borrow-apr",
  "set-origination-fee",
  "set-risk-params",
  "set-max-pool-liquidity",
  "pause",
  "unpause",
  "claim-protocol-fees",
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

function parseUintEnv(name) {
  const rawValue = normalizeEnvValue(process.env[name]);
  if (!/^\d+$/.test(rawValue)) {
    throw new Error(`${name} must be an integer value, got: ${process.env[name]}`);
  }

  return BigInt(rawValue);
}

function parseAddressEnv(name, fallback = "") {
  const address = normalizeEnvValue(process.env[name] || fallback);
  if (!hre.ethers.isAddress(address) || address === hre.ethers.ZeroAddress) {
    throw new Error(`${name} must be a non-zero address, got: ${address || "(empty)"}`);
  }

  return address;
}

function getLendingDeploymentPath(networkName) {
  const customPath = normalizeEnvValue(process.env.LENDING_DEPLOYMENT_FILE);
  if (customPath) {
    return path.isAbsolute(customPath) ? customPath : path.join(process.cwd(), customPath);
  }

  return path.join(process.cwd(), "deployments", `lending-pool-${networkName}.json`);
}

function readLendingDeployment(networkName) {
  const deploymentPath = getLendingDeploymentPath(networkName);
  if (!fs.existsSync(deploymentPath)) {
    throw new Error(`${deploymentPath} does not exist. Deploy the lending pool or set LENDING_POOL_ADDRESS.`);
  }

  return JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
}

function resolvePoolAddress(networkName, deployment) {
  const configuredAddress = normalizeEnvValue(process.env.LENDING_POOL_ADDRESS);
  if (configuredAddress) {
    if (!hre.ethers.isAddress(configuredAddress)) {
      throw new Error(`Invalid LENDING_POOL_ADDRESS: ${configuredAddress}`);
    }

    return configuredAddress;
  }

  if (!hre.ethers.isAddress(deployment.contractAddress)) {
    throw new Error(`Invalid contractAddress in ${getLendingDeploymentPath(networkName)}`);
  }

  return deployment.contractAddress;
}

async function printStatus(pool, poolAddress) {
  const [
    owner,
    treasury,
    paused,
    borrowAprBps,
    originationFeeBps,
    maxLtvBps,
    liquidationThresholdBps,
    liquidationBonusBps,
    maxPoolLiquidity,
    protocolFees,
  ] = await Promise.all([
    pool.owner(),
    pool.treasury(),
    pool.paused(),
    pool.borrowAprBps(),
    pool.originationFeeBps(),
    pool.maxLtvBps(),
    pool.liquidationThresholdBps(),
    pool.liquidationBonusBps(),
    pool.maxPoolLiquidity(),
    pool.protocolFees(),
  ]);

  console.log("\nSimpleLendingPool Safe transaction encoder");
  console.log("Network:", hre.network.name);
  console.log("Pool:", poolAddress);
  console.log("Owner:", owner);
  console.log("Treasury:", treasury);
  console.log("Paused:", paused ? "yes" : "no");
  console.log("Borrow APR:", `${borrowAprBps.toString()} bps`);
  console.log("Origination fee:", `${originationFeeBps.toString()} bps`);
  console.log("Max LTV:", `${maxLtvBps.toString()} bps`);
  console.log("Liquidation threshold:", `${liquidationThresholdBps.toString()} bps`);
  console.log("Liquidation bonus:", `${liquidationBonusBps.toString()} bps`);
  console.log("Max pool liquidity:", maxPoolLiquidity === 0n ? "uncapped" : `${hre.ethers.formatEther(maxPoolLiquidity)} ETH`);
  console.log("Protocol fees:", `${hre.ethers.formatEther(protocolFees)} ETH`);
  console.log("");
  console.log("Set ACTION to one of:");
  console.log(Array.from(ACTIONS).filter((action) => action !== "status").join(", "));
}

async function main() {
  const action = parseAction();
  const networkName = hre.network.name;
  const deployment = readLendingDeployment(networkName);
  const poolAddress = resolvePoolAddress(networkName, deployment);
  const pool = await hre.ethers.getContractAt("SimpleLendingPool", poolAddress);

  if (action === "status") {
    await printStatus(pool, poolAddress);
    return;
  }

  let data;

  if (action === "set-treasury") {
    const treasury = parseAddressEnv("LENDING_TREASURY");
    data = pool.interface.encodeFunctionData("setTreasury", [treasury]);
  }

  if (action === "set-borrow-apr") {
    const borrowAprBps = parseUintEnv("LENDING_BORROW_APR_BPS");
    data = pool.interface.encodeFunctionData("setBorrowAprBps", [borrowAprBps]);
  }

  if (action === "set-origination-fee") {
    const originationFeeBps = parseUintEnv("LENDING_ORIGINATION_FEE_BPS");
    data = pool.interface.encodeFunctionData("setOriginationFeeBps", [originationFeeBps]);
  }

  if (action === "set-risk-params") {
    const maxLtvBps = parseUintEnv("LENDING_MAX_LTV_BPS");
    const liquidationThresholdBps = parseUintEnv("LENDING_LIQUIDATION_THRESHOLD_BPS");
    const liquidationBonusBps = parseUintEnv("LENDING_LIQUIDATION_BONUS_BPS");
    data = pool.interface.encodeFunctionData("setRiskParameters", [
      maxLtvBps,
      liquidationThresholdBps,
      liquidationBonusBps,
    ]);
  }

  if (action === "set-max-pool-liquidity") {
    const maxPoolLiquidity = parseEthAmountEnv("LENDING_MAX_POOL_LIQUIDITY_ETH");
    data = pool.interface.encodeFunctionData("setMaxPoolLiquidity", [maxPoolLiquidity]);
  }

  if (action === "pause") {
    data = pool.interface.encodeFunctionData("pause");
  }

  if (action === "unpause") {
    data = pool.interface.encodeFunctionData("unpause");
  }

  if (action === "claim-protocol-fees") {
    data = pool.interface.encodeFunctionData("claimProtocolFees");
  }

  const owner = await pool.owner();

  console.log("\nLending pool Safe transaction fields");
  console.log("Network:", networkName);
  console.log("Pool owner:", owner);
  console.log("To:", poolAddress);
  console.log("Value wei: 0");
  console.log("Value ETH: 0.0");
  console.log("Data:", data);
  console.log("Operation: Call");
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Lending pool encoding failed:", error);
    process.exitCode = 1;
  });
}

module.exports = {
  main,
};
