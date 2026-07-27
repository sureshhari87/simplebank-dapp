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

function getVaultDeploymentPath(networkName) {
  const customPath = normalizeEnvValue(process.env.VAULT_DEPLOYMENT_FILE);
  if (customPath) {
    return path.isAbsolute(customPath) ? customPath : path.join(process.cwd(), customPath);
  }

  const deploymentName = normalizeEnvValue(process.env.VAULT_DEPLOYMENT_NAME || "strategy-vault");
  return path.join(process.cwd(), "deployments", `${deploymentName}-${networkName}.json`);
}

function readVaultDeployment(networkName) {
  const deploymentPath = getVaultDeploymentPath(networkName);
  if (!fs.existsSync(deploymentPath)) {
    throw new Error(`${deploymentPath} does not exist. Deploy the vault or set VAULT_ADDRESS.`);
  }

  return JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
}

function parseAddressEnv(name, fallback = "") {
  const address = normalizeEnvValue(process.env[name] || fallback);
  if (!hre.ethers.isAddress(address) || address === hre.ethers.ZeroAddress) {
    throw new Error(`${name} must be a non-zero address, got: ${address || "(empty)"}`);
  }

  return address;
}

function parseShareAmountEnv(name, decimals) {
  const rawAmount = normalizeEnvValue(process.env[name]);
  if (!rawAmount || rawAmount.toLowerCase() === "all") return null;
  if (!/^\d+(\.\d+)?$/.test(rawAmount)) {
    throw new Error(`${name} must be a non-negative share amount or "all", got: ${process.env[name]}`);
  }

  return hre.ethers.parseUnits(rawAmount, decimals);
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
    throw new Error(`Invalid contractAddress in ${getVaultDeploymentPath(networkName)}`);
  }

  return deployment.contractAddress;
}

async function main() {
  const networkName = hre.network.name;
  const deployment = readVaultDeployment(networkName);
  const vaultAddress = resolveVaultAddress(networkName, deployment);
  const vaultContractName = normalizeEnvValue(
    process.env.VAULT_CONTRACT_NAME || deployment.contractName || "SimpleWETHYieldVaultV2"
  );
  const vault = await hre.ethers.getContractAt(vaultContractName, vaultAddress);

  const [treasury, decimals] = await Promise.all([
    vault.treasury(),
    vault.decimals(),
  ]);
  const shareOwner = parseAddressEnv("SHARE_OWNER", treasury);
  const receiver = parseAddressEnv("RECEIVER", treasury);
  const shareBalance = await vault.balanceOf(shareOwner);
  const requestedShares = parseShareAmountEnv("REDEEM_SHARES", Number(decimals));
  const shares = requestedShares === null ? shareBalance : requestedShares;

  console.log("\nVault treasury fee redemption encoder");
  console.log("Network:", networkName);
  console.log("Vault:", vaultAddress);
  console.log("Treasury:", treasury);
  console.log("Share owner:", shareOwner);
  console.log("Receiver:", receiver);
  console.log("Treasury shares:", `${hre.ethers.formatUnits(shareBalance, decimals)} sbWETH`);

  if (shares === 0n) {
    console.log("\nNo action: share owner has no treasury fee shares to redeem.");
    return;
  }

  if (shares > shareBalance) {
    throw new Error(
      `REDEEM_SHARES ${hre.ethers.formatUnits(shares, decimals)} exceeds share owner balance ${hre.ethers.formatUnits(
        shareBalance,
        decimals
      )}`
    );
  }

  const estimatedAssets = await vault.convertToAssets(shares);
  const data = vault.interface.encodeFunctionData("redeemETH", [shares, receiver, shareOwner]);

  console.log("Redeem shares:", `${hre.ethers.formatUnits(shares, decimals)} sbWETH`);
  console.log("Estimated assets:", `${hre.ethers.formatEther(estimatedAssets)} ETH`);
  console.log("\nSafe transaction fields");
  console.log("To:", vaultAddress);
  console.log("Value wei: 0");
  console.log("Value ETH: 0.0");
  console.log("Data:", data);
  console.log("Operation: Call");
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Vault treasury redemption encoding failed:", error);
    process.exitCode = 1;
  });
}

module.exports = {
  main,
};
