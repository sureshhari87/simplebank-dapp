const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const ACTIONS = new Set([
  "status",
  "supply",
  "withdraw-supply",
  "deposit-collateral",
  "borrow",
  "borrow-with-collateral",
  "repay",
  "withdraw-collateral",
  "liquidate",
  "claim-fees",
]);

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

function parseAction() {
  const action = normalizeEnvValue(process.env.ACTION || "status");
  if (!ACTIONS.has(action)) {
    throw new Error(`ACTION must be one of ${Array.from(ACTIONS).join(", ")}, got: ${action}`);
  }

  return action;
}

function parseEthAmountEnv(name, fallback = "") {
  const rawAmount = normalizeEnvValue(process.env[name] || fallback);
  if (!/^\d+(\.\d+)?$/.test(rawAmount)) {
    throw new Error(`${name} must be a non-negative ETH amount, got: ${process.env[name] || fallback}`);
  }

  return hre.ethers.parseEther(rawAmount);
}

function parseAddressEnv(name, fallback = "") {
  const address = normalizeEnvValue(process.env[name] || fallback);
  if (!hre.ethers.isAddress(address) || address === hre.ethers.ZeroAddress) {
    throw new Error(`${name} must be a non-zero address, got: ${address || "(empty)"}`);
  }

  return address;
}

