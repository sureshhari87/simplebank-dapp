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

function parseAddressEnv(name, fallback = "") {
  const address = normalizeEnvValue(process.env[name] || fallback);
  if (!hre.ethers.isAddress(address) || address === hre.ethers.ZeroAddress) {
    throw new Error(`${name} must be a non-zero address, got: ${address || "(empty)"}`);
  }

  return address;
}

function getTreasuryDeploymentPath(networkName) {
  return path.join(process.cwd(), "deployments", `treasury-${networkName}.json`);
}

async function main() {
  const networkName = hre.network.name;
  const [deployer] = await hre.ethers.getSigners();
  if (!deployer) {
    throw new Error("No deployer signer available. Check PRIVATE_KEY and network config.");
  }

  const owner = parseAddressEnv("TREASURY_OWNER", process.env.INITIAL_OWNER || deployer.address);

  console.log("\nDeploying SimpleTreasury");
  console.log("Network:", networkName);
  console.log("Deployer:", deployer.address);
  console.log("Owner:", owner);

  const SimpleTreasury = await hre.ethers.getContractFactory("SimpleTreasury");
  const constructorArgs = [owner];
  const treasury = await SimpleTreasury.deploy(...constructorArgs);
  await treasury.waitForDeployment();
  const receipt = await treasury.deploymentTransaction().wait();
  const treasuryAddress = await treasury.getAddress();

  console.log("\nSimpleTreasury deployed successfully!");
  console.log("Treasury address:", treasuryAddress);
  console.log("Deployment block:", receipt.blockNumber);

  const deploymentDir = path.join(process.cwd(), "deployments");
  fs.mkdirSync(deploymentDir, { recursive: true });

  const data = {
    contractName: "SimpleTreasury",
    contractAddress: treasuryAddress,
    network: networkName,
    chainId: (await hre.ethers.provider.getNetwork()).chainId.toString(),
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
    deploymentBlock: receipt.blockNumber,
    owner: await treasury.owner(),
    constructorArgs: constructorArgs.map((arg) => arg.toString()),
  };

  const deploymentPath = getTreasuryDeploymentPath(networkName);
  fs.writeFileSync(deploymentPath, JSON.stringify(data, null, 2));
  console.log(`Deployment info saved to ${deploymentPath}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Treasury deployment failed:", error);
    process.exitCode = 1;
  });
}

module.exports = {
  getTreasuryDeploymentPath,
  main,
};
