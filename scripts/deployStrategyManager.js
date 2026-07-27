const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

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

function getStrategyManagerDeploymentPath(networkName) {
  return path.join(process.cwd(), "deployments", `strategy-manager-${networkName}.json`);
}

function readStrategyVaultDeployment(networkName) {
  const deploymentPath = getStrategyVaultDeploymentPath(networkName);
  if (!fs.existsSync(deploymentPath)) {
    return {};
  }

  return JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
}

async function main() {
  const networkName = hre.network.name;
  const [deployer] = await hre.ethers.getSigners();
  if (!deployer) {
    throw new Error("No deployer signer available. Check PRIVATE_KEY and network config.");
  }

  const vaultDeployment = readStrategyVaultDeployment(networkName);
  const vaultAddress = parseAddressEnv("VAULT_ADDRESS", vaultDeployment.contractAddress);
  const vaultContractName = normalizeEnvValue(process.env.VAULT_CONTRACT_NAME || vaultDeployment.contractName || "SimpleWETHYieldVaultV2");
  const wethAddress = parseAddressEnv("WETH_ADDRESS", vaultDeployment.weth);
  const aavePoolAddress = parseAddressEnv("AAVE_POOL_ADDRESS", vaultDeployment.aavePool);
  const aaveATokenAddress = parseAddressEnv("AAVE_AWETH_ADDRESS", vaultDeployment.aaveAToken);
  const managerOwner = parseAddressEnv("MANAGER_OWNER", process.env.VAULT_OWNER || vaultDeployment.owner || deployer.address);
  const strategyOwner = parseAddressEnv("STRATEGY_OWNER", managerOwner);
  const initialStrategyMaxAssets = parseEthAmount(
    process.env.STRATEGY_MAX_ASSETS_ETH || "0",
    "STRATEGY_MAX_ASSETS_ETH"
  );

  console.log("\nDeploying SimpleStrategyManager");
  console.log("Network:", networkName);
  console.log("Deployer:", deployer.address);
  console.log("Vault:", vaultAddress);
  console.log("WETH:", wethAddress);
  console.log("Manager owner:", managerOwner);
  console.log("Initial strategy cap:", `${hre.ethers.formatEther(initialStrategyMaxAssets)} WETH`);

  const Manager = await hre.ethers.getContractFactory("SimpleStrategyManager");
  const managerArgs = [wethAddress, vaultAddress, managerOwner];
  const manager = await Manager.deploy(...managerArgs);
  await manager.waitForDeployment();
  const managerReceipt = await manager.deploymentTransaction().wait();
  const managerAddress = await manager.getAddress();

  console.log("\nDeploying manager-owned AaveV3WETHStrategy");
  console.log("Aave Pool:", aavePoolAddress);
  console.log("Aave aWETH:", aaveATokenAddress);
  console.log("Strategy owner:", strategyOwner);

  const Strategy = await hre.ethers.getContractFactory("AaveV3WETHStrategy");
  const strategyArgs = [
    wethAddress,
    aaveATokenAddress,
    aavePoolAddress,
    managerAddress,
    strategyOwner,
  ];
  const strategy = await Strategy.deploy(...strategyArgs);
  await strategy.waitForDeployment();
  const strategyReceipt = await strategy.deploymentTransaction().wait();
  const strategyAddress = await strategy.getAddress();

  const vault = await hre.ethers.getContractAt(vaultContractName, vaultAddress);
  const vaultOwner = await vault.owner();

  let addStrategyTx = "";
  let setVaultStrategyTx = "";
  let addStrategySafeData = "";
  let setVaultStrategySafeData = "";
  let managerConfigured = false;
  let vaultConfigured = false;

  if (managerOwner.toLowerCase() === deployer.address.toLowerCase()) {
    console.log("\nConfiguring manager strategy from deployer owner...");
    const tx = await manager.addStrategy(strategyAddress, initialStrategyMaxAssets, true);
    await tx.wait();
    addStrategyTx = tx.hash;
    managerConfigured = true;
    console.log("Manager strategy configured.");
    console.log("Tx:", tx.hash);
  } else {
    addStrategySafeData = manager.interface.encodeFunctionData("addStrategy", [
      strategyAddress,
      initialStrategyMaxAssets,
      true,
    ]);
    console.log("\nManager owner is not the deployer. Submit this Safe transaction to add the Aave strategy:");
    console.log("To:", managerAddress);
    console.log("Value wei: 0");
    console.log("Value ETH: 0.0");
    console.log("Data:", addStrategySafeData);
    console.log("Operation: Call");
  }

  if (vaultOwner.toLowerCase() === deployer.address.toLowerCase()) {
    console.log("\nSetting vault strategy to manager from deployer owner...");
    const tx = await vault.setStrategy(managerAddress);
    await tx.wait();
    setVaultStrategyTx = tx.hash;
    vaultConfigured = true;
    console.log("Vault strategy set to manager.");
    console.log("Tx:", tx.hash);
  } else {
    setVaultStrategySafeData = vault.interface.encodeFunctionData("setStrategy", [managerAddress]);
    console.log("\nVault owner is not the deployer. Submit this Safe transaction to set the vault strategy to manager:");
    console.log("To:", vaultAddress);
    console.log("Value wei: 0");
    console.log("Value ETH: 0.0");
    console.log("Data:", setVaultStrategySafeData);
    console.log("Operation: Call");
  }

  console.log("\nSimpleStrategyManager deployed successfully!");
  console.log("Manager address:", managerAddress);
  console.log("Manager deployment block:", managerReceipt.blockNumber);
  console.log("Aave strategy address:", strategyAddress);
  console.log("Aave strategy deployment block:", strategyReceipt.blockNumber);

  const deploymentDir = path.join(process.cwd(), "deployments");
  fs.mkdirSync(deploymentDir, { recursive: true });

  const data = {
    contractName: "SimpleStrategyManager",
    contractAddress: managerAddress,
    strategyName: "AaveV3WETHStrategy",
    strategyAddress,
    vaultContractName,
    vaultAddress,
    network: networkName,
    chainId: (await hre.ethers.provider.getNetwork()).chainId.toString(),
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
    deploymentBlock: managerReceipt.blockNumber,
    strategyDeploymentBlock: strategyReceipt.blockNumber,
    weth: wethAddress,
    aavePool: aavePoolAddress,
    aaveAToken: aaveATokenAddress,
    owner: await manager.owner(),
    vaultOwner,
    strategyOwner: await strategy.owner(),
    initialStrategyMaxAssets: initialStrategyMaxAssets.toString(),
    initialStrategyMaxAssetsEth: hre.ethers.formatEther(initialStrategyMaxAssets),
    managerConfigured,
    vaultConfigured,
    addStrategyTx,
    setVaultStrategyTx,
    addStrategySafeData,
    setVaultStrategySafeData,
    constructorArgs: managerArgs.map((arg) => arg.toString()),
    strategyConstructorArgs: strategyArgs.map((arg) => arg.toString()),
  };

  const deploymentPath = getStrategyManagerDeploymentPath(networkName);
  fs.writeFileSync(deploymentPath, JSON.stringify(data, null, 2));
  console.log(`Deployment info saved to ${deploymentPath}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Strategy manager deployment failed:", error);
    process.exitCode = 1;
  });
}

module.exports = {
  getStrategyManagerDeploymentPath,
  main,
};
