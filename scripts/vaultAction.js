const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const ACTIONS = new Set([
  "status",
  "deposit-eth",
  "redeem-eth",
  "donate-yield-eth",
  "harvest",
  "invest",
  "divest",
  "divest-all",
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

function parseEthAmountEnv(name) {
  const rawAmount = normalizeEnvValue(process.env[name]);
  if (!/^\d+(\.\d+)?$/.test(rawAmount)) {
    throw new Error(`${name} must be a non-negative ETH amount, got: ${process.env[name]}`);
  }

  return hre.ethers.parseEther(rawAmount);
}

function parseTokenAmountEnv(name, decimals) {
  const rawAmount = normalizeEnvValue(process.env[name]);
  if (!/^\d+(\.\d+)?$/.test(rawAmount)) {
    throw new Error(`${name} must be a non-negative token amount, got: ${process.env[name]}`);
  }

  return hre.ethers.parseUnits(rawAmount, decimals);
}

function isTruthyEnv(name) {
  const value = normalizeEnvValue(process.env[name]).toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function getVaultDeploymentPath(networkName) {
  const customPath = normalizeEnvValue(process.env.VAULT_DEPLOYMENT_FILE);
  if (customPath) {
    return path.isAbsolute(customPath) ? customPath : path.join(process.cwd(), customPath);
  }

  const deploymentName = normalizeEnvValue(process.env.VAULT_DEPLOYMENT_NAME || "weth-vault");
  return path.join(process.cwd(), "deployments", `${deploymentName}-${networkName}.json`);
}

function readVaultDeployment(networkName) {
  const deploymentPath = getVaultDeploymentPath(networkName);
  if (!fs.existsSync(deploymentPath)) {
    throw new Error(`${deploymentPath} does not exist. Deploy the vault or set VAULT_ADDRESS.`);
  }

  return JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
}

function resolveVaultAddress(networkName) {
  const configuredAddress = normalizeEnvValue(process.env.VAULT_ADDRESS);
  if (configuredAddress) {
    if (!hre.ethers.isAddress(configuredAddress)) {
      throw new Error(`Invalid VAULT_ADDRESS: ${configuredAddress}`);
    }

    return configuredAddress;
  }

  const deployment = readVaultDeployment(networkName);
  if (!hre.ethers.isAddress(deployment.contractAddress)) {
    throw new Error(`Invalid contractAddress in ${getVaultDeploymentPath(networkName)}`);
  }

  return deployment.contractAddress;
}

function resolveVaultContractName(networkName) {
  const configuredName = normalizeEnvValue(process.env.VAULT_CONTRACT_NAME);
  if (configuredName) return configuredName;

  const deploymentPath = getVaultDeploymentPath(networkName);
  if (!fs.existsSync(deploymentPath)) return "SimpleWETHYieldVault";

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  return deployment.contractName || "SimpleWETHYieldVault";
}

function resolveReceiver(defaultReceiver) {
  const receiver = normalizeEnvValue(process.env.RECEIVER || defaultReceiver);
  if (!hre.ethers.isAddress(receiver) || receiver === hre.ethers.ZeroAddress) {
    throw new Error(`Invalid RECEIVER: ${receiver}`);
  }

  return receiver;
}

function resolveShareOwner(defaultOwner) {
  const owner = normalizeEnvValue(process.env.SHARE_OWNER || defaultOwner);
  if (!hre.ethers.isAddress(owner) || owner === hre.ethers.ZeroAddress) {
    throw new Error(`Invalid SHARE_OWNER: ${owner}`);
  }

  return owner;
}

function resolveViewAddress(defaultAddress = hre.ethers.ZeroAddress) {
  const viewAddress = normalizeEnvValue(process.env.VIEW_ADDRESS || defaultAddress);
  if (!hre.ethers.isAddress(viewAddress)) {
    throw new Error(`Invalid VIEW_ADDRESS: ${viewAddress}`);
  }

  return viewAddress;
}

async function printStatus(vault, vaultAddress, viewAddress) {
  const [
    asset,
    owner,
    treasury,
    totalAssets,
    totalSupply,
    accountedAssets,
    performanceFeeBps,
    maxTotalAssets,
    vaultDecimals,
    paused,
    treasuryShares,
    contractEthBalance,
  ] = await Promise.all([
    vault.asset(),
    vault.owner(),
    vault.treasury(),
    vault.totalAssets(),
    vault.totalSupply(),
    vault.accountedAssets(),
    vault.performanceFeeBps(),
    vault.maxTotalAssets(),
    vault.decimals(),
    vault.paused(),
    vault.balanceOf(await vault.treasury()),
    hre.ethers.provider.getBalance(vaultAddress),
  ]);

  const viewShares = viewAddress === hre.ethers.ZeroAddress ? 0n : await vault.balanceOf(viewAddress);
  const viewAssets = viewShares === 0n ? 0n : await vault.convertToAssets(viewShares);
  const treasuryAssets = treasuryShares === 0n ? 0n : await vault.convertToAssets(treasuryShares);
  let strategyAddress = hre.ethers.ZeroAddress;
  let idleAssetBalance = null;
  let strategyAssetBalance = null;

  if (typeof vault.strategy === "function") {
    [strategyAddress, idleAssetBalance, strategyAssetBalance] = await Promise.all([
      vault.strategy(),
      vault.idleAssets(),
      vault.strategyAssets(),
    ]);
  }

  console.log("\nSimpleWETHYieldVault status");
  console.log("Network:", hre.network.name);
  console.log("Vault:", vaultAddress);
  console.log("WETH asset:", asset);
  console.log("View address:", viewAddress);
  console.log("Owner:", owner);
  console.log("Treasury:", treasury);
  console.log("Total assets:", `${hre.ethers.formatEther(totalAssets)} WETH`);
  console.log("Total supply:", `${hre.ethers.formatUnits(totalSupply, vaultDecimals)} sbWETH`);
  console.log("Accounted assets:", `${hre.ethers.formatEther(accountedAssets)} WETH`);
  console.log("Performance fee:", `${performanceFeeBps.toString()} bps`);
  console.log("Max total assets:", `${hre.ethers.formatEther(maxTotalAssets)} WETH`);
  console.log("Paused:", paused ? "yes" : "no");
  console.log("View shares:", `${hre.ethers.formatUnits(viewShares, vaultDecimals)} sbWETH`);
  console.log("View assets:", `${hre.ethers.formatEther(viewAssets)} WETH`);
  console.log("Treasury shares:", `${hre.ethers.formatUnits(treasuryShares, vaultDecimals)} sbWETH`);
  console.log("Treasury assets:", `${hre.ethers.formatEther(treasuryAssets)} WETH`);
  if (idleAssetBalance !== null) {
    console.log("Strategy:", strategyAddress);
    console.log("Idle assets:", `${hre.ethers.formatEther(idleAssetBalance)} WETH`);
    console.log("Strategy assets:", `${hre.ethers.formatEther(strategyAssetBalance)} WETH`);
  }
  console.log("Raw ETH held by vault:", `${hre.ethers.formatEther(contractEthBalance)} ETH`);
}

async function requireOwner(vault, signer) {
  const owner = await vault.owner();
  if (owner.toLowerCase() !== signer.address.toLowerCase()) {
    throw new Error(`Signer ${signer.address} is not vault owner ${owner}`);
  }
}

function requireStrategyVault(vault) {
  if (
    typeof vault.invest !== "function" ||
    typeof vault.divest !== "function" ||
    typeof vault.divestAll !== "function"
  ) {
    throw new Error("Strategy actions require SimpleWETHYieldVaultV2");
  }
}

async function main() {
  const action = parseAction();
  const networkName = hre.network.name;
  const vaultAddress = resolveVaultAddress(networkName);
  const vaultContractName = resolveVaultContractName(networkName);
  const signers = await hre.ethers.getSigners();
  const signer = signers[0] || null;
  const runner = signer || hre.ethers.provider;

  const vault = await hre.ethers.getContractAt(vaultContractName, vaultAddress, runner);

  if (action === "status") {
    await printStatus(vault, vaultAddress, resolveViewAddress(signer ? signer.address : undefined));
    return;
  }

  if (!signer) {
    throw new Error("No signer available. Check PRIVATE_KEY and network config.");
  }

  if (action === "deposit-eth") {
    const amount = parseEthAmountEnv("DEPOSIT_AMOUNT_ETH");
    const receiver = resolveReceiver(signer.address);
    console.log(`Depositing ${hre.ethers.formatEther(amount)} ETH into vault for ${receiver}...`);
    const tx = await vault.depositETH(receiver, { value: amount });
    await tx.wait();
    console.log("Deposit complete.");
    console.log("Tx:", tx.hash);
    return;
  }

  if (action === "redeem-eth") {
    const shareOwner = resolveShareOwner(signer.address);
    const receiver = resolveReceiver(signer.address);
    const vaultDecimals = Number(await vault.decimals());
    const shouldRedeemAll = isTruthyEnv("REDEEM_ALL") || normalizeEnvValue(process.env.REDEEM_SHARES).toLowerCase() === "all";
    const shares = shouldRedeemAll
      ? await vault.balanceOf(shareOwner)
      : parseTokenAmountEnv("REDEEM_SHARES", vaultDecimals);
    const shareBalance = await vault.balanceOf(shareOwner);

    if (shares === 0n) {
      throw new Error(`No vault shares to redeem for ${shareOwner}`);
    }
    if (shares > shareBalance) {
      throw new Error(
        `Redeem shares ${hre.ethers.formatUnits(shares, vaultDecimals)} exceeds ${shareOwner} balance ${hre.ethers.formatUnits(shareBalance, vaultDecimals)}`
      );
    }

    console.log(
      `Redeeming ${hre.ethers.formatUnits(shares, vaultDecimals)} vault shares from ${shareOwner} back to ETH for ${receiver}...`
    );
    const tx = await vault.redeemETH(shares, receiver, shareOwner);
    await tx.wait();
    console.log("Redeem complete.");
    console.log("Tx:", tx.hash);
    return;
  }

  if (action === "donate-yield-eth") {
    const amount = parseEthAmountEnv("YIELD_AMOUNT_ETH");
    console.log(`Donating ${hre.ethers.formatEther(amount)} ETH as vault yield...`);
    const tx = await vault.donateYieldETH({ value: amount });
    await tx.wait();
    console.log("Yield donation complete.");
    console.log("Tx:", tx.hash);
    return;
  }

  if (action === "harvest") {
    console.log("Harvesting performance fee...");
    const tx = await vault.harvestPerformanceFee();
    await tx.wait();
    console.log("Harvest complete.");
    console.log("Tx:", tx.hash);
    return;
  }

  if (action === "invest") {
    requireStrategyVault(vault);
    await requireOwner(vault, signer);

    const amount = parseEthAmountEnv("INVEST_AMOUNT_ETH");
    console.log(`Investing ${hre.ethers.formatEther(amount)} WETH from vault idle assets into strategy...`);
    const tx = await vault.invest(amount);
    await tx.wait();
    console.log("Invest complete.");
    console.log("Tx:", tx.hash);
    return;
  }

  if (action === "divest") {
    requireStrategyVault(vault);
    await requireOwner(vault, signer);

    const amount = parseEthAmountEnv("DIVEST_AMOUNT_ETH");
    console.log(`Divesting ${hre.ethers.formatEther(amount)} WETH from strategy back to vault idle assets...`);
    const tx = await vault.divest(amount);
    await tx.wait();
    console.log("Divest complete.");
    console.log("Tx:", tx.hash);
    return;
  }

  if (action === "divest-all") {
    requireStrategyVault(vault);
    await requireOwner(vault, signer);

    console.log("Divesting all strategy assets back to vault idle assets...");
    const tx = await vault.divestAll();
    await tx.wait();
    console.log("Divest all complete.");
    console.log("Tx:", tx.hash);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Vault action failed:", error);
    process.exitCode = 1;
  });
}

module.exports = {
  main,
};
