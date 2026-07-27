const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const ACTIONS = new Set([
  "set-strategy",
  "invest",
  "divest",
  "divest-all",
  "set-treasury",
  "set-performance-fee",
  "set-max-total-assets",
  "pause",
  "unpause",
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
  const action = normalizeEnvValue(process.env.ACTION || "set-strategy");
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
    throw new Error(`${name} must be an integer basis-point value, got: ${process.env[name]}`);
  }

  return Number(rawBps);
}

function parseAddressEnv(name, fallback = "") {
  const address = normalizeEnvValue(process.env[name] || fallback);
  if (!hre.ethers.isAddress(address) || address === hre.ethers.ZeroAddress) {
    throw new Error(`${name} must be a non-zero address, got: ${address || "(empty)"}`);
  }

  return address;
}

function getStrategyVaultDeploymentPath(networkName) {
  const customPath = normalizeEnvValue(process.env.VAULT_DEPLOYMENT_FILE);
  if (customPath) {
    return path.isAbsolute(customPath) ? customPath : path.join(process.cwd(), customPath);
  }

  return path.join(process.cwd(), "deployments", `strategy-vault-${networkName}.json`);
}

function readStrategyVaultDeployment(networkName) {
  const deploymentPath = getStrategyVaultDeploymentPath(networkName);
  if (!fs.existsSync(deploymentPath)) {
    throw new Error(`${deploymentPath} does not exist. Deploy the strategy vault or set VAULT_ADDRESS.`);
  }

  return JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
}

function resolveVaultAddress(networkName, deployment) {
  const configuredAddress = normalizeEnvValue(process.env.VAULT_ADDRESS);
  if (configuredAddress) {
    if (!hre.ethers.isAddress(configuredAddress)) {
      throw new Error(`Invalid VAULT_ADDRESS: ${configuredAddress}`);
    }

    return configuredAddress;
  }

  if (!hre.ethers.isAddress(deployment.contractAddress)) {
    throw new Error(`Invalid contractAddress in ${getStrategyVaultDeploymentPath(networkName)}`);
  }

  return deployment.contractAddress;
}

async function main() {
  const action = parseAction();
  const networkName = hre.network.name;
  const deployment = readStrategyVaultDeployment(networkName);
  const vaultAddress = resolveVaultAddress(networkName, deployment);
  const contractName = deployment.contractName || "SimpleWETHYieldVaultV2";
  const vault = await hre.ethers.getContractAt(contractName, vaultAddress);

  let data;
  let value = 0n;

  if (action === "set-strategy") {
    const strategyAddress = parseAddressEnv("STRATEGY_ADDRESS", deployment.strategyAddress);
    data = vault.interface.encodeFunctionData("setStrategy", [strategyAddress]);
  }

  if (action === "invest") {
    const amount = parseEthAmountEnv("INVEST_AMOUNT_ETH");
    data = vault.interface.encodeFunctionData("invest", [amount]);
  }

  if (action === "divest") {
    const amount = parseEthAmountEnv("DIVEST_AMOUNT_ETH");
    data = vault.interface.encodeFunctionData("divest", [amount]);
  }

  if (action === "divest-all") {
    data = vault.interface.encodeFunctionData("divestAll", []);
  }

  if (action === "set-treasury") {
    const treasury = parseAddressEnv("VAULT_TREASURY");
    data = vault.interface.encodeFunctionData("setTreasury", [treasury]);
  }

  if (action === "set-performance-fee") {
    const feeBps = parseBpsEnv("VAULT_PERFORMANCE_FEE_BPS");
    data = vault.interface.encodeFunctionData("setPerformanceFeeBps", [feeBps]);
  }

  if (action === "set-max-total-assets") {
    const maxTotalAssets = parseEthAmountEnv("VAULT_MAX_TOTAL_ASSETS_ETH");
    data = vault.interface.encodeFunctionData("setMaxTotalAssets", [maxTotalAssets]);
  }

  if (action === "pause") {
    data = vault.interface.encodeFunctionData("pause", []);
  }

  if (action === "unpause") {
    data = vault.interface.encodeFunctionData("unpause", []);
  }

  const owner = await vault.owner();

  console.log("\nStrategy vault Safe transaction fields");
  console.log("Network:", networkName);
  console.log("Vault owner:", owner);
  console.log("To:", vaultAddress);
  console.log("Value wei:", value.toString());
  console.log("Value ETH:", hre.ethers.formatEther(value));
  console.log("Data:", data);
  console.log("Operation: Call");
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Strategy vault encoding failed:", error);
    process.exitCode = 1;
  });
}

module.exports = {
  main,
};
