const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const MAX_INTEREST_RATE = 500;
const BASIS_POINTS = 10000n;
const DAYS_PER_YEAR = 365n;
const DEFAULT_INTEREST_RESERVE_PERIOD_DAYS = 30n;
const MAX_INTEREST_RESERVE_PERIOD_DAYS = 3650n;
const LIVE_NETWORKS = new Set(["sepolia", "mainnet"]);
const EXPECTED_CHAIN_IDS = {
  hardhat: 31337n,
  localhost: 31337n,
  sepolia: 11155111n,
  mainnet: 1n,
};
const SAFE_OWNER_ABI = [
  "function getOwners() view returns (address[])",
  "function getThreshold() view returns (uint256)",
];

function isPlaceholder(value) {
  return !value || /YOUR_|PLACEHOLDER|0xYOUR/i.test(value);
}

function parseEthAmount(rawAmount, name) {
  const normalized = (rawAmount || "").trim();

  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw new Error(`${name} must be a non-negative ETH amount, got: ${rawAmount}`);
  }

  return hre.ethers.parseEther(normalized);
}

function parseOptionalEthEnv(name) {
  const rawAmount = process.env[name];
  if (rawAmount === undefined || rawAmount.trim() === "") {
    return null;
  }

  return parseEthAmount(rawAmount, name);
}

function parseInitialInterestRate() {
  const rawRate = process.env.INITIAL_INTEREST_RATE || "100";
  if (!/^\d+$/.test(rawRate)) {
    throw new Error(`INITIAL_INTEREST_RATE must be an integer basis-point value, got: ${rawRate}`);
  }

  const rate = Number(rawRate);
  if (rate > MAX_INTEREST_RATE) {
    throw new Error(`INITIAL_INTEREST_RATE ${rate} exceeds max ${MAX_INTEREST_RATE}`);
  }

  return rate;
}

function parseInitialMaxTotalDeposits(networkName) {
  const rawCap = process.env.INITIAL_MAX_TOTAL_DEPOSITS_ETH || "0";
  const cap = parseEthAmount(rawCap, "INITIAL_MAX_TOTAL_DEPOSITS_ETH");
  if (networkName === "mainnet" && cap === 0n) {
    throw new Error("INITIAL_MAX_TOTAL_DEPOSITS_ETH must be greater than 0 for mainnet deployment");
  }

  return cap;
}

function parseInterestReservePeriodDays() {
  const rawDays = process.env.INTEREST_RESERVE_PERIOD_DAYS || DEFAULT_INTEREST_RESERVE_PERIOD_DAYS.toString();

  if (!/^\d+$/.test(rawDays)) {
    throw new Error(`INTEREST_RESERVE_PERIOD_DAYS must be a positive integer, got: ${rawDays}`);
  }

  const periodDays = BigInt(rawDays);
  if (periodDays === 0n || periodDays > MAX_INTEREST_RESERVE_PERIOD_DAYS) {
    throw new Error(
      `INTEREST_RESERVE_PERIOD_DAYS must be between 1 and ${MAX_INTEREST_RESERVE_PERIOD_DAYS.toString()}`
    );
  }

  return periodDays;
}

function calculateRequiredInterestReserve(expectedTvl, interestRateBps, periodDays) {
  const numerator = expectedTvl * BigInt(interestRateBps) * BigInt(periodDays);
  const denominator = DAYS_PER_YEAR * BASIS_POINTS;

  if (numerator === 0n) return 0n;
  return (numerator + denominator - 1n) / denominator;
}

function getInterestReservePolicy(defaultExpectedTvl, interestRateBps, defaultExpectedTvlSource = "default TVL cap") {
  const configuredExpectedTvl = parseOptionalEthEnv("EXPECTED_TVL_ETH");
  const expectedTvl = configuredExpectedTvl === null ? defaultExpectedTvl : configuredExpectedTvl;
  const expectedTvlSource = configuredExpectedTvl === null ? defaultExpectedTvlSource : "EXPECTED_TVL_ETH";
  const periodDays = parseInterestReservePeriodDays();
  const requiredReserve = calculateRequiredInterestReserve(expectedTvl, interestRateBps, periodDays);

  return {
    expectedTvl,
    expectedTvlSource,
    periodDays,
    requiredReserve,
  };
}

function getDeploymentPath(networkName) {
  return path.join(process.cwd(), "deployments", `${networkName}.json`);
}

