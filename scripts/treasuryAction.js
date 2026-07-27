const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const ACTIONS = new Set([
  "status",
  "set-operator",
  "set-asset-policy",
  "reset-asset-spend",
  "withdraw-eth",
  "withdraw-token",
  "spend-eth",
  "spend-token",
  "execute",
  "pause",
  "unpause",
]);

const ERC20_ABI = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address account) view returns (uint256)",
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

function parseAction() {
  const action = normalizeEnvValue(process.env.ACTION || "status");
  if (!ACTIONS.has(action)) {
    throw new Error(`ACTION must be one of ${Array.from(ACTIONS).join(", ")}, got: ${action}`);
  }

  return action;
}

function parseAddressEnv(name, fallback = "") {
  const address = normalizeEnvValue(process.env[name] || fallback);
  if (!hre.ethers.isAddress(address) || address === hre.ethers.ZeroAddress) {
    throw new Error(`${name} must be a non-zero address, got: ${address || "(empty)"}`);
  }

  return address;
}

function parseAssetEnv(name = "ASSET_ADDRESS", fallback = hre.ethers.ZeroAddress) {
  const raw = normalizeEnvValue(process.env[name] || fallback);
  if (!raw || raw.toLowerCase() === "eth" || raw === "0") return hre.ethers.ZeroAddress;
  if (!hre.ethers.isAddress(raw)) {
    throw new Error(`${name} must be ETH, 0, or an address, got: ${raw}`);
  }

  return raw;
}

function parseBoolEnv(name, fallback = false) {
  const raw = normalizeEnvValue(process.env[name]);
  if (!raw) return fallback;
  const value = raw.toLowerCase();
  if (value === "1" || value === "true" || value === "yes") return true;
  if (value === "0" || value === "false" || value === "no") return false;
  throw new Error(`${name} must be true or false, got: ${raw}`);
}

function parseEthAmountEnv(name, fallback = "") {
  const rawAmount = normalizeEnvValue(process.env[name] || fallback);
  if (!/^\d+(\.\d+)?$/.test(rawAmount)) {
    throw new Error(`${name} must be a non-negative ETH amount, got: ${process.env[name] || fallback}`);
  }

  return hre.ethers.parseEther(rawAmount);
}

function parseCallDataEnv(name = "CALL_DATA", fallback = "0x") {
  const data = normalizeEnvValue(process.env[name] || fallback);
  if (!/^0x([0-9a-fA-F]{2})*$/.test(data)) {
    throw new Error(`${name} must be 0x-prefixed hex bytes, got: ${data || "(empty)"}`);
  }

  return data;
}

function parseTokenAmount(rawAmount, decimals, name) {
  const normalized = normalizeEnvValue(rawAmount);
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw new Error(`${name} must be a non-negative token amount, got: ${rawAmount}`);
  }

  return hre.ethers.parseUnits(normalized, decimals);
}

function getTreasuryDeploymentPath(networkName) {
  const customPath = normalizeEnvValue(process.env.TREASURY_DEPLOYMENT_FILE);
  if (customPath) {
    return path.isAbsolute(customPath) ? customPath : path.join(process.cwd(), customPath);
  }

  return path.join(process.cwd(), "deployments", `treasury-${networkName}.json`);
}

function readTreasuryDeployment(networkName) {
  const deploymentPath = getTreasuryDeploymentPath(networkName);
  if (!fs.existsSync(deploymentPath)) {
    throw new Error(`${deploymentPath} does not exist. Deploy the treasury or set TREASURY_ADDRESS.`);
  }

  return JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
}

function resolveTreasuryAddress(networkName, deployment) {
  const configuredAddress = normalizeEnvValue(process.env.TREASURY_ADDRESS);
  if (configuredAddress) {
    if (!hre.ethers.isAddress(configuredAddress)) {
      throw new Error(`Invalid TREASURY_ADDRESS: ${configuredAddress}`);
    }

    return configuredAddress;
  }

  if (!hre.ethers.isAddress(deployment.contractAddress)) {
    throw new Error(`Invalid contractAddress in ${getTreasuryDeploymentPath(networkName)}`);
  }

  return deployment.contractAddress;
}

async function readTokenMeta(tokenAddress) {
  const token = new hre.ethers.Contract(tokenAddress, ERC20_ABI, hre.ethers.provider);
  const [symbol, decimals] = await Promise.all([token.symbol(), token.decimals()]);
  return { token, symbol, decimals: Number(decimals) };
}

function formatAssetAmount(asset, amount, decimals = 18, symbol = "ETH") {
  return `${hre.ethers.formatUnits(amount, decimals)} ${symbol}`;
}

