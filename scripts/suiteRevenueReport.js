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

function readJsonIfExists(fileName) {
  const targetPath = path.join(process.cwd(), "deployments", fileName);
  if (!fs.existsSync(targetPath)) return null;
  return JSON.parse(fs.readFileSync(targetPath, "utf8"));
}

function sameAddress(first, second) {
  return Boolean(first && second && first.toLowerCase() === second.toLowerCase());
}

function isAddress(value) {
  return hre.ethers.isAddress(value) && value !== hre.ethers.ZeroAddress;
}

function formatEth(value) {
  return hre.ethers.formatEther(value);
}

function formatUnits(value, decimals) {
  return hre.ethers.formatUnits(value, Number(decimals));
}

function add(results, level, message, details = "") {
  results.push({ level, message, details });
}

function pass(results, message, details = "") {
  add(results, "PASS", message, details);
}

function warn(results, message, details = "") {
  add(results, "WARN", message, details);
}

function fail(results, message, details = "") {
  add(results, "FAIL", message, details);
}

function printResult(result) {
  const suffix = result.details ? `: ${result.details}` : "";
  console.log(`[${result.level}] ${result.message}${suffix}`);
}

function getExpectedTreasury() {
  return normalizeEnvValue(
    process.env.EXPECTED_TREASURY ||
      process.env.TREASURY_ADDRESS ||
      process.env.BANK_TREASURY ||
      process.env.VAULT_TREASURY ||
      process.env.LENDING_TREASURY ||
      process.env.SWAP_TREASURY
  );
}

async function tokenMeta(tokenAddress) {
  const token = new hre.ethers.Contract(
    tokenAddress,
    [
      "function symbol() view returns (string)",
      "function decimals() view returns (uint8)",
      "function balanceOf(address account) view returns (uint256)",
    ],
    hre.ethers.provider
  );

  const [symbol, decimals] = await Promise.all([
    token.symbol().catch(() => "ERC20"),
    token.decimals().catch(() => 18),
  ]);

  return { token, symbol, decimals: Number(decimals) };
}

async function reportTreasury(networkName, expectedTreasury, results) {
  const deployment = readJsonIfExists(`treasury-${networkName}.json`);
  if (!deployment || !isAddress(deployment.contractAddress)) {
    fail(results, "Central treasury deployment is available", `treasury-${networkName}.json`);
    return null;
  }

  const treasuryAddress = expectedTreasury || deployment.contractAddress;
  const treasury = await hre.ethers.getContractAt("SimpleTreasury", treasuryAddress);
  const [owner, paused, assets, ethBalance] = await Promise.all([
    treasury.owner(),
    treasury.paused(),
    treasury.getTrackedAssets(),
    hre.ethers.provider.getBalance(treasuryAddress),
  ]);

  pass(results, "Central treasury contract is deployed", treasuryAddress);
  pass(results, "Treasury owner is set", owner);
  if (paused) warn(results, "Treasury is paused", "outflows and execute are blocked");
  else pass(results, "Treasury is active", "not paused");

  console.log("");
  console.log("Treasury");
  console.log("--------");
  console.log("Address:", treasuryAddress);
  console.log("Owner:", owner);
  console.log("Paused:", paused ? "yes" : "no");
  console.log("ETH balance:", `${formatEth(ethBalance)} ETH`);
  console.log("Tracked assets:", assets.length.toString());

  for (const asset of assets) {
    const policy = await treasury.assetPolicies(asset);
    if (sameAddress(asset, hre.ethers.ZeroAddress)) {
      console.log("Asset ETH");
      console.log("  Operator enabled:", policy.enabled ? "yes" : "no");
      console.log("  Spend limit:", `${formatEth(policy.spendLimit)} ETH`);
      console.log("  Spent:", `${formatEth(policy.spent)} ETH`);
      continue;
    }

    const { token, symbol, decimals } = await tokenMeta(asset);
    const balance = await token.balanceOf(treasuryAddress);
    console.log(`Asset ${symbol} (${asset})`);
    console.log("  Balance:", `${formatUnits(balance, decimals)} ${symbol}`);
    console.log("  Operator enabled:", policy.enabled ? "yes" : "no");
    console.log("  Spend limit:", `${formatUnits(policy.spendLimit, decimals)} ${symbol}`);
    console.log("  Spent:", `${formatUnits(policy.spent, decimals)} ${symbol}`);
  }

  return { address: treasuryAddress, contract: treasury, owner, paused };
}

