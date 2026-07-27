const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const ACTIONS = new Set([
  "halt",
  "resume",
  "freeze-caps",
  "unwind",
  "full-drill",
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
  const action = normalizeEnvValue(process.env.ACTION || "full-drill");
  if (!ACTIONS.has(action)) {
    throw new Error(`ACTION must be one of ${Array.from(ACTIONS).join(", ")}, got: ${action}`);
  }

  return action;
}

function readDeployment(fileName) {
  const deploymentPath = path.join(process.cwd(), "deployments", fileName);
  if (!fs.existsSync(deploymentPath)) {
    throw new Error(`${deploymentPath} does not exist`);
  }

  return JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
}

function sameAddress(first, second) {
  return Boolean(first && second && first.toLowerCase() === second.toLowerCase());
}

async function loadBank(networkName) {
  const deployment = readDeployment(`${networkName}.json`);
  const contractName = deployment.contractName || "SimpleBankV2";
  const address = normalizeEnvValue(process.env.CONTRACT_ADDRESS) || deployment.contractAddress;

  if (!hre.ethers.isAddress(address)) {
    throw new Error(`Invalid bank address: ${address}`);
  }

  const contract = await hre.ethers.getContractAt(contractName, address);
  return { deployment, contract, contractName, address };
}

async function loadVault(networkName) {
  const deployment = readDeployment(`strategy-vault-${networkName}.json`);
  const contractName = deployment.contractName || "SimpleWETHYieldVaultV2";
  const address = normalizeEnvValue(process.env.VAULT_ADDRESS) || deployment.contractAddress;

  if (!hre.ethers.isAddress(address)) {
    throw new Error(`Invalid vault address: ${address}`);
  }

  const contract = await hre.ethers.getContractAt(contractName, address);
  return { deployment, contract, contractName, address };
}

async function loadManager(networkName) {
  const deploymentPath = path.join(process.cwd(), "deployments", `strategy-manager-${networkName}.json`);
  if (!fs.existsSync(deploymentPath)) return null;

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const address = normalizeEnvValue(process.env.MANAGER_ADDRESS) || deployment.contractAddress;
  if (!hre.ethers.isAddress(address)) return null;

  const contract = await hre.ethers.getContractAt("SimpleStrategyManager", address);
  return { deployment, contract, contractName: "SimpleStrategyManager", address };
}

async function addTx(txs, label, target, methodName, args = [], value = 0n, note = "") {
  txs.push({
    label,
    to: target.address,
    value,
    data: target.contract.interface.encodeFunctionData(methodName, args),
    note,
  });
}

async function addBankFreezeTx(txs, bank) {
  const totalDeposits = await bank.contract.totalDeposits();
  await addTx(
    txs,
    "Freeze SimpleBank total deposit cap at current TVL",
    bank,
    "setMaxTotalDeposits",
    [totalDeposits],
    0n,
    `Current totalDeposits is ${hre.ethers.formatEther(totalDeposits)} ETH.`
  );
}

async function addVaultFreezeTx(txs, vault) {
  const totalAssets = await vault.contract.totalAssets();
  const freezeCap = totalAssets === 0n ? 1n : totalAssets;
  const note = totalAssets === 0n
    ? "Vault totalAssets is 0. The vault treats cap 0 as uncapped, so this uses 1 wei as an effectively closed cap."
    : `Current totalAssets is ${hre.ethers.formatEther(totalAssets)} WETH.`;

  await addTx(
    txs,
    "Freeze vault total asset cap",
    vault,
    "setMaxTotalAssets",
    [freezeCap],
    0n,
    note
  );
}

async function buildTransactions(action, bank, vault, manager) {
  const txs = [];

  if (action === "halt") {
    await addTx(txs, "Pause SimpleBank", bank, "pause");
    await addTx(txs, "Pause vault", vault, "pause");
  }

  if (action === "resume") {
    await addTx(txs, "Unpause vault", vault, "unpause");
    await addTx(txs, "Unpause SimpleBank", bank, "unpause");
  }

  if (action === "freeze-caps") {
    await addBankFreezeTx(txs, bank);
    await addVaultFreezeTx(txs, vault);
  }

  if (action === "unwind") {
    const paused = await vault.contract.paused();
    if (paused) {
      await addTx(
        txs,
        "Unpause vault before divest",
        vault,
        "unpause",
        [],
        0n,
        "Vault divestAll is blocked while paused."
      );
    }
    await addTx(
      txs,
      "Divest all vault strategy assets back to vault idle WETH",
      vault,
      "divestAll",
      [],
      0n,
      manager ? `Vault strategy should be manager ${manager.address}.` : ""
    );
  }

  if (action === "full-drill") {
    await addBankFreezeTx(txs, bank);
    await addVaultFreezeTx(txs, vault);

    const paused = await vault.contract.paused();
    if (paused) {
      await addTx(
        txs,
        "Unpause vault before divest",
        vault,
        "unpause",
        [],
        0n,
        "Vault divestAll is blocked while paused."
      );
    }

    await addTx(
      txs,
      "Divest all vault strategy assets back to vault idle WETH",
      vault,
      "divestAll",
      [],
      0n,
      manager ? `Vault strategy should be manager ${manager.address}.` : ""
    );
    await addTx(txs, "Pause SimpleBank", bank, "pause");
    await addTx(txs, "Pause vault", vault, "pause");
  }

  return txs;
}

async function printLiveContext(bank, vault, manager) {
  const [
    bankOwner,
    bankPaused,
    bankTotalDeposits,
    vaultOwner,
    vaultPaused,
    vaultTotalAssets,
    vaultStrategy,
  ] = await Promise.all([
    bank.contract.owner(),
    bank.contract.paused(),
    bank.contract.totalDeposits(),
    vault.contract.owner(),
    vault.contract.paused(),
    vault.contract.totalAssets(),
    vault.contract.strategy ? vault.contract.strategy() : hre.ethers.ZeroAddress,
  ]);

  console.log("Bank:", bank.address);
  console.log("  Owner:", bankOwner);
  console.log("  Paused:", bankPaused ? "yes" : "no");
  console.log("  Total deposits:", `${hre.ethers.formatEther(bankTotalDeposits)} ETH`);
  console.log("Vault:", vault.address);
  console.log("  Owner:", vaultOwner);
  console.log("  Paused:", vaultPaused ? "yes" : "no");
  console.log("  Total assets:", `${hre.ethers.formatEther(vaultTotalAssets)} WETH`);
  console.log("  Strategy:", vaultStrategy);

  if (manager) {
    const [managerOwner, managerVault, managerTotalAssets, managerDefaultStrategy] = await Promise.all([
      manager.contract.owner(),
      manager.contract.vault(),
      manager.contract.totalAssets(),
      manager.contract.defaultStrategy(),
    ]);
    console.log("Manager:", manager.address);
    console.log("  Owner:", managerOwner);
    console.log("  Vault:", managerVault);
    console.log("  Total assets:", `${hre.ethers.formatEther(managerTotalAssets)} WETH`);
    console.log("  Default strategy:", managerDefaultStrategy);

    if (!sameAddress(vaultStrategy, manager.address)) {
      console.log("  Note: vault strategy is not this manager.");
    }
  }
}

function printTxs(txs) {
  txs.forEach((tx, index) => {
    console.log("");
    console.log(`Step ${index + 1}: ${tx.label}`);
    if (tx.note) console.log("Note:", tx.note);
    console.log("To:", tx.to);
    console.log("Value wei:", tx.value.toString());
    console.log("Value ETH:", hre.ethers.formatEther(tx.value));
    console.log("Data:", tx.data);
    console.log("Operation: Call");
  });
}

async function main() {
  const action = parseAction();
  const networkName = hre.network.name;
  const bank = await loadBank(networkName);
  const vault = await loadVault(networkName);
  const manager = await loadManager(networkName);

  console.log("\nSimpleBank emergency Safe transaction encoder");
  console.log("Network:", networkName);
  console.log("Action:", action);
  console.log("");
  await printLiveContext(bank, vault, manager);

  const txs = await buildTransactions(action, bank, vault, manager);

  console.log("");
  console.log("Safe transaction sequence");
  console.log("-------------------------");
  printTxs(txs);

  console.log("");
  console.log("After execution, run:");
  console.log(`npm.cmd run suite:health:${networkName}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Emergency calldata encoding failed:", error);
    process.exitCode = 1;
  });
}

module.exports = {
  main,
};