async function parseAmountForAsset(asset, amountEnvName = "AMOUNT") {
  if (asset === hre.ethers.ZeroAddress) {
    return parseEthAmountEnv(amountEnvName);
  }

  const { decimals } = await readTokenMeta(asset);
  return parseTokenAmount(process.env[amountEnvName], decimals, amountEnvName);
}

async function printAssetLine(treasury, treasuryAddress, asset) {
  const policy = await treasury.assetPolicies(asset);
  if (asset === hre.ethers.ZeroAddress) {
    const balance = await hre.ethers.provider.getBalance(treasuryAddress);
    console.log("Asset ETH");
    console.log("  Balance:", formatAssetAmount(asset, balance));
    console.log("  Operator enabled:", policy.enabled ? "yes" : "no");
    console.log("  Spend limit:", formatAssetAmount(asset, policy.spendLimit));
    console.log("  Spent:", formatAssetAmount(asset, policy.spent));
    return;
  }

  const { token, symbol, decimals } = await readTokenMeta(asset);
  const balance = await token.balanceOf(treasuryAddress);
  console.log(`Asset ${symbol} (${asset})`);
  console.log("  Balance:", formatAssetAmount(asset, balance, decimals, symbol));
  console.log("  Operator enabled:", policy.enabled ? "yes" : "no");
  console.log("  Spend limit:", formatAssetAmount(asset, policy.spendLimit, decimals, symbol));
  console.log("  Spent:", formatAssetAmount(asset, policy.spent, decimals, symbol));
}

async function printStatus(treasury, treasuryAddress, viewAddress) {
  const [owner, paused, isOperator, assets] = await Promise.all([
    treasury.owner(),
    treasury.paused(),
    viewAddress === hre.ethers.ZeroAddress ? false : treasury.operators(viewAddress),
    treasury.getTrackedAssets(),
  ]);

  console.log("\nSimpleTreasury status");
  console.log("Network:", hre.network.name);
  console.log("Treasury:", treasuryAddress);
  console.log("View address:", viewAddress);
  console.log("Owner:", owner);
  console.log("Paused:", paused ? "yes" : "no");
  console.log("View is operator:", isOperator ? "yes" : "no");
  console.log("Tracked assets:", assets.length.toString());

  const extraAssets = normalizeEnvValue(process.env.TREASURY_ASSETS);
  const assetSet = new Set(assets.map((asset) => asset.toLowerCase()));
  const allAssets = [...assets];
  if (extraAssets) {
    for (const rawAsset of extraAssets.split(",")) {
      const asset = parseAssetEnv("TREASURY_ASSETS_ITEM", rawAsset);
      if (!assetSet.has(asset.toLowerCase())) {
        assetSet.add(asset.toLowerCase());
        allAssets.push(asset);
      }
    }
  }

  for (const asset of allAssets) {
    await printAssetLine(treasury, treasuryAddress, asset);
  }
}

async function requireOwner(treasury, signer) {
  const owner = await treasury.owner();
  if (owner.toLowerCase() !== signer.address.toLowerCase()) {
    throw new Error(`Signer ${signer.address} is not treasury owner ${owner}. Use Safe calldata instead.`);
  }
}

