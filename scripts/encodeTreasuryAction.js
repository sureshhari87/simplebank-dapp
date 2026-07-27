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

async function parseAmountForAsset(asset, amountEnvName = "AMOUNT") {
  if (asset === hre.ethers.ZeroAddress) {
    return parseEthAmountEnv(amountEnvName);
  }

  const token = new hre.ethers.Contract(asset, ERC20_ABI, hre.ethers.provider);
  const decimals = Number(await token.decimals());
  const rawAmount = process.env[amountEnvName] || (amountEnvName === "AMOUNT" ? process.env.TOKEN_AMOUNT : "");
  return parseTokenAmount(rawAmount, decimals, amountEnvName);
}

async function printStatus(treasury, treasuryAddress) {
  const [owner, paused, assets] = await Promise.all([
    treasury.owner(),
    treasury.paused(),
    treasury.getTrackedAssets(),
  ]);

  console.log("\nSimpleTreasury Safe transaction encoder");
  console.log("Network:", hre.network.name);
  console.log("Treasury:", treasuryAddress);
  console.log("Owner:", owner);
  console.log("Paused:", paused ? "yes" : "no");
  console.log("Tracked assets:", assets.length.toString());
  console.log("");
  console.log("Set ACTION to one of:");
  console.log(Array.from(ACTIONS).filter((action) => action !== "status").join(", "));
}

async function main() {
  const action = parseAction();
  const networkName = hre.network.name;
  const deployment = readTreasuryDeployment(networkName);
  const treasuryAddress = resolveTreasuryAddress(networkName, deployment);
  const treasury = await hre.ethers.getContractAt("SimpleTreasury", treasuryAddress);

  if (action === "status") {
    await printStatus(treasury, treasuryAddress);
    return;
  }

  let data;

  if (action === "set-operator") {
    const operator = parseAddressEnv("TREASURY_OPERATOR");
    const allowed = parseBoolEnv("TREASURY_OPERATOR_ALLOWED", true);
    data = treasury.interface.encodeFunctionData("setOperator", [operator, allowed]);
  }

  if (action === "set-asset-policy") {
    const asset = parseAssetEnv();
    const enabled = parseBoolEnv("ASSET_ENABLED", true);
    const spendLimit = await parseAmountForAsset(asset, "SPEND_LIMIT");
    data = treasury.interface.encodeFunctionData("setAssetPolicy", [asset, enabled, spendLimit]);
  }

  if (action === "reset-asset-spend") {
    const asset = parseAssetEnv();
    data = treasury.interface.encodeFunctionData("resetAssetSpend", [asset]);
  }

  if (action === "withdraw-eth") {
    const recipient = parseAddressEnv("RECIPIENT");
    const amount = parseEthAmountEnv("AMOUNT_ETH", process.env.AMOUNT);
    data = treasury.interface.encodeFunctionData("withdrawETH", [recipient, amount]);
  }

  if (action === "withdraw-token") {
    const token = parseAddressEnv("TOKEN_ADDRESS", process.env.ASSET_ADDRESS);
    const recipient = parseAddressEnv("RECIPIENT");
    const amount = await parseAmountForAsset(token, "AMOUNT");
    data = treasury.interface.encodeFunctionData("withdrawToken", [token, recipient, amount]);
  }

  if (action === "spend-eth") {
    const recipient = parseAddressEnv("RECIPIENT");
    const amount = parseEthAmountEnv("AMOUNT_ETH", process.env.AMOUNT);
    data = treasury.interface.encodeFunctionData("spendETH", [recipient, amount]);
  }

  if (action === "spend-token") {
    const token = parseAddressEnv("TOKEN_ADDRESS", process.env.ASSET_ADDRESS);
    const recipient = parseAddressEnv("RECIPIENT");
    const amount = await parseAmountForAsset(token, "AMOUNT");
    data = treasury.interface.encodeFunctionData("spendToken", [token, recipient, amount]);
  }

  if (action === "execute") {
    const target = parseAddressEnv("TARGET");
    const value = parseEthAmountEnv("CALL_VALUE_ETH", process.env.VALUE_ETH || "0");
    const callData = parseCallDataEnv();
    data = treasury.interface.encodeFunctionData("execute", [target, value, callData]);
  }

  if (action === "pause") {
    data = treasury.interface.encodeFunctionData("pause");
  }

  if (action === "unpause") {
    data = treasury.interface.encodeFunctionData("unpause");
  }

  const owner = await treasury.owner();

  console.log("\nTreasury Safe transaction fields");
  console.log("Network:", networkName);
  console.log("Treasury owner:", owner);
  console.log("To:", treasuryAddress);
  console.log("Value wei: 0");
  console.log("Value ETH: 0.0");
  console.log("Data:", data);
  console.log("Operation: Call");
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Treasury encoding failed:", error);
    process.exitCode = 1;
  });
}

module.exports = {
  main,
};
