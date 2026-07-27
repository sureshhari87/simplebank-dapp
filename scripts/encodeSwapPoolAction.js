const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const ACTIONS = new Set([
  "status",
  "set-treasury",
  "set-swap-fee",
  "set-protocol-fee-share",
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

function getSwapDeploymentPath(networkName) {
  const customPath = normalizeEnvValue(process.env.SWAP_DEPLOYMENT_FILE);
  if (customPath) {
    return path.isAbsolute(customPath) ? customPath : path.join(process.cwd(), customPath);
  }

  return path.join(process.cwd(), "deployments", `swap-pool-${networkName}.json`);
}

function readSwapDeployment(networkName) {
  const deploymentPath = getSwapDeploymentPath(networkName);
  if (!fs.existsSync(deploymentPath)) {
    throw new Error(`${deploymentPath} does not exist. Deploy the swap pool or set SWAP_POOL_ADDRESS.`);
  }

  return JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
}

function resolvePoolAddress(networkName, deployment) {
  const configuredAddress = normalizeEnvValue(process.env.SWAP_POOL_ADDRESS);
  if (configuredAddress) {
    if (!hre.ethers.isAddress(configuredAddress)) {
      throw new Error(`Invalid SWAP_POOL_ADDRESS: ${configuredAddress}`);
    }

    return configuredAddress;
  }

  if (!hre.ethers.isAddress(deployment.contractAddress)) {
    throw new Error(`Invalid contractAddress in ${getSwapDeploymentPath(networkName)}`);
  }

  return deployment.contractAddress;
}

async function printStatus(pool, poolAddress) {
  const [
    owner,
    treasury,
    paused,
    token0,
    token1,
    swapFeeBps,
    protocolFeeShareBps,
    protocolFees0,
    protocolFees1,
  ] = await Promise.all([
    pool.owner(),
    pool.treasury(),
    pool.paused(),
    pool.token0(),
    pool.token1(),
    pool.swapFeeBps(),
    pool.protocolFeeShareBps(),
    pool.protocolFees0(),
    pool.protocolFees1(),
  ]);

  console.log("\nSimpleSwapPool Safe transaction encoder");
  console.log("Network:", hre.network.name);
  console.log("Pool:", poolAddress);
  console.log("Owner:", owner);
  console.log("Treasury:", treasury);
  console.log("Paused:", paused ? "yes" : "no");
  console.log("Token0:", token0);
  console.log("Token1:", token1);
  console.log("Swap fee:", `${swapFeeBps.toString()} bps`);
  console.log("Protocol fee share:", `${protocolFeeShareBps.toString()} bps`);
  console.log("Protocol fees0:", protocolFees0.toString());
  console.log("Protocol fees1:", protocolFees1.toString());
  console.log("");
  console.log("Set ACTION to one of:");
  console.log(Array.from(ACTIONS).filter((action) => action !== "status").join(", "));
}

async function main() {
  const action = parseAction();
  const networkName = hre.network.name;
  const deployment = readSwapDeployment(networkName);
  const poolAddress = resolvePoolAddress(networkName, deployment);
  const pool = await hre.ethers.getContractAt("SimpleSwapPool", poolAddress);

  if (action === "status") {
    await printStatus(pool, poolAddress);
    return;
  }

  let data;

  if (action === "set-treasury") {
    const treasury = parseAddressEnv("SWAP_TREASURY");
    data = pool.interface.encodeFunctionData("setTreasury", [treasury]);
  }

  if (action === "set-swap-fee") {
    const feeBps = parseUintEnv("SWAP_FEE_BPS");
    data = pool.interface.encodeFunctionData("setSwapFeeBps", [feeBps]);
  }

  if (action === "set-protocol-fee-share") {
    const shareBps = parseUintEnv("SWAP_PROTOCOL_FEE_SHARE_BPS");
    data = pool.interface.encodeFunctionData("setProtocolFeeShareBps", [shareBps]);
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

  console.log("\nSwap pool Safe transaction fields");
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
    console.error("Swap pool encoding failed:", error);
    process.exitCode = 1;
  });
}

module.exports = {
  main,
};
