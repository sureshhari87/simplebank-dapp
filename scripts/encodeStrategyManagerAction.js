const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const ACTIONS = new Set([
  "add-strategy",
  "remove-strategy",
  "set-strategy-cap",
  "set-default-strategy",
  "invest",
  "divest",
  "divest-all",
  "rebalance",
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
  const action = normalizeEnvValue(process.env.ACTION || "add-strategy");
  if (!ACTIONS.has(action)) {
    throw new Error(`ACTION must be one of ${Array.from(ACTIONS).join(", ")}, got: ${action}`);
  }

  return action;
}

function parseEthAmountEnv(name, fallback = "") {
  const rawAmount = normalizeEnvValue(process.env[name] || fallback);
  if (!/^\d+(\.\d+)?$/.test(rawAmount)) {
    throw new Error(`${name} must be a non-negative ETH amount, got: ${process.env[name] || fallback}`);
  }

  return hre.ethers.parseEther(rawAmount);
}

function parseAddressEnv(name, fallback = "") {
  const address = normalizeEnvValue(process.env[name] || fallback);
  if (!hre.ethers.isAddress(address) || address === hre.ethers.ZeroAddress) {
    throw new Error(`${name} must be a non-zero address, got: ${address || "(empty)"}`);
  }

  return address;
}

function parseOptionalAddressEnv(name, fallback = "") {
  const address = normalizeEnvValue(process.env[name] || fallback);
  if (!address || address === "0" || address === hre.ethers.ZeroAddress) {
    return hre.ethers.ZeroAddress;
  }
  if (!hre.ethers.isAddress(address)) {
    throw new Error(`${name} must be an address or 0, got: ${address}`);
  }

  return address;
}

function parseBoolEnv(name, fallback) {
  const rawValue = normalizeEnvValue(process.env[name] || fallback).toLowerCase();
  return rawValue === "1" || rawValue === "true" || rawValue === "yes";
}

function getStrategyManagerDeploymentPath(networkName) {
  const customPath = normalizeEnvValue(process.env.MANAGER_DEPLOYMENT_FILE);
  if (customPath) {
    return path.isAbsolute(customPath) ? customPath : path.join(process.cwd(), customPath);
  }

  return path.join(process.cwd(), "deployments", `strategy-manager-${networkName}.json`);
}

function readStrategyManagerDeployment(networkName) {
  const deploymentPath = getStrategyManagerDeploymentPath(networkName);
  if (!fs.existsSync(deploymentPath)) {
    throw new Error(`${deploymentPath} does not exist. Deploy the strategy manager or set MANAGER_ADDRESS.`);
  }

  return JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
}

function resolveManagerAddress(networkName, deployment) {
  const configuredAddress = normalizeEnvValue(process.env.MANAGER_ADDRESS);
  if (configuredAddress) {
    if (!hre.ethers.isAddress(configuredAddress)) {
      throw new Error(`Invalid MANAGER_ADDRESS: ${configuredAddress}`);
    }

    return configuredAddress;
  }

  if (!hre.ethers.isAddress(deployment.contractAddress)) {
    throw new Error(`Invalid contractAddress in ${getStrategyManagerDeploymentPath(networkName)}`);
  }

  return deployment.contractAddress;
}

async function main() {
  const action = parseAction();
  const networkName = hre.network.name;
  const deployment = readStrategyManagerDeployment(networkName);
  const managerAddress = resolveManagerAddress(networkName, deployment);
  const manager = await hre.ethers.getContractAt("SimpleStrategyManager", managerAddress);

  let data;

  if (action === "add-strategy") {
    const strategyAddress = parseAddressEnv("STRATEGY_ADDRESS", deployment.strategyAddress);
    const maxAssets = parseEthAmountEnv("STRATEGY_MAX_ASSETS_ETH", deployment.initialStrategyMaxAssetsEth || "0");
    const makeDefault = parseBoolEnv("MAKE_DEFAULT", "true");
    data = manager.interface.encodeFunctionData("addStrategy", [strategyAddress, maxAssets, makeDefault]);
  }

  if (action === "remove-strategy") {
    const strategyAddress = parseAddressEnv("STRATEGY_ADDRESS", deployment.strategyAddress);
    data = manager.interface.encodeFunctionData("removeStrategy", [strategyAddress]);
  }

  if (action === "set-strategy-cap") {
    const strategyAddress = parseAddressEnv("STRATEGY_ADDRESS", deployment.strategyAddress);
    const maxAssets = parseEthAmountEnv("STRATEGY_MAX_ASSETS_ETH");
    data = manager.interface.encodeFunctionData("setStrategyCap", [strategyAddress, maxAssets]);
  }

  if (action === "set-default-strategy") {
    const strategyAddress = parseOptionalAddressEnv("STRATEGY_ADDRESS", deployment.strategyAddress);
    data = manager.interface.encodeFunctionData("setDefaultStrategy", [strategyAddress]);
  }

  if (action === "invest") {
    const strategyAddress = parseAddressEnv("STRATEGY_ADDRESS", deployment.strategyAddress);
    const assets = parseEthAmountEnv("INVEST_AMOUNT_ETH");
    data = manager.interface.encodeFunctionData("invest", [strategyAddress, assets]);
  }

  if (action === "divest") {
    const strategyAddress = parseAddressEnv("STRATEGY_ADDRESS", deployment.strategyAddress);
    const assets = parseEthAmountEnv("DIVEST_AMOUNT_ETH");
    data = manager.interface.encodeFunctionData("divest", [strategyAddress, assets]);
  }

  if (action === "divest-all") {
    const strategyAddress = parseAddressEnv("STRATEGY_ADDRESS", deployment.strategyAddress);
    data = manager.interface.encodeFunctionData("divestAll", [strategyAddress]);
  }

  if (action === "rebalance") {
    const fromStrategy = parseAddressEnv("FROM_STRATEGY");
    const toStrategy = parseAddressEnv("TO_STRATEGY");
    const assets = parseEthAmountEnv("REBALANCE_AMOUNT_ETH");
    data = manager.interface.encodeFunctionData("rebalance", [fromStrategy, toStrategy, assets]);
  }

  const owner = await manager.owner();

  console.log("\nStrategy manager Safe transaction fields");
  console.log("Network:", networkName);
  console.log("Manager owner:", owner);
  console.log("To:", managerAddress);
  console.log("Value wei: 0");
  console.log("Value ETH: 0.0");
  console.log("Data:", data);
  console.log("Operation: Call");
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Strategy manager encoding failed:", error);
    process.exitCode = 1;
  });
}

module.exports = {
  main,
};
