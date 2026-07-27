const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const ACTIONS = new Set(["status"]);

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

async function printStatus(manager, managerAddress) {
  const [
    asset,
    vault,
    owner,
    defaultStrategy,
    idleAssets,
    totalStrategyAssets,
    totalAssets,
    strategyAddresses,
  ] = await Promise.all([
    manager.asset(),
    manager.vault(),
    manager.owner(),
    manager.defaultStrategy(),
    manager.idleAssets(),
    manager.totalStrategyAssets(),
    manager.totalAssets(),
    manager.getStrategies(),
  ]);

  console.log("\nSimpleStrategyManager status");
  console.log("Network:", hre.network.name);
  console.log("Manager:", managerAddress);
  console.log("Asset:", asset);
  console.log("Vault:", vault);
  console.log("Owner:", owner);
  console.log("Default strategy:", defaultStrategy);
  console.log("Idle assets:", `${hre.ethers.formatEther(idleAssets)} WETH`);
  console.log("Strategy assets:", `${hre.ethers.formatEther(totalStrategyAssets)} WETH`);
  console.log("Total assets:", `${hre.ethers.formatEther(totalAssets)} WETH`);
  console.log("Strategy count:", strategyAddresses.length);

  for (const strategyAddress of strategyAddresses) {
    const [config, assets, capacity] = await Promise.all([
      manager.strategyConfigs(strategyAddress),
      manager.strategyAssets(strategyAddress),
      manager.availableStrategyCapacity(strategyAddress),
    ]);

    const capacityText = capacity === hre.ethers.MaxUint256
      ? "uncapped"
      : `${hre.ethers.formatEther(capacity)} WETH`;

    console.log("");
    console.log("Strategy:", strategyAddress);
    console.log("  Approved:", config.approved ? "yes" : "no");
    console.log("  Cap:", config.maxAssets === 0n ? "uncapped" : `${hre.ethers.formatEther(config.maxAssets)} WETH`);
    console.log("  Assets:", `${hre.ethers.formatEther(assets)} WETH`);
    console.log("  Remaining capacity:", capacityText);
  }
}

async function main() {
  const action = parseAction();
  const networkName = hre.network.name;
  const deployment = readStrategyManagerDeployment(networkName);
  const managerAddress = resolveManagerAddress(networkName, deployment);
  const manager = await hre.ethers.getContractAt("SimpleStrategyManager", managerAddress);

  if (action === "status") {
    await printStatus(manager, managerAddress);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Strategy manager action failed:", error);
    process.exitCode = 1;
  });
}

module.exports = {
  main,
};
