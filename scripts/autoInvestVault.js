const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const BPS_DENOMINATOR = 10000n;
const MAX_BPS = 10000n;

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

function parseBpsEnv(name, fallback) {
  const rawValue = normalizeEnvValue(process.env[name] || fallback);
  if (!/^\d+$/.test(rawValue)) {
    throw new Error(`${name} must be an integer bps value, got: ${process.env[name] || fallback}`);
  }

  const value = BigInt(rawValue);
  if (value > MAX_BPS) {
    throw new Error(`${name} cannot exceed ${MAX_BPS.toString()} bps`);
  }

  return value;
}

function parseEthAmountEnv(name, fallback = "") {
  const rawAmount = normalizeEnvValue(process.env[name] || fallback);
  if (!/^\d+(\.\d+)?$/.test(rawAmount)) {
    throw new Error(`${name} must be a non-negative ETH amount, got: ${process.env[name] || fallback}`);
  }

  return hre.ethers.parseEther(rawAmount);
}

function parseOptionalEthAmountEnv(name) {
  const rawAmount = normalizeEnvValue(process.env[name]);
  if (!rawAmount) return null;
  if (!/^\d+(\.\d+)?$/.test(rawAmount)) {
    throw new Error(`${name} must be a non-negative ETH amount, got: ${process.env[name]}`);
  }

  return hre.ethers.parseEther(rawAmount);
}

function isTruthyEnv(name) {
  const value = normalizeEnvValue(process.env[name]).toLowerCase();
  return value === "1" || value === "true" || value === "yes";
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

async function getManagerCapacity(strategyAddress) {
  try {
    const manager = await hre.ethers.getContractAt("SimpleStrategyManager", strategyAddress);
    const defaultStrategy = await manager.defaultStrategy();
    if (defaultStrategy === hre.ethers.ZeroAddress) {
      return { isManager: true, defaultStrategy, capacity: 0n };
    }

    const capacity = await manager.availableStrategyCapacity(defaultStrategy);
    return { isManager: true, defaultStrategy, capacity };
  } catch {
    return { isManager: false, defaultStrategy: hre.ethers.ZeroAddress, capacity: hre.ethers.MaxUint256 };
  }
}

function min(a, b) {
  return a < b ? a : b;
}

async function main() {
  const networkName = hre.network.name;
  const deployment = readStrategyVaultDeployment(networkName);
  const vaultAddress = resolveVaultAddress(networkName, deployment);
  const contractName = deployment.contractName || "SimpleWETHYieldVaultV2";
  const vault = await hre.ethers.getContractAt(contractName, vaultAddress);
  const signers = await hre.ethers.getSigners();
  const signer = signers[0] || null;

  const idleBufferBps = parseBpsEnv("IDLE_BUFFER_BPS", "2000");
  const minimumInvest = parseEthAmountEnv("MIN_INVEST_ETH", "0.000001");
  const maxInvest = parseOptionalEthAmountEnv("MAX_INVEST_ETH");
  const execute = isTruthyEnv("EXECUTE");

  const [
    owner,
    paused,
    totalAssets,
    idleAssets,
    strategyAssets,
    strategyAddress,
  ] = await Promise.all([
    vault.owner(),
    vault.paused(),
    vault.totalAssets(),
    vault.idleAssets(),
    vault.strategyAssets(),
    vault.strategy(),
  ]);

  const targetIdle = (totalAssets * idleBufferBps) / BPS_DENOMINATOR;
  let investAmount = idleAssets > targetIdle ? idleAssets - targetIdle : 0n;
  if (maxInvest !== null) {
    investAmount = min(investAmount, maxInvest);
  }

  const managerCapacity = await getManagerCapacity(strategyAddress);
  if (managerCapacity.isManager && managerCapacity.capacity !== hre.ethers.MaxUint256) {
    investAmount = min(investAmount, managerCapacity.capacity);
  }

  console.log("\nSimpleWETHYieldVault auto-invest keeper");
  console.log("Network:", networkName);
  console.log("Vault:", vaultAddress);
  console.log("Owner:", owner);
  console.log("Strategy:", strategyAddress);
  console.log("Paused:", paused ? "yes" : "no");
  console.log("Total assets:", `${hre.ethers.formatEther(totalAssets)} WETH`);
  console.log("Idle assets:", `${hre.ethers.formatEther(idleAssets)} WETH`);
  console.log("Strategy assets:", `${hre.ethers.formatEther(strategyAssets)} WETH`);
  console.log("Idle buffer:", `${idleBufferBps.toString()} bps`);
  console.log("Target idle:", `${hre.ethers.formatEther(targetIdle)} WETH`);
  console.log("Minimum invest:", `${hre.ethers.formatEther(minimumInvest)} WETH`);
  if (maxInvest !== null) console.log("Max invest:", `${hre.ethers.formatEther(maxInvest)} WETH`);
  if (managerCapacity.isManager) {
    console.log("Manager default strategy:", managerCapacity.defaultStrategy);
    console.log(
      "Manager remaining capacity:",
      managerCapacity.capacity === hre.ethers.MaxUint256
        ? "uncapped"
        : `${hre.ethers.formatEther(managerCapacity.capacity)} WETH`
    );
  }

  if (paused) {
    console.log("\nNo action: vault is paused.");
    return;
  }

  if (strategyAddress === hre.ethers.ZeroAddress) {
    console.log("\nNo action: vault strategy is not set.");
    return;
  }

  if (investAmount < minimumInvest) {
    console.log("\nNo action: calculated invest amount is below MIN_INVEST_ETH.");
    console.log("Calculated invest:", `${hre.ethers.formatEther(investAmount)} WETH`);
    return;
  }

  const data = vault.interface.encodeFunctionData("invest", [investAmount]);
  console.log("\nRecommended invest:", `${hre.ethers.formatEther(investAmount)} WETH`);

  if (execute) {
    if (!signer) throw new Error("EXECUTE=true requires PRIVATE_KEY signer.");
    if (owner.toLowerCase() !== signer.address.toLowerCase()) {
      throw new Error(`EXECUTE=true signer ${signer.address} is not vault owner ${owner}. Use Safe calldata instead.`);
    }

    const tx = await vault.connect(signer).invest(investAmount);
    await tx.wait();
    console.log("Invest executed.");
    console.log("Tx:", tx.hash);
    return;
  }

  console.log("\nSafe transaction fields");
  console.log("To:", vaultAddress);
  console.log("Value wei: 0");
  console.log("Value ETH: 0.0");
  console.log("Data:", data);
  console.log("Operation: Call");
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Auto-invest keeper failed:", error);
    process.exitCode = 1;
  });
}

module.exports = {
  main,
};