async function reportBank(networkName, treasuryInfo, results) {
  const deployment = readJsonIfExists(`${networkName}.json`);
  if (!deployment || !isAddress(deployment.contractAddress)) {
    warn(results, "Bank deployment not found", `${networkName}.json`);
    return;
  }

  const contractName = deployment.contractName || "SimpleBankV2";
  const bank = await hre.ethers.getContractAt(contractName, deployment.contractAddress);
  if (contractName !== "SimpleBankV3" || typeof bank.treasury !== "function") {
    warn(results, "Bank monetization unavailable", contractName);
    return;
  }

  const [treasury, depositFeeBps, withdrawalFeeBps, protocolFees] = await Promise.all([
    bank.treasury(),
    bank.depositFeeBps(),
    bank.withdrawalFeeBps(),
    bank.protocolFees(),
  ]);

  if (treasuryInfo && sameAddress(treasury, treasuryInfo.address)) pass(results, "Bank revenue routes to central treasury", treasury);
  else fail(results, "Bank revenue routes to central treasury", treasury);
  if (BigInt(depositFeeBps) > 0n || BigInt(withdrawalFeeBps) > 0n) {
    pass(results, "Bank has at least one active fee", `${depositFeeBps.toString()} / ${withdrawalFeeBps.toString()} bps`);
  } else {
    warn(results, "Bank fees are disabled", "deposit and withdrawal fees are 0 bps");
  }

  console.log("");
  console.log("Bank Revenue");
  console.log("------------");
  console.log("Address:", deployment.contractAddress);
  console.log("Treasury:", treasury);
  console.log("Deposit fee:", `${depositFeeBps.toString()} bps`);
  console.log("Withdrawal fee:", `${withdrawalFeeBps.toString()} bps`);
  console.log("Pending protocol fees:", `${formatEth(protocolFees)} ETH`);
}

async function reportVault(networkName, treasuryInfo, results) {
  const deployment =
    readJsonIfExists(`strategy-vault-${networkName}.json`) ||
    readJsonIfExists(`weth-vault-${networkName}.json`);
  if (!deployment || !isAddress(deployment.contractAddress)) {
    warn(results, "Vault deployment not found", `strategy-vault-${networkName}.json`);
    return;
  }

  const vault = await hre.ethers.getContractAt(deployment.contractName || "SimpleWETHYieldVaultV2", deployment.contractAddress);
  const [treasury, performanceFeeBps, treasuryShares, decimals] = await Promise.all([
    vault.treasury(),
    vault.performanceFeeBps(),
    treasuryInfo ? vault.balanceOf(treasuryInfo.address) : 0n,
    vault.decimals(),
  ]);
  const treasuryAssets = treasuryShares === 0n ? 0n : await vault.convertToAssets(treasuryShares);

  if (treasuryInfo && sameAddress(treasury, treasuryInfo.address)) pass(results, "Vault revenue routes to central treasury", treasury);
  else fail(results, "Vault revenue routes to central treasury", treasury);
  if (BigInt(performanceFeeBps) > 0n) pass(results, "Vault performance fee is active", `${performanceFeeBps.toString()} bps`);
  else warn(results, "Vault performance fee is disabled", "0 bps");

  console.log("");
  console.log("Vault Revenue");
  console.log("-------------");
  console.log("Address:", deployment.contractAddress);
  console.log("Treasury:", treasury);
  console.log("Performance fee:", `${performanceFeeBps.toString()} bps`);
  console.log("Treasury shares:", `${formatUnits(treasuryShares, decimals)} sbWETH`);
  console.log("Treasury share assets:", `${formatEth(treasuryAssets)} WETH`);
}

