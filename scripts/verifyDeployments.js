const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

function readJsonIfExists(fileName) {
  const targetPath = path.join(process.cwd(), "deployments", fileName);
  if (!fs.existsSync(targetPath)) return null;
  return JSON.parse(fs.readFileSync(targetPath, "utf8"));
}

function isAddress(value) {
  return hre.ethers.isAddress(value || "") && value !== hre.ethers.ZeroAddress;
}

function argsFrom(deployment, key = "constructorArgs") {
  return Array.isArray(deployment?.[key]) ? deployment[key] : [];
}

function addDeploymentTarget(targets, deployment, label, contract, argsKey = "constructorArgs") {
  if (!deployment || !isAddress(deployment.contractAddress)) return;
  targets.push({
    label,
    address: deployment.contractAddress,
    contract,
    constructorArguments: argsFrom(deployment, argsKey),
  });
}

function addStrategyTarget(targets, deployment, label) {
  if (!deployment || !isAddress(deployment.strategyAddress)) return;
  targets.push({
    label,
    address: deployment.strategyAddress,
    contract: "contracts/strategies/AaveV3WETHStrategy.sol:AaveV3WETHStrategy",
    constructorArguments: argsFrom(deployment, "strategyConstructorArgs"),
  });
}

function buildTargets(networkName) {
  const bank = readJsonIfExists(`${networkName}.json`);
  const treasury = readJsonIfExists(`treasury-${networkName}.json`);
  const vault = readJsonIfExists(`strategy-vault-${networkName}.json`);
  const manager = readJsonIfExists(`strategy-manager-${networkName}.json`);
  const lending = readJsonIfExists(`lending-pool-${networkName}.json`);
  const swap = readJsonIfExists(`swap-pool-${networkName}.json`);

  const targets = [];
  addDeploymentTarget(targets, bank, "SimpleBankV3", "contracts/SimpleBankV3.sol:SimpleBankV3");
  addDeploymentTarget(targets, treasury, "SimpleTreasury", "contracts/SimpleTreasury.sol:SimpleTreasury");
  addDeploymentTarget(targets, vault, "SimpleWETHYieldVaultV2", "contracts/SimpleWETHYieldVaultV2.sol:SimpleWETHYieldVaultV2");
  addStrategyTarget(targets, vault, "Vault-owned AaveV3WETHStrategy");
  addDeploymentTarget(targets, manager, "SimpleStrategyManager", "contracts/strategies/SimpleStrategyManager.sol:SimpleStrategyManager");
  addStrategyTarget(targets, manager, "Manager-owned AaveV3WETHStrategy");
  addDeploymentTarget(targets, lending, "SimpleLendingPool", "contracts/SimpleLendingPool.sol:SimpleLendingPool");
  addDeploymentTarget(targets, swap, "SimpleSwapPool", "contracts/SimpleSwapPool.sol:SimpleSwapPool");

  return targets;
}

async function verifyTarget(target) {
  console.log("");
  console.log("Verifying:", target.label);
  console.log("Address:", target.address);
  console.log("Contract:", target.contract);

  try {
    await hre.run("verify:verify", {
      address: target.address,
      constructorArguments: target.constructorArguments,
      contract: target.contract,
    });
    console.log("Verification complete.");
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    if (/already verified/i.test(message)) {
      console.log("Already verified.");
      return;
    }

    throw error;
  }
}

async function main() {
  const networkName = hre.network.name;
  if (networkName === "mainnet" && !(process.env.ETHERSCAN_API_KEY || "").trim()) {
    throw new Error("ETHERSCAN_API_KEY is required for mainnet verification");
  }

  const targets = buildTargets(networkName);
  if (targets.length === 0) {
    throw new Error(`No deployment targets found for ${networkName}`);
  }

  console.log("\nSimpleBank deployment verification");
  console.log("Network:", networkName);
  console.log("Targets:", targets.length);

  for (const target of targets) {
    await verifyTarget(target);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Deployment verification failed:", error);
    process.exitCode = 1;
  });
}

module.exports = {
  buildTargets,
  main,
};
