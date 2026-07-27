const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const MAX_SWAP_FEE_BPS = 100;
const MAX_PROTOCOL_FEE_SHARE_BPS = 5000;

const ERC20_METADATA_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
];

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

function isTruthyEnv(name) {
  const value = normalizeEnvValue(process.env[name]).toLowerCase();
  return value === "1" || value === "true" || value === "yes";
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

function parseOptionalAddressEnv(name, fallback = "") {
  const address = normalizeEnvValue(process.env[name] || fallback);
  if (!address) return "";
  if (!hre.ethers.isAddress(address) || address === hre.ethers.ZeroAddress) {
    throw new Error(`${name} must be a non-zero address, got: ${address}`);
  }

  return address;
}

function getSwapDeploymentPath(networkName) {
  return path.join(process.cwd(), "deployments", `swap-pool-${networkName}.json`);
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readWethFallback(networkName) {
  const strategyVault = readJsonIfExists(path.join(process.cwd(), "deployments", `strategy-vault-${networkName}.json`));
  if (hre.ethers.isAddress(strategyVault.weth || "")) return strategyVault.weth;

  const wethVault = readJsonIfExists(path.join(process.cwd(), "deployments", `weth-vault-${networkName}.json`));
  if (hre.ethers.isAddress(wethVault.weth || "")) return wethVault.weth;

  return "";
}

async function readTokenMetadata(address) {
  const token = new hre.ethers.Contract(address, ERC20_METADATA_ABI, hre.ethers.provider);
  const [name, symbol, decimals] = await Promise.all([
    token.name(),
    token.symbol(),
    token.decimals(),
  ]);

  return { name, symbol, decimals: Number(decimals) };
}

async function maybeDeployTestToken(deployer) {
  if (!isTruthyEnv("DEPLOY_SWAP_TEST_TOKEN")) return "";
  if (hre.network.name === "mainnet") {
    throw new Error("DEPLOY_SWAP_TEST_TOKEN is disabled on mainnet");
  }

  const name = normalizeEnvValue(process.env.SWAP_TEST_TOKEN_NAME || "SimpleBank Swap Test Token");
  const symbol = normalizeEnvValue(process.env.SWAP_TEST_TOKEN_SYMBOL || "SBS");
  const decimals = Number(normalizeEnvValue(process.env.SWAP_TEST_TOKEN_DECIMALS || "18"));
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
    throw new Error("SWAP_TEST_TOKEN_DECIMALS must be an integer from 0 to 18");
  }

  console.log("\nDeploying MockERC20 for swap testing");
  console.log("Name:", name);
  console.log("Symbol:", symbol);
  console.log("Decimals:", decimals);

  const MockERC20 = await hre.ethers.getContractFactory("MockERC20");
  const token = await MockERC20.deploy(name, symbol, decimals);
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();

  const mintAmountRaw = normalizeEnvValue(process.env.SWAP_TEST_TOKEN_MINT || "1000000");
  const mintAmount = hre.ethers.parseUnits(mintAmountRaw, decimals);
  const mintTx = await token.mint(deployer.address, mintAmount);
  await mintTx.wait();

  console.log("Test token:", tokenAddress);
  console.log("Minted to deployer:", `${mintAmountRaw} ${symbol}`);
  return tokenAddress;
}

async function main() {
  const networkName = hre.network.name;
  const [deployer] = await hre.ethers.getSigners();
  if (!deployer) {
    throw new Error("No deployer signer available. Check PRIVATE_KEY and network config.");
  }

  const token0 = parseAddressEnv("SWAP_TOKEN0_ADDRESS", process.env.WETH_ADDRESS || readWethFallback(networkName));
  let token1 = parseOptionalAddressEnv("SWAP_TOKEN1_ADDRESS");
  if (!token1) {
    token1 = await maybeDeployTestToken(deployer);
  }
  if (!token1) {
    throw new Error("SWAP_TOKEN1_ADDRESS is required, or set DEPLOY_SWAP_TEST_TOKEN=true on testnets.");
  }

  const owner = parseAddressEnv("SWAP_OWNER", process.env.INITIAL_OWNER || deployer.address);
  const treasury = parseAddressEnv("SWAP_TREASURY", process.env.INITIAL_TREASURY || owner);
  const initialSwapFeeBps = parseBpsEnv("SWAP_FEE_BPS", "30", MAX_SWAP_FEE_BPS);
  const initialProtocolFeeShareBps = parseBpsEnv("SWAP_PROTOCOL_FEE_SHARE_BPS", "2000", MAX_PROTOCOL_FEE_SHARE_BPS);

  const [token0Metadata, token1Metadata] = await Promise.all([
    readTokenMetadata(token0),
    readTokenMetadata(token1),
  ]);

  console.log("\nDeploying SimpleSwapPool");
  console.log("Network:", networkName);
  console.log("Deployer:", deployer.address);
  console.log("Token0:", `${token0Metadata.symbol} (${token0})`);
  console.log("Token1:", `${token1Metadata.symbol} (${token1})`);
  console.log("Owner:", owner);
  console.log("Treasury:", treasury);
  console.log("Swap fee:", `${initialSwapFeeBps} bps`);
  console.log("Protocol fee share:", `${initialProtocolFeeShareBps} bps`);

  const SimpleSwapPool = await hre.ethers.getContractFactory("SimpleSwapPool");
  const constructorArgs = [
    token0,
    token1,
    owner,
    treasury,
    initialSwapFeeBps,
    initialProtocolFeeShareBps,
  ];
  const pool = await SimpleSwapPool.deploy(...constructorArgs);
  await pool.waitForDeployment();
  const receipt = await pool.deploymentTransaction().wait();
  const poolAddress = await pool.getAddress();

  console.log("\nSimpleSwapPool deployed successfully!");
  console.log("Pool address:", poolAddress);
  console.log("Deployment block:", receipt.blockNumber);

  const deploymentDir = path.join(process.cwd(), "deployments");
  fs.mkdirSync(deploymentDir, { recursive: true });

  const data = {
    contractName: "SimpleSwapPool",
    contractAddress: poolAddress,
    network: networkName,
    chainId: (await hre.ethers.provider.getNetwork()).chainId.toString(),
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
    deploymentBlock: receipt.blockNumber,
    owner: await pool.owner(),
    treasury: await pool.treasury(),
    token0,
    token1,
    token0Name: token0Metadata.name,
    token0Symbol: token0Metadata.symbol,
    token0Decimals: token0Metadata.decimals,
    token1Name: token1Metadata.name,
    token1Symbol: token1Metadata.symbol,
    token1Decimals: token1Metadata.decimals,
    swapFeeBps: (await pool.swapFeeBps()).toString(),
    protocolFeeShareBps: (await pool.protocolFeeShareBps()).toString(),
    constructorArgs: constructorArgs.map((arg) => arg.toString()),
  };

  const deploymentPath = getSwapDeploymentPath(networkName);
  fs.writeFileSync(deploymentPath, JSON.stringify(data, null, 2));
  console.log(`Deployment info saved to ${deploymentPath}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Swap pool deployment failed:", error);
    process.exitCode = 1;
  });
}

module.exports = {
  getSwapDeploymentPath,
  main,
};
