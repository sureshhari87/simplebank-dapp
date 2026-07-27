const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const MAX_PERFORMANCE_FEE_BPS = 2000;

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

function parseEthAmount(rawAmount, name) {
  const normalized = normalizeEnvValue(rawAmount);
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw new Error(`${name} must be a non-negative ETH amount, got: ${rawAmount}`);
  }

  return hre.ethers.parseEther(normalized);
}

function parseBpsEnv(name, fallback) {
  const rawBps = normalizeEnvValue(process.env[name] || fallback);
  if (!/^\d+$/.test(rawBps)) {
    throw new Error(`${name} must be an integer basis-point value, got: ${process.env[name]}`);
  }

  const feeBps = Number(rawBps);
  if (feeBps > MAX_PERFORMANCE_FEE_BPS) {
    throw new Error(`${name} ${feeBps} exceeds max ${MAX_PERFORMANCE_FEE_BPS}`);
  }

  return feeBps;
}

function parseAddressEnv(name, fallback = "") {
  const address = normalizeEnvValue(process.env[name] || fallback);
  if (!hre.ethers.isAddress(address) || address === hre.ethers.ZeroAddress) {
    throw new Error(`${name} must be a non-zero address, got: ${address || "(empty)"}`);
  }

  return address;
}

function getStrategyVaultDeploymentPath(networkName) {
  return path.join(process.cwd(), "deployments", `strategy-vault-${networkName}.json`);
}

async function main() {
  const networkName = hre.network.name;
  const [deployer] = await hre.ethers.getSigners();
  if (!deployer) {
    throw new Error("No deployer signer available. Check PRIVATE_KEY and network config.");
  }

  const wethAddress = parseAddressEnv("WETH_ADDRESS");
  const aavePoolAddress = parseAddressEnv("AAVE_POOL_ADDRESS");
  const aaveATokenAddress = parseAddressEnv("AAVE_AWETH_ADDRESS");
  const initialOwner = parseAddressEnv("VAULT_OWNER", process.env.INITIAL_OWNER || deployer.address);
  const treasury = parseAddressEnv("VAULT_TREASURY", process.env.INITIAL_TREASURY || initialOwner);
  const strategyOwner = parseAddressEnv("STRATEGY_OWNER", initialOwner);
  const performanceFeeBps = parseBpsEnv("VAULT_PERFORMANCE_FEE_BPS", "1000");
  const maxTotalAssets = parseEthAmount(process.env.VAULT_MAX_TOTAL_ASSETS_ETH || "0", "VAULT_MAX_TOTAL_ASSETS_ETH");

  const Vault = await hre.ethers.getContractFactory("SimpleWETHYieldVaultV2");
  const vaultArgs = [
    wethAddress,
    initialOwner,
    treasury,
    performanceFeeBps,
    maxTotalAssets,
  ];

  console.log("\nDeploying SimpleWETHYieldVaultV2");
  console.log("Network:", networkName);
  console.log("Deployer:", deployer.address);
  console.log("WETH:", wethAddress);
  console.log("Owner:", initialOwner);
  console.log("Treasury:", treasury);
  console.log("Performance fee:", `${performanceFeeBps} bps`);
  console.log("Max total assets:", `${hre.ethers.formatEther(maxTotalAssets)} WETH`);

  const vault = await Vault.deploy(...vaultArgs);
  await vault.waitForDeployment();
  const vaultReceipt = await vault.deploymentTransaction().wait();
  const vaultAddress = await vault.getAddress();

  const Strategy = await hre.ethers.getContractFactory("AaveV3WETHStrategy");
  const strategyArgs = [
    wethAddress,
    aaveATokenAddress,
    aavePoolAddress,
    vaultAddress,
    strategyOwner,
  ];

  console.log("\nDeploying AaveV3WETHStrategy");
  console.log("Aave Pool:", aavePoolAddress);
  console.log("Aave aWETH:", aaveATokenAddress);
  console.log("Strategy owner:", strategyOwner);

  const strategy = await Strategy.deploy(...strategyArgs);
  await strategy.waitForDeployment();
  const strategyReceipt = await strategy.deploymentTransaction().wait();
  const strategyAddress = await strategy.getAddress();

  let strategyConfigured = false;
  let setStrategyTx = "";
  let setStrategySafeData = "";

  if (initialOwner.toLowerCase() === deployer.address.toLowerCase()) {
    console.log("\nConfiguring vault strategy from deployer owner...");
    const tx = await vault.setStrategy(strategyAddress);
    await tx.wait();
    strategyConfigured = true;
    setStrategyTx = tx.hash;
    console.log("Strategy configured.");
    console.log("Tx:", tx.hash);
  } else {
    setStrategySafeData = vault.interface.encodeFunctionData("setStrategy", [strategyAddress]);
    console.log("\nVault owner is not the deployer. Submit this Safe transaction to configure the strategy:");
    console.log("To:", vaultAddress);
    console.log("Value wei: 0");
    console.log("Value ETH: 0.0");
    console.log("Data:", setStrategySafeData);
    console.log("Operation: Call");
  }

  console.log("\nSimpleWETHYieldVaultV2 deployed successfully!");
  console.log("Vault address:", vaultAddress);
  console.log("Vault deployment block:", vaultReceipt.blockNumber);
  console.log("Strategy address:", strategyAddress);
  console.log("Strategy deployment block:", strategyReceipt.blockNumber);

  const deploymentDir = path.join(process.cwd(), "deployments");
  fs.mkdirSync(deploymentDir, { recursive: true });

  const data = {
    contractName: "SimpleWETHYieldVaultV2",
    contractAddress: vaultAddress,
    strategyName: "AaveV3WETHStrategy",
    strategyAddress,
    network: networkName,
    chainId: (await hre.ethers.provider.getNetwork()).chainId.toString(),
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
    deploymentBlock: vaultReceipt.blockNumber,
    strategyDeploymentBlock: strategyReceipt.blockNumber,
    weth: wethAddress,
    aavePool: aavePoolAddress,
    aaveAToken: aaveATokenAddress,
    owner: await vault.owner(),
    treasury: await vault.treasury(),
    strategyOwner: await strategy.owner(),
    strategyConfigured,
    setStrategyTx,
    setStrategySafeData,
    performanceFeeBps: (await vault.performanceFeeBps()).toString(),
    maxTotalAssets: (await vault.maxTotalAssets()).toString(),
    maxTotalAssetsEth: hre.ethers.formatEther(await vault.maxTotalAssets()),
    constructorArgs: vaultArgs.map((arg) => arg.toString()),
    strategyConstructorArgs: strategyArgs.map((arg) => arg.toString()),
  };

  const deploymentPath = getStrategyVaultDeploymentPath(networkName);
  fs.writeFileSync(deploymentPath, JSON.stringify(data, null, 2));
  console.log(`Deployment info saved to ${deploymentPath}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Strategy vault deployment failed:", error);
    process.exitCode = 1;
  });
}

module.exports = {
  getStrategyVaultDeploymentPath,
  main,
};
