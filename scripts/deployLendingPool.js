const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const MAX_BORROW_APR_BPS = 5000;
const MAX_ORIGINATION_FEE_BPS = 100;

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

function parseBpsEnv(name, fallback, maxAllowed) {
  const rawBps = normalizeEnvValue(process.env[name] || fallback);
  if (!/^\d+$/.test(rawBps)) {
    throw new Error(`${name} must be an integer basis-point value, got: ${process.env[name] || fallback}`);
  }

  const bps = Number(rawBps);
  if (bps > maxAllowed) {
    throw new Error(`${name} ${bps} exceeds max ${maxAllowed}`);
  }

  return bps;
}

function parseAddressEnv(name, fallback = "") {
  const address = normalizeEnvValue(process.env[name] || fallback);
  if (!hre.ethers.isAddress(address) || address === hre.ethers.ZeroAddress) {
    throw new Error(`${name} must be a non-zero address, got: ${address || "(empty)"}`);
  }

  return address;
}

function getLendingDeploymentPath(networkName) {
  return path.join(process.cwd(), "deployments", `lending-pool-${networkName}.json`);
}

async function main() {
  const networkName = hre.network.name;
  const [deployer] = await hre.ethers.getSigners();
  if (!deployer) {
    throw new Error("No deployer signer available. Check PRIVATE_KEY and network config.");
  }

  const initialOwner = parseAddressEnv("LENDING_OWNER", process.env.INITIAL_OWNER || deployer.address);
  const treasury = parseAddressEnv("LENDING_TREASURY", process.env.INITIAL_TREASURY || initialOwner);
  const borrowAprBps = parseBpsEnv("LENDING_BORROW_APR_BPS", "800", MAX_BORROW_APR_BPS);
  const originationFeeBps = parseBpsEnv("LENDING_ORIGINATION_FEE_BPS", "10", MAX_ORIGINATION_FEE_BPS);
  const maxPoolLiquidity = parseEthAmount(
    process.env.LENDING_MAX_POOL_LIQUIDITY_ETH || "0",
    "LENDING_MAX_POOL_LIQUIDITY_ETH"
  );

  console.log("\nDeploying SimpleLendingPool");
  console.log("Network:", networkName);
  console.log("Deployer:", deployer.address);
  console.log("Owner:", initialOwner);
  console.log("Treasury:", treasury);
  console.log("Borrow APR:", `${borrowAprBps} bps`);
  console.log("Origination fee:", `${originationFeeBps} bps`);
  console.log("Max pool liquidity:", `${hre.ethers.formatEther(maxPoolLiquidity)} ETH`);

  const LendingPool = await hre.ethers.getContractFactory("SimpleLendingPool");
  const constructorArgs = [
    initialOwner,
    treasury,
    borrowAprBps,
    originationFeeBps,
    maxPoolLiquidity,
  ];
  const pool = await LendingPool.deploy(...constructorArgs);
  await pool.waitForDeployment();
  const receipt = await pool.deploymentTransaction().wait();
  const poolAddress = await pool.getAddress();

  console.log("\nSimpleLendingPool deployed successfully!");
  console.log("Pool address:", poolAddress);
  console.log("Deployment block:", receipt.blockNumber);

  const deploymentDir = path.join(process.cwd(), "deployments");
  fs.mkdirSync(deploymentDir, { recursive: true });

  const data = {
    contractName: "SimpleLendingPool",
    contractAddress: poolAddress,
    network: networkName,
    chainId: (await hre.ethers.provider.getNetwork()).chainId.toString(),
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
    deploymentBlock: receipt.blockNumber,
    owner: await pool.owner(),
    treasury: await pool.treasury(),
    borrowAprBps: (await pool.borrowAprBps()).toString(),
    originationFeeBps: (await pool.originationFeeBps()).toString(),
    maxLtvBps: (await pool.maxLtvBps()).toString(),
    liquidationThresholdBps: (await pool.liquidationThresholdBps()).toString(),
    liquidationBonusBps: (await pool.liquidationBonusBps()).toString(),
    maxPoolLiquidity: (await pool.maxPoolLiquidity()).toString(),
    maxPoolLiquidityEth: hre.ethers.formatEther(await pool.maxPoolLiquidity()),
    constructorArgs: constructorArgs.map((arg) => arg.toString()),
  };

  const deploymentPath = getLendingDeploymentPath(networkName);
  fs.writeFileSync(deploymentPath, JSON.stringify(data, null, 2));
  console.log(`Deployment info saved to ${deploymentPath}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Lending pool deployment failed:", error);
    process.exitCode = 1;
  });
}

module.exports = {
  getLendingDeploymentPath,
  main,
};
