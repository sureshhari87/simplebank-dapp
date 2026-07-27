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

function getVaultDeploymentPath(networkName) {
  return path.join(process.cwd(), "deployments", `weth-vault-${networkName}.json`);
}

async function main() {
  const networkName = hre.network.name;
  const [deployer] = await hre.ethers.getSigners();
  if (!deployer) {
    throw new Error("No deployer signer available. Check PRIVATE_KEY and network config.");
  }

  const wethAddress = parseAddressEnv("WETH_ADDRESS");
  const initialOwner = parseAddressEnv("VAULT_OWNER", process.env.INITIAL_OWNER || deployer.address);
  const treasury = parseAddressEnv("VAULT_TREASURY", process.env.INITIAL_TREASURY || initialOwner);
  const performanceFeeBps = parseBpsEnv("VAULT_PERFORMANCE_FEE_BPS", "1000");
  const maxTotalAssets = parseEthAmount(process.env.VAULT_MAX_TOTAL_ASSETS_ETH || "0", "VAULT_MAX_TOTAL_ASSETS_ETH");

  const Vault = await hre.ethers.getContractFactory("SimpleWETHYieldVault");
  const deploymentArgs = [
    wethAddress,
    initialOwner,
    treasury,
    performanceFeeBps,
    maxTotalAssets,
  ];

  console.log("\nDeploying SimpleWETHYieldVault");
  console.log("Network:", networkName);
  console.log("Deployer:", deployer.address);
  console.log("WETH:", wethAddress);
  console.log("Owner:", initialOwner);
  console.log("Treasury:", treasury);
  console.log("Performance fee:", `${performanceFeeBps} bps`);
  console.log("Max total assets:", `${hre.ethers.formatEther(maxTotalAssets)} WETH`);

  const vault = await Vault.deploy(...deploymentArgs);
  await vault.waitForDeployment();
  const deploymentReceipt = await vault.deploymentTransaction().wait();

  const vaultAddress = await vault.getAddress();
  console.log("\nSimpleWETHYieldVault deployed successfully!");
  console.log("Vault address:", vaultAddress);
  console.log("Deployment block:", deploymentReceipt.blockNumber);

  const deploymentDir = path.join(process.cwd(), "deployments");
  fs.mkdirSync(deploymentDir, { recursive: true });

  const data = {
    contractName: "SimpleWETHYieldVault",
    contractAddress: vaultAddress,
    network: networkName,
    chainId: (await hre.ethers.provider.getNetwork()).chainId.toString(),
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
    deploymentBlock: deploymentReceipt.blockNumber,
    weth: wethAddress,
    owner: await vault.owner(),
    treasury: await vault.treasury(),
    performanceFeeBps: (await vault.performanceFeeBps()).toString(),
    maxTotalAssets: (await vault.maxTotalAssets()).toString(),
    maxTotalAssetsEth: hre.ethers.formatEther(await vault.maxTotalAssets()),
    constructorArgs: deploymentArgs.map((arg) => arg.toString()),
  };

  const deploymentPath = getVaultDeploymentPath(networkName);
  fs.writeFileSync(deploymentPath, JSON.stringify(data, null, 2));
  console.log(`Deployment info saved to ${deploymentPath}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Vault deployment failed:", error);
    process.exitCode = 1;
  });
}

module.exports = {
  getVaultDeploymentPath,
  main,
};