function isTruthyEnv(name) {
  const value = normalizeEnvValue(process.env[name]).toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function getLendingDeploymentPath(networkName) {
  const customPath = normalizeEnvValue(process.env.LENDING_DEPLOYMENT_FILE);
  if (customPath) {
    return path.isAbsolute(customPath) ? customPath : path.join(process.cwd(), customPath);
  }

  return path.join(process.cwd(), "deployments", `lending-pool-${networkName}.json`);
}

function readLendingDeployment(networkName) {
  const deploymentPath = getLendingDeploymentPath(networkName);
  if (!fs.existsSync(deploymentPath)) {
    throw new Error(`${deploymentPath} does not exist. Deploy the lending pool or set LENDING_POOL_ADDRESS.`);
  }

  return JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
}

function resolvePoolAddress(networkName, deployment) {
  const configuredAddress = normalizeEnvValue(process.env.LENDING_POOL_ADDRESS);
  if (configuredAddress) {
    if (!hre.ethers.isAddress(configuredAddress)) {
      throw new Error(`Invalid LENDING_POOL_ADDRESS: ${configuredAddress}`);
    }

    return configuredAddress;
  }

  if (!hre.ethers.isAddress(deployment.contractAddress)) {
    throw new Error(`Invalid contractAddress in ${getLendingDeploymentPath(networkName)}`);
  }

  return deployment.contractAddress;
}

function resolveViewAddress(defaultAddress = hre.ethers.ZeroAddress) {
  const viewAddress = normalizeEnvValue(process.env.VIEW_ADDRESS || defaultAddress);
  if (!hre.ethers.isAddress(viewAddress)) {
    throw new Error(`Invalid VIEW_ADDRESS: ${viewAddress}`);
  }

  return viewAddress;
}

function formatHealthFactor(healthFactorBps) {
  if (healthFactorBps === hre.ethers.MaxUint256) return "no debt";
  return `${(Number(healthFactorBps) / 10000).toFixed(4)}x`;
}

async function printStatus(pool, poolAddress, viewAddress) {
  const [
    owner,
    treasury,
    borrowAprBps,
    originationFeeBps,
    maxLtvBps,
    liquidationThresholdBps,
    liquidationBonusBps,
    maxPoolLiquidity,
    totalAssets,
    availableLiquidity,
    totalSupplyShares,
    totalBorrowDebt,
    totalCollateral,
    protocolFees,
    paused,
    viewShares,
    viewSupplyAssets,
    loan,
    previewDebt,
    borrowCapacity,
    healthFactor,
    liquidatable,
    contractBalance,
  ] = await Promise.all([
    pool.owner(),
    pool.treasury(),
    pool.borrowAprBps(),
    pool.originationFeeBps(),
    pool.maxLtvBps(),
    pool.liquidationThresholdBps(),
    pool.liquidationBonusBps(),
    pool.maxPoolLiquidity(),
    pool.totalAssets(),
    pool.availableLiquidity(),
    pool.totalSupplyShares(),
    pool.totalBorrowDebt(),
    pool.totalCollateral(),
    pool.protocolFees(),
    pool.paused(),
    viewAddress === hre.ethers.ZeroAddress ? 0n : pool.supplyShares(viewAddress),
    viewAddress === hre.ethers.ZeroAddress ? 0n : pool.supplyBalanceOf(viewAddress),
    viewAddress === hre.ethers.ZeroAddress ? { collateral: 0n, debt: 0n, lastAccrualTimestamp: 0n } : pool.loans(viewAddress),
    viewAddress === hre.ethers.ZeroAddress ? 0n : pool.previewDebt(viewAddress),
    viewAddress === hre.ethers.ZeroAddress ? 0n : pool.borrowCapacity(viewAddress),
    viewAddress === hre.ethers.ZeroAddress ? hre.ethers.MaxUint256 : pool.healthFactorBps(viewAddress),
    viewAddress === hre.ethers.ZeroAddress ? false : pool.isLiquidatable(viewAddress),
    hre.ethers.provider.getBalance(poolAddress),
  ]);

  console.log("\nSimpleLendingPool status");
  console.log("Network:", hre.network.name);
  console.log("Pool:", poolAddress);
  console.log("View address:", viewAddress);
  console.log("Owner:", owner);
  console.log("Treasury:", treasury);
  console.log("Paused:", paused ? "yes" : "no");
  console.log("Borrow APR:", `${borrowAprBps.toString()} bps`);
  console.log("Origination fee:", `${originationFeeBps.toString()} bps`);
  console.log("Max LTV:", `${maxLtvBps.toString()} bps`);
  console.log("Liquidation threshold:", `${liquidationThresholdBps.toString()} bps`);
  console.log("Liquidation bonus:", `${liquidationBonusBps.toString()} bps`);
  console.log("Max pool liquidity:", maxPoolLiquidity === 0n ? "uncapped" : `${hre.ethers.formatEther(maxPoolLiquidity)} ETH`);
  console.log("Total assets:", `${hre.ethers.formatEther(totalAssets)} ETH`);
  console.log("Available liquidity:", `${hre.ethers.formatEther(availableLiquidity)} ETH`);
  console.log("Total supply shares:", `${hre.ethers.formatEther(totalSupplyShares)} lpETH`);
  console.log("Total borrow debt:", `${hre.ethers.formatEther(totalBorrowDebt)} ETH`);
  console.log("Total collateral:", `${hre.ethers.formatEther(totalCollateral)} ETH`);
  console.log("Protocol fees:", `${hre.ethers.formatEther(protocolFees)} ETH`);
  console.log("Contract ETH balance:", `${hre.ethers.formatEther(contractBalance)} ETH`);
  console.log("View supply shares:", `${hre.ethers.formatEther(viewShares)} lpETH`);
  console.log("View supply assets:", `${hre.ethers.formatEther(viewSupplyAssets)} ETH`);
  console.log("View collateral:", `${hre.ethers.formatEther(loan.collateral)} ETH`);
  console.log("View stored debt:", `${hre.ethers.formatEther(loan.debt)} ETH`);
  console.log("View debt with interest:", `${hre.ethers.formatEther(previewDebt)} ETH`);
  console.log("View borrow capacity:", `${hre.ethers.formatEther(borrowCapacity)} ETH`);
  console.log("View health factor:", formatHealthFactor(healthFactor));
  console.log("View liquidatable:", liquidatable ? "yes" : "no");
}

async function requireOwner(pool, signer) {
  const owner = await pool.owner();
  if (owner.toLowerCase() !== signer.address.toLowerCase()) {
    throw new Error(`Signer ${signer.address} is not lending pool owner ${owner}. Use Safe calldata instead.`);
  }
}

async function main() {
  const action = parseAction();
  const networkName = hre.network.name;
  const deployment = readLendingDeployment(networkName);
  const poolAddress = resolvePoolAddress(networkName, deployment);
  const signers = await hre.ethers.getSigners();
  const signer = signers[0] || null;
  const runner = signer || hre.ethers.provider;
  const pool = await hre.ethers.getContractAt("SimpleLendingPool", poolAddress, runner);

  if (action === "status") {
    await printStatus(pool, poolAddress, resolveViewAddress(signer ? signer.address : undefined));
    return;
  }

  if (!signer) {
    throw new Error("No signer available. Check PRIVATE_KEY and network config.");
  }

  if (action === "supply") {
    const amount = parseEthAmountEnv("SUPPLY_AMOUNT_ETH");
    console.log(`Supplying ${hre.ethers.formatEther(amount)} ETH to lending pool...`);
    const tx = await pool.supply({ value: amount });
    await tx.wait();
    console.log("Supply complete.");
    console.log("Tx:", tx.hash);
    return;
  }

  if (action === "withdraw-supply") {
    const shares = isTruthyEnv("WITHDRAW_ALL")
      ? await pool.supplyShares(signer.address)
      : parseEthAmountEnv("SUPPLY_SHARES");
    console.log(`Withdrawing ${hre.ethers.formatEther(shares)} lpETH shares from lending pool...`);
    const tx = await pool.withdrawSupply(shares);
    await tx.wait();
    console.log("Supply withdrawal complete.");
    console.log("Tx:", tx.hash);
    return;
  }

  if (action === "deposit-collateral") {
    const amount = parseEthAmountEnv("COLLATERAL_AMOUNT_ETH");
    console.log(`Depositing ${hre.ethers.formatEther(amount)} ETH as lending collateral...`);
    const tx = await pool.depositCollateral({ value: amount });
    await tx.wait();
    console.log("Collateral deposit complete.");
    console.log("Tx:", tx.hash);
    return;
  }

  if (action === "borrow") {
    const amount = parseEthAmountEnv("BORROW_AMOUNT_ETH");
    console.log(`Borrowing ${hre.ethers.formatEther(amount)} ETH from lending pool...`);
    const tx = await pool.borrow(amount);
    await tx.wait();
    console.log("Borrow complete.");
    console.log("Tx:", tx.hash);
    return;
  }

  if (action === "borrow-with-collateral") {
    const borrowAmount = parseEthAmountEnv("BORROW_AMOUNT_ETH");
    const collateralAmount = parseEthAmountEnv("COLLATERAL_AMOUNT_ETH");
    console.log(
      `Depositing ${hre.ethers.formatEther(collateralAmount)} ETH collateral and borrowing ${hre.ethers.formatEther(
        borrowAmount
      )} ETH...`
    );
    const tx = await pool.borrowWithCollateral(borrowAmount, { value: collateralAmount });
    await tx.wait();
    console.log("Borrow with collateral complete.");
    console.log("Tx:", tx.hash);
    return;
  }

  if (action === "repay") {
    let amount;
    if (isTruthyEnv("REPAY_ALL")) {
      const buffer = parseEthAmountEnv("REPAY_BUFFER_ETH", "0.000001");
      amount = (await pool.previewDebt(signer.address)) + buffer;
    } else {
      amount = parseEthAmountEnv("REPAY_AMOUNT_ETH");
    }
    console.log(`Repaying up to ${hre.ethers.formatEther(amount)} ETH to lending pool...`);
    const tx = await pool.repay({ value: amount });
    await tx.wait();
    console.log("Repay complete. Any overpayment was refunded by the contract.");
    console.log("Tx:", tx.hash);
    return;
  }

  if (action === "withdraw-collateral") {
    const amount = parseEthAmountEnv("WITHDRAW_COLLATERAL_ETH");
    console.log(`Withdrawing ${hre.ethers.formatEther(amount)} ETH lending collateral...`);
    const tx = await pool.withdrawCollateral(amount);
    await tx.wait();
    console.log("Collateral withdrawal complete.");
    console.log("Tx:", tx.hash);
    return;
  }

  if (action === "liquidate") {
    const borrower = parseAddressEnv("LIQUIDATE_BORROWER");
    const amount = parseEthAmountEnv("LIQUIDATE_REPAY_ETH");
    console.log(`Liquidating ${borrower} with ${hre.ethers.formatEther(amount)} ETH repay amount...`);
    const tx = await pool.liquidate(borrower, { value: amount });
    await tx.wait();
    console.log("Liquidation complete.");
    console.log("Tx:", tx.hash);
    return;
  }

  if (action === "claim-fees") {
    await requireOwner(pool, signer);
    console.log("Claiming lending pool protocol fees...");
    const tx = await pool.claimProtocolFees();
    await tx.wait();
    console.log("Protocol fee claim complete.");
    console.log("Tx:", tx.hash);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Lending pool action failed:", error);
    process.exitCode = 1;
  });
}

module.exports = {
  main,
};