async function reportLending(networkName, treasuryInfo, results) {
  const deployment = readJsonIfExists(`lending-pool-${networkName}.json`);
  if (!deployment || !isAddress(deployment.contractAddress)) {
    warn(results, "Lending deployment not found", `lending-pool-${networkName}.json`);
    return;
  }

  const pool = await hre.ethers.getContractAt("SimpleLendingPool", deployment.contractAddress);
  const [treasury, borrowAprBps, originationFeeBps, protocolFees] = await Promise.all([
    pool.treasury(),
    pool.borrowAprBps(),
    pool.originationFeeBps(),
    pool.protocolFees(),
  ]);

  if (treasuryInfo && sameAddress(treasury, treasuryInfo.address)) pass(results, "Lending revenue routes to central treasury", treasury);
  else fail(results, "Lending revenue routes to central treasury", treasury);
  if (BigInt(originationFeeBps) > 0n) pass(results, "Lending origination fee is active", `${originationFeeBps.toString()} bps`);
  else warn(results, "Lending origination fee is disabled", "0 bps");

  console.log("");
  console.log("Lending Revenue");
  console.log("---------------");
  console.log("Address:", deployment.contractAddress);
  console.log("Treasury:", treasury);
  console.log("Borrow APR:", `${borrowAprBps.toString()} bps`);
  console.log("Origination fee:", `${originationFeeBps.toString()} bps`);
  console.log("Pending protocol fees:", `${formatEth(protocolFees)} ETH`);
}

async function reportSwap(networkName, treasuryInfo, results) {
  const deployment = readJsonIfExists(`swap-pool-${networkName}.json`);
  if (!deployment || !isAddress(deployment.contractAddress)) {
    warn(results, "Swap deployment not found", `swap-pool-${networkName}.json`);
    return;
  }

  const pool = await hre.ethers.getContractAt("SimpleSwapPool", deployment.contractAddress);
  const [
    treasury,
    token0,
    token1,
    swapFeeBps,
    protocolFeeShareBps,
    protocolFees0,
    protocolFees1,
  ] = await Promise.all([
    pool.treasury(),
    pool.token0(),
    pool.token1(),
    pool.swapFeeBps(),
    pool.protocolFeeShareBps(),
    pool.protocolFees0(),
    pool.protocolFees1(),
  ]);
  const [meta0, meta1] = await Promise.all([tokenMeta(token0), tokenMeta(token1)]);

  if (treasuryInfo && sameAddress(treasury, treasuryInfo.address)) pass(results, "Swap revenue routes to central treasury", treasury);
  else fail(results, "Swap revenue routes to central treasury", treasury);
  if (BigInt(swapFeeBps) > 0n && BigInt(protocolFeeShareBps) > 0n) {
    pass(results, "Swap protocol fee is active", `${swapFeeBps.toString()} bps x ${protocolFeeShareBps.toString()} bps share`);
  } else {
    warn(results, "Swap protocol fee is disabled", `${swapFeeBps.toString()} bps x ${protocolFeeShareBps.toString()} bps share`);
  }

  console.log("");
  console.log("Swap Revenue");
  console.log("------------");
  console.log("Address:", deployment.contractAddress);
  console.log("Treasury:", treasury);
  console.log("Swap fee:", `${swapFeeBps.toString()} bps`);
  console.log("Protocol fee share:", `${protocolFeeShareBps.toString()} bps`);
  console.log("Pending protocol fees0:", `${formatUnits(protocolFees0, meta0.decimals)} ${meta0.symbol}`);
  console.log("Pending protocol fees1:", `${formatUnits(protocolFees1, meta1.decimals)} ${meta1.symbol}`);
}

async function main() {
  const networkName = hre.network.name;
  if (networkName === "mainnet" && !normalizeEnvValue(process.env.MAINNET_RPC_URL)) {
    throw new Error("MAINNET_RPC_URL is empty. Use sepolia or configure a mainnet RPC URL.");
  }

  const results = [];
  const network = await hre.ethers.provider.getNetwork();
  const expectedTreasury = getExpectedTreasury();

  console.log("\nSimpleBank Suite Revenue Readiness");
  console.log("Network:", networkName);
  console.log("Chain ID:", network.chainId.toString());
  if (expectedTreasury) console.log("Expected treasury:", expectedTreasury);

  const treasuryInfo = await reportTreasury(networkName, expectedTreasury, results);
  await reportBank(networkName, treasuryInfo, results);
  await reportVault(networkName, treasuryInfo, results);
  await reportLending(networkName, treasuryInfo, results);
  await reportSwap(networkName, treasuryInfo, results);

  console.log("");
  console.log("Readiness Checks");
  console.log("----------------");
  for (const result of results) printResult(result);

  const failures = results.filter((result) => result.level === "FAIL");
  const warnings = results.filter((result) => result.level === "WARN");
  console.log("");
  console.log(`Revenue readiness summary: ${failures.length} failure(s), ${warnings.length} warning(s), ${results.length} checks.`);

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Suite revenue readiness failed:", error);
    process.exitCode = 1;
  });
}

module.exports = {
  main,
};