async function estimateDeploymentCost(
  SimpleBankV2,
  deployer,
  initialInterestRate,
  initialOwner,
  initialMaxTotalDeposits
) {
  const deploymentTx = await SimpleBankV2.getDeployTransaction(
    initialInterestRate,
    initialOwner,
    initialMaxTotalDeposits
  );
  const estimate = await hre.ethers.provider.estimateGas({
    ...deploymentTx,
    from: deployer.address,
  });
  const feeData = await hre.ethers.provider.getFeeData();
  const gasPrice = feeData.maxFeePerGas || feeData.gasPrice;

  if (!gasPrice) {
    throw new Error("Could not read network gas price for deployment preflight");
  }

  const estimatedCost = estimate * gasPrice;
  const bufferedCost = (estimatedCost * 120n) / 100n;

  return {
    gasLimit: estimate,
    gasPrice,
    estimatedCost,
    bufferedCost,
  };
}

async function runPreflight({ preflightOnly = false } = {}) {
  const networkName = hre.network.name;
  const expectedChainId = EXPECTED_CHAIN_IDS[networkName];
  const providerNetwork = await hre.ethers.provider.getNetwork();
  const actualChainId = providerNetwork.chainId;

  if (expectedChainId && actualChainId !== expectedChainId) {
    throw new Error(
      `Connected to chain ${actualChainId}, expected ${expectedChainId} for ${networkName}`
    );
  }

  if (!expectedChainId && networkName !== "hardhat") {
    throw new Error(`Unsupported deployment network: ${networkName}`);
  }

  if (networkName === "mainnet" && isPlaceholder(process.env.MAINNET_RPC_URL)) {
    throw new Error("MAINNET_RPC_URL must be set to a real mainnet RPC endpoint");
  }

  if (LIVE_NETWORKS.has(networkName)) {
    if (isPlaceholder(process.env.PRIVATE_KEY) || !/^0x[0-9a-fA-F]{64}$/.test(process.env.PRIVATE_KEY || "")) {
      throw new Error("PRIVATE_KEY must be set to a 32-byte hex private key for live-network deployment");
    }
  }

  if (networkName === "mainnet") {
    if (isPlaceholder(process.env.INITIAL_OWNER)) {
      throw new Error("INITIAL_OWNER must be set to the mainnet multisig/Safe address");
    }

    if (isPlaceholder(process.env.ETHERSCAN_API_KEY)) {
      throw new Error("ETHERSCAN_API_KEY must be set before mainnet deployment");
    }

    if (fs.existsSync(getDeploymentPath(networkName)) && process.env.ALLOW_REDEPLOY !== "true") {
      throw new Error("deployments/mainnet.json already exists. Set ALLOW_REDEPLOY=true to override intentionally");
    }
  }

  const [deployer] = await hre.ethers.getSigners();
  if (!deployer) {
    throw new Error("No deployer signer available. Check PRIVATE_KEY and network accounts config");
  }

  const initialInterestRate = parseInitialInterestRate();
  const initialMaxTotalDeposits = parseInitialMaxTotalDeposits(networkName);
  const interestReservePolicy = getInterestReservePolicy(initialMaxTotalDeposits, initialInterestRate);
  const initialOwner = process.env.INITIAL_OWNER || deployer.address;

  if (!hre.ethers.isAddress(initialOwner) || initialOwner === hre.ethers.ZeroAddress) {
    throw new Error(`Invalid INITIAL_OWNER: ${initialOwner}`);
  }

  if (networkName === "mainnet" && initialInterestRate > 0 && interestReservePolicy.requiredReserve === 0n) {
    throw new Error("Interest reserve policy must require a non-zero reserve on mainnet when APY is non-zero");
  }

  if (networkName === "mainnet" && initialOwner.toLowerCase() === deployer.address.toLowerCase()) {
    throw new Error("INITIAL_OWNER must not be the deployer EOA on mainnet");
  }

  if (networkName === "mainnet") {
    const ownerCode = await hre.ethers.provider.getCode(initialOwner);
    if (ownerCode === "0x") {
      throw new Error("INITIAL_OWNER must be a deployed contract wallet/multisig on mainnet");
    }

    const safe = new hre.ethers.Contract(initialOwner, SAFE_OWNER_ABI, hre.ethers.provider);
    let owners;
    let threshold;

    try {
      owners = await safe.getOwners();
      threshold = await safe.getThreshold();
    } catch (error) {
      throw new Error("INITIAL_OWNER must expose Safe-compatible getOwners() and getThreshold()");
    }

    if (owners.length < 2 || threshold < 2n || threshold > BigInt(owners.length)) {
      throw new Error(
        `INITIAL_OWNER must be a multisig Safe with threshold >= 2; got ${threshold.toString()} of ${owners.length}`
      );
    }
  }

  const SimpleBankV2 = await hre.ethers.getContractFactory("SimpleBankV2");
  const deployerBalance = await hre.ethers.provider.getBalance(deployer.address);
  const deploymentCost = await estimateDeploymentCost(
    SimpleBankV2,
    deployer,
    initialInterestRate,
    initialOwner,
    initialMaxTotalDeposits
  );

  if (deployerBalance < deploymentCost.bufferedCost) {
    throw new Error(
      `Deployer balance ${hre.ethers.formatEther(deployerBalance)} ETH is below buffered deploy cost ` +
        `${hre.ethers.formatEther(deploymentCost.bufferedCost)} ETH`
    );
  }

  console.log("\nDeployment preflight passed");
  console.log("Network:", networkName);
  console.log("Chain ID:", actualChainId.toString());
  console.log("Deployer:", deployer.address);
  console.log("Initial owner:", initialOwner);
  if (networkName === "mainnet") {
    const safe = new hre.ethers.Contract(initialOwner, SAFE_OWNER_ABI, hre.ethers.provider);
    console.log(
      "Initial owner Safe threshold:",
      `${(await safe.getThreshold()).toString()} of ${(await safe.getOwners()).length}`
    );
  }
  console.log("Initial interest rate:", `${initialInterestRate / 100}%`);
  console.log("Initial global TVL cap:", `${hre.ethers.formatEther(initialMaxTotalDeposits)} ETH`);
  console.log(
    "Interest reserve policy:",
    `${hre.ethers.formatEther(interestReservePolicy.requiredReserve)} ETH required for ` +
      `${interestReservePolicy.periodDays.toString()} days on ` +
      `${hre.ethers.formatEther(interestReservePolicy.expectedTvl)} ETH expected TVL ` +
      `(${interestReservePolicy.expectedTvlSource})`
  );
  console.log("Estimated gas:", deploymentCost.gasLimit.toString());
  console.log("Buffered deploy cost:", `${hre.ethers.formatEther(deploymentCost.bufferedCost)} ETH`);

  if (preflightOnly) {
    console.log("Preflight-only mode: no deployment transaction sent.");
  }

  return {
    networkName,
    chainId: actualChainId.toString(),
    deployer,
    deployerBalance,
    initialInterestRate,
    initialOwner,
    initialMaxTotalDeposits,
    interestReservePolicy,
    SimpleBankV2,
    deploymentCost,
  };
}