async function main() {
  const action = parseAction();
  const networkName = hre.network.name;
  const deployment = readTreasuryDeployment(networkName);
  const treasuryAddress = resolveTreasuryAddress(networkName, deployment);
  const signers = await hre.ethers.getSigners();
  const signer = signers[0] || null;
  const runner = signer || hre.ethers.provider;
  const treasury = await hre.ethers.getContractAt("SimpleTreasury", treasuryAddress, runner);

  if (action === "status") {
    const viewAddress = normalizeEnvValue(process.env.VIEW_ADDRESS || (signer ? signer.address : hre.ethers.ZeroAddress));
    if (!hre.ethers.isAddress(viewAddress)) throw new Error(`Invalid VIEW_ADDRESS: ${viewAddress}`);
    await printStatus(treasury, treasuryAddress, viewAddress);
    return;
  }

  if (!signer) {
    throw new Error("No signer available. Check PRIVATE_KEY and network config.");
  }

  if (["set-operator", "set-asset-policy", "reset-asset-spend", "withdraw-eth", "withdraw-token", "execute", "pause", "unpause"].includes(action)) {
    await requireOwner(treasury, signer);
  }

  if (action === "set-operator") {
    const operator = parseAddressEnv("TREASURY_OPERATOR");
    const allowed = parseBoolEnv("TREASURY_OPERATOR_ALLOWED", true);
    console.log(`${allowed ? "Allowing" : "Revoking"} treasury operator ${operator}...`);
    const tx = await treasury.setOperator(operator, allowed);
    await tx.wait();
    console.log("Operator update complete.");
    console.log("Tx:", tx.hash);
    return;
  }

  if (action === "set-asset-policy") {
    const asset = parseAssetEnv();
    const enabled = parseBoolEnv("ASSET_ENABLED", true);
    const spendLimit = await parseAmountForAsset(asset, "SPEND_LIMIT");
    console.log(`Setting treasury asset policy for ${asset === hre.ethers.ZeroAddress ? "ETH" : asset}...`);
    const tx = await treasury.setAssetPolicy(asset, enabled, spendLimit);
    await tx.wait();
    console.log("Asset policy update complete.");
    console.log("Tx:", tx.hash);
    return;
  }

  if (action === "reset-asset-spend") {
    const asset = parseAssetEnv();
    console.log(`Resetting treasury spent amount for ${asset === hre.ethers.ZeroAddress ? "ETH" : asset}...`);
    const tx = await treasury.resetAssetSpend(asset);
    await tx.wait();
    console.log("Asset spend reset complete.");
    console.log("Tx:", tx.hash);
    return;
  }

  if (action === "withdraw-eth") {
    const recipient = parseAddressEnv("RECIPIENT");
    const amount = parseEthAmountEnv("AMOUNT_ETH", process.env.AMOUNT);
    console.log(`Withdrawing ${hre.ethers.formatEther(amount)} ETH from treasury to ${recipient}...`);
    const tx = await treasury.withdrawETH(recipient, amount);
    await tx.wait();
    console.log("ETH withdrawal complete.");
    console.log("Tx:", tx.hash);
    return;
  }

  if (action === "withdraw-token") {
    const tokenAddress = parseAddressEnv("TOKEN_ADDRESS", process.env.ASSET_ADDRESS);
    const recipient = parseAddressEnv("RECIPIENT");
    const { symbol, decimals } = await readTokenMeta(tokenAddress);
    const amount = parseTokenAmount(process.env.AMOUNT || process.env.TOKEN_AMOUNT, decimals, "AMOUNT");
    console.log(`Withdrawing ${formatAssetAmount(tokenAddress, amount, decimals, symbol)} from treasury to ${recipient}...`);
    const tx = await treasury.withdrawToken(tokenAddress, recipient, amount);
    await tx.wait();
    console.log("Token withdrawal complete.");
    console.log("Tx:", tx.hash);
    return;
  }

  if (action === "spend-eth") {
    const recipient = parseAddressEnv("RECIPIENT");
    const amount = parseEthAmountEnv("AMOUNT_ETH", process.env.AMOUNT);
    console.log(`Spending ${hre.ethers.formatEther(amount)} ETH from treasury to ${recipient}...`);
    const tx = await treasury.spendETH(recipient, amount);
    await tx.wait();
    console.log("ETH spend complete.");
    console.log("Tx:", tx.hash);
    return;
  }

  if (action === "spend-token") {
    const tokenAddress = parseAddressEnv("TOKEN_ADDRESS", process.env.ASSET_ADDRESS);
    const recipient = parseAddressEnv("RECIPIENT");
    const { symbol, decimals } = await readTokenMeta(tokenAddress);
    const amount = parseTokenAmount(process.env.AMOUNT || process.env.TOKEN_AMOUNT, decimals, "AMOUNT");
    console.log(`Spending ${formatAssetAmount(tokenAddress, amount, decimals, symbol)} from treasury to ${recipient}...`);
    const tx = await treasury.spendToken(tokenAddress, recipient, amount);
    await tx.wait();
    console.log("Token spend complete.");
    console.log("Tx:", tx.hash);
    return;
  }

  if (action === "execute") {
    const target = parseAddressEnv("TARGET");
    const value = parseEthAmountEnv("CALL_VALUE_ETH", process.env.VALUE_ETH || "0");
    const data = parseCallDataEnv();
    console.log(`Executing treasury call to ${target} with ${hre.ethers.formatEther(value)} ETH...`);
    const tx = await treasury.execute(target, value, data);
    await tx.wait();
    console.log("Treasury external call complete.");
    console.log("Tx:", tx.hash);
    return;
  }

  if (action === "pause") {
    console.log("Pausing treasury...");
    const tx = await treasury.pause();
    await tx.wait();
    console.log("Treasury paused.");
    console.log("Tx:", tx.hash);
    return;
  }

  if (action === "unpause") {
    console.log("Unpausing treasury...");
    const tx = await treasury.unpause();
    await tx.wait();
    console.log("Treasury unpaused.");
    console.log("Tx:", tx.hash);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Treasury action failed:", error);
    process.exitCode = 1;
  });
}

module.exports = {
  main,
};