async function main() {
  const preflightOnly = process.env.PREFLIGHT_ONLY === "true";
  const preflight = await runPreflight({ preflightOnly });

  if (preflightOnly) return;

  console.log(`\nDeploying SimpleBankV2 to ${preflight.networkName}...`);

  const bank = await preflight.SimpleBankV2.deploy(
    preflight.initialInterestRate,
    preflight.initialOwner,
    preflight.initialMaxTotalDeposits
  );
  await bank.waitForDeployment();

  const contractAddress = await bank.getAddress();
  const owner = await bank.owner();
  const interestRate = await bank.interestRate();
  const maxTotalDeposits = await bank.maxTotalDeposits();
  const interestRatePercent = Number(interestRate) / 100;

  console.log("\nSimpleBankV2 deployed successfully!");
  console.log("Contract address:", contractAddress);
  console.log("Owner:", owner);
  console.log("Interest rate:", `${interestRatePercent}%`);
  console.log("Global TVL cap:", `${hre.ethers.formatEther(maxTotalDeposits)} ETH`);

  const deploymentDir = path.join(process.cwd(), "deployments");
  fs.mkdirSync(deploymentDir, { recursive: true });

  const deploymentPath = getDeploymentPath(preflight.networkName);
  const data = {
    contractAddress,
    network: preflight.networkName,
    chainId: preflight.chainId,
    deployer: preflight.deployer.address,
    deployedAt: new Date().toISOString(),
    interestRate: interestRate.toString(),
    maxTotalDeposits: maxTotalDeposits.toString(),
    maxTotalDepositsEth: hre.ethers.formatEther(maxTotalDeposits),
    owner,
    initialOwner: preflight.initialOwner,
    interestReservePolicy: {
      expectedTvl: preflight.interestReservePolicy.expectedTvl.toString(),
      expectedTvlEth: hre.ethers.formatEther(preflight.interestReservePolicy.expectedTvl),
      expectedTvlSource: preflight.interestReservePolicy.expectedTvlSource,
      periodDays: preflight.interestReservePolicy.periodDays.toString(),
      requiredReserve: preflight.interestReservePolicy.requiredReserve.toString(),
      requiredReserveEth: hre.ethers.formatEther(preflight.interestReservePolicy.requiredReserve),
    },
    estimatedGas: preflight.deploymentCost.gasLimit.toString(),
  };

  fs.writeFileSync(deploymentPath, JSON.stringify(data, null, 2));
  console.log(`Deployment info saved to ${deploymentPath}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Deployment failed:", error);
    process.exitCode = 1;
  });
}

module.exports = {
  calculateRequiredInterestReserve,
  getInterestReservePolicy,
  getDeploymentPath,
  main,
  runPreflight,
};
