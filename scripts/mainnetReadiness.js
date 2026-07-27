require("dotenv").config();

const fs = require("fs");
const path = require("path");

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const MAX_BANK_FEE_BPS = 100;
const MAX_VAULT_PERFORMANCE_FEE_BPS = 2000;
const MAX_SWAP_FEE_BPS = 100;
const MAX_SWAP_PROTOCOL_FEE_SHARE_BPS = 5000;

const EXPECTED_AAVE_MAINNET = {
  weth: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  pool: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",
  aWeth: "0x4d5F47FA6A74757f35C14fD3a6Ef8E3C9BC514E8",
};

const checks = [];

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

function env(name) {
  return normalizeEnvValue(process.env[name]);
}

function isAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(value || "");
}

function sameAddress(first, second) {
  return Boolean(first && second && first.toLowerCase() === second.toLowerCase());
}

function addCheck(level, label, detail) {
  checks.push({ level, label, detail });
}

function pass(label, detail) {
  addCheck("PASS", label, detail);
}

function warn(label, detail) {
  addCheck("WARN", label, detail);
}

function fail(label, detail) {
  addCheck("FAIL", label, detail);
}

function readJson(relativePath) {
  const targetPath = path.join(process.cwd(), relativePath);
  if (!fs.existsSync(targetPath)) return null;
  return JSON.parse(fs.readFileSync(targetPath, "utf8"));
}

function artifactExists(sourceFileName, contractName) {
  return fs.existsSync(path.join(process.cwd(), "artifacts", "contracts", sourceFileName, `${contractName}.json`));
}

function checkRequiredEnv(name, label = name) {
  const value = env(name);
  if (!value) {
    fail(`${label} is set`, `${name} is empty`);
    return "";
  }

  pass(`${label} is set`, name);
  return value;
}

function checkRpcUrlEnv(name, label = name) {
  const value = env(name);
  if (!value) {
    fail(`${label} is set`, `${name} is empty`);
    return "";
  }

  if (/YOUR_|YOUR-|YOUR_API_KEY/i.test(value)) {
    fail(`${label} is not a placeholder`, `${name}=${value}`);
    return value;
  }

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      fail(`${label} uses http or https`, `${name}=${value}`);
      return value;
    }
  } catch {
    fail(`${label} is a valid URL`, `${name}=${value}`);
    return value;
  }

  pass(`${label} is configured`, name);
  return value;
}

function checkPrivateKeyEnv(name, label = name) {
  const value = env(name);
  if (!value) {
    fail(`${label} is set`, `${name} is empty`);
    return "";
  }

  if (!/^0x[a-fA-F0-9]{64}$/.test(value)) {
    fail(`${label} has private key format`, `${name} must be 0x followed by 64 hex characters`);
    return value;
  }

  pass(`${label} has private key format`, name);
  return value;
}

function checkOptionalEnv(name, label = name) {
  const value = env(name);
  if (!value) {
    warn(`${label} is set`, `${name} is empty`);
    return "";
  }

  pass(`${label} is set`, name);
  return value;
}

function checkAddressEnv(name, label = name, required = true) {
  const value = env(name);
  if (!value) {
    if (required) fail(`${label} is set`, `${name} is empty`);
    else warn(`${label} is set`, `${name} is empty`);
    return "";
  }

  if (!isAddress(value) || sameAddress(value, ZERO_ADDRESS)) {
    fail(`${label} is a non-zero address`, `${name}=${value}`);
    return value;
  }

  pass(`${label} is a non-zero address`, value);
  return value;
}

function checkAddressMatches(name, expected, label) {
  const value = env(name);
  if (!value) {
    fail(`${label} is set`, `${name} is empty`);
    return;
  }

  if (!isAddress(value)) {
    fail(`${label} is an address`, `${name}=${value}`);
    return;
  }

  if (!sameAddress(value, expected)) {
    fail(`${label} matches expected mainnet address`, `${name}=${value}, expected=${expected}`);
    return;
  }

  pass(`${label} matches expected mainnet address`, value);
}

function checkEthEnv(name, label, options = {}) {
  const { required = true, allowZero = false } = options;
  const value = env(name);
  if (!value) {
    if (required) fail(`${label} is set`, `${name} is empty`);
    else warn(`${label} is set`, `${name} is empty`);
    return;
  }

  if (!/^\d+(\.\d+)?$/.test(value)) {
    fail(`${label} is a non-negative ETH amount`, `${name}=${value}`);
    return;
  }

  if (!allowZero && Number(value) <= 0) {
    fail(`${label} is greater than zero`, `${name}=${value}`);
    return;
  }

  pass(`${label} is valid`, `${value} ETH`);
}

function checkBpsEnv(name, label, maxBps, options = {}) {
  const { required = true, fallback = "" } = options;
  const value = env(name) || fallback;
  if (!value) {
    if (required) fail(`${label} is set`, `${name} is empty`);
    else warn(`${label} is set`, `${name} is empty`);
    return;
  }

  if (!/^\d+$/.test(value)) {
    fail(`${label} is an integer bps value`, `${name}=${value}`);
    return;
  }

  const bps = Number(value);
  if (bps > maxBps) {
    fail(`${label} is within cap`, `${bps} bps > ${maxBps} bps`);
    return;
  }

  pass(`${label} is within cap`, `${bps} bps <= ${maxBps} bps`);
}

function checkDeployment(relativePath, expectedContractName, label) {
  const deployment = readJson(relativePath);
  if (!deployment) {
    warn(`${label} deployment file exists`, `${relativePath} not found`);
    return null;
  }

  if (deployment.contractName !== expectedContractName) {
    fail(`${label} deployment contract name matches`, `${deployment.contractName || "(empty)"} != ${expectedContractName}`);
  } else {
    pass(`${label} deployment contract name matches`, expectedContractName);
  }

  if (!isAddress(deployment.contractAddress) || sameAddress(deployment.contractAddress, ZERO_ADDRESS)) {
    fail(`${label} deployment has contract address`, deployment.contractAddress || "(empty)");
  } else {
    pass(`${label} deployment has contract address`, deployment.contractAddress);
  }

  return deployment;
}

function checkDeploymentAddress(deployment, key, expected, label) {
  if (!deployment) return;
  const value = deployment[key];
  if (!value) {
    warn(`${label} recorded`, `${key} missing from deployment`);
    return;
  }

  if (!sameAddress(value, expected)) {
    fail(`${label} matches expected mainnet address`, `${key}=${value}, expected=${expected}`);
    return;
  }

  pass(`${label} matches expected mainnet address`, value);
}

function printResults() {
  console.log("\nChecks");
  console.log("------");
  for (const check of checks) {
    console.log(`[${check.level}] ${check.label}: ${check.detail}`);
  }

  const failures = checks.filter((check) => check.level === "FAIL").length;
  const warnings = checks.filter((check) => check.level === "WARN").length;
  console.log("");
  console.log(`Mainnet readiness summary: ${failures} failure(s), ${warnings} warning(s), ${checks.length} checks.`);

  if (failures > 0) {
    process.exitCode = 1;
  }
}

function main() {
  console.log("\nSimpleBank mainnet readiness check");
  console.log("Network target: Ethereum mainnet");
  console.log("Expected WETH:", EXPECTED_AAVE_MAINNET.weth);
  console.log("Expected Aave V3 Pool:", EXPECTED_AAVE_MAINNET.pool);
  console.log("Expected Aave V3 aWETH:", EXPECTED_AAVE_MAINNET.aWeth);

  checkRpcUrlEnv("MAINNET_RPC_URL", "Mainnet RPC URL");
  checkPrivateKeyEnv("PRIVATE_KEY", "Deployment private key");
  checkOptionalEnv("ETHERSCAN_API_KEY", "Etherscan API key");

  const initialOwner = checkAddressEnv("INITIAL_OWNER", "Bank owner Safe");
  const initialTreasury = env("INITIAL_TREASURY") || initialOwner;
  if (!initialTreasury) {
    fail("Bank treasury is set", "INITIAL_TREASURY empty and INITIAL_OWNER unavailable");
  } else if (!isAddress(initialTreasury) || sameAddress(initialTreasury, ZERO_ADDRESS)) {
    fail("Bank treasury is a non-zero address", initialTreasury);
  } else {
    pass("Bank treasury is a non-zero address", initialTreasury);
  }

  const vaultOwner = env("VAULT_OWNER") || initialOwner;
  if (!vaultOwner) {
    fail("Vault owner Safe is set", "VAULT_OWNER empty and INITIAL_OWNER unavailable");
  } else if (!isAddress(vaultOwner) || sameAddress(vaultOwner, ZERO_ADDRESS)) {
    fail("Vault owner Safe is a non-zero address", vaultOwner);
  } else {
    pass("Vault owner Safe is a non-zero address", vaultOwner);
  }

  const vaultTreasury = env("VAULT_TREASURY") || initialTreasury;
  if (!vaultTreasury) {
    fail("Vault treasury is set", "VAULT_TREASURY empty and treasury fallback unavailable");
  } else if (!isAddress(vaultTreasury) || sameAddress(vaultTreasury, ZERO_ADDRESS)) {
    fail("Vault treasury is a non-zero address", vaultTreasury);
  } else {
    pass("Vault treasury is a non-zero address", vaultTreasury);
  }

  const swapOwner = env("SWAP_OWNER") || initialOwner;
  if (!swapOwner) {
    fail("Swap owner Safe is set", "SWAP_OWNER empty and INITIAL_OWNER unavailable");
  } else if (!isAddress(swapOwner) || sameAddress(swapOwner, ZERO_ADDRESS)) {
    fail("Swap owner Safe is a non-zero address", swapOwner);
  } else {
    pass("Swap owner Safe is a non-zero address", swapOwner);
  }

  const swapTreasury = env("SWAP_TREASURY") || initialTreasury;
  if (!swapTreasury) {
    fail("Swap treasury is set", "SWAP_TREASURY empty and treasury fallback unavailable");
  } else if (!isAddress(swapTreasury) || sameAddress(swapTreasury, ZERO_ADDRESS)) {
    fail("Swap treasury is a non-zero address", swapTreasury);
  } else {
    pass("Swap treasury is a non-zero address", swapTreasury);
  }

  const treasuryOwner = env("TREASURY_OWNER") || initialOwner;
  if (!treasuryOwner) {
    fail("Treasury owner Safe is set", "TREASURY_OWNER empty and INITIAL_OWNER unavailable");
  } else if (!isAddress(treasuryOwner) || sameAddress(treasuryOwner, ZERO_ADDRESS)) {
    fail("Treasury owner Safe is a non-zero address", treasuryOwner);
  } else {
    pass("Treasury owner Safe is a non-zero address", treasuryOwner);
  }

  checkAddressMatches("WETH_ADDRESS", EXPECTED_AAVE_MAINNET.weth, "WETH address");
  const swapToken0 = env("SWAP_TOKEN0_ADDRESS") || env("WETH_ADDRESS");
  if (!swapToken0) {
    fail("Swap token0 WETH address is set", "SWAP_TOKEN0_ADDRESS empty and WETH_ADDRESS unavailable");
  } else if (!sameAddress(swapToken0, EXPECTED_AAVE_MAINNET.weth)) {
    fail("Swap token0 WETH address matches expected mainnet address", `token0=${swapToken0}, expected=${EXPECTED_AAVE_MAINNET.weth}`);
  } else {
    pass("Swap token0 WETH address matches expected mainnet address", swapToken0);
  }
  checkAddressEnv("SWAP_TOKEN1_ADDRESS", "Swap token1", true);
  checkAddressMatches("AAVE_POOL_ADDRESS", EXPECTED_AAVE_MAINNET.pool, "Aave V3 Pool address");
  checkAddressMatches("AAVE_AWETH_ADDRESS", EXPECTED_AAVE_MAINNET.aWeth, "Aave V3 aWETH address");

  checkEthEnv("INITIAL_MAX_TOTAL_DEPOSITS_ETH", "Bank TVL cap");
  checkEthEnv("VAULT_MAX_TOTAL_ASSETS_ETH", "Vault TVL cap");
  checkEthEnv("STRATEGY_MAX_ASSETS_ETH", "Initial strategy cap");
  checkEthEnv("LENDING_MAX_POOL_LIQUIDITY_ETH", "Lending pool liquidity cap");
  checkBpsEnv("INITIAL_INTEREST_RATE", "Bank interest rate", 10000, { fallback: "100" });
  checkBpsEnv("VAULT_PERFORMANCE_FEE_BPS", "Vault performance fee", MAX_VAULT_PERFORMANCE_FEE_BPS, {
    fallback: "1000",
  });
  checkBpsEnv("LENDING_BORROW_APR_BPS", "Lending borrow APR", 5000, { fallback: "800" });
  checkBpsEnv("LENDING_ORIGINATION_FEE_BPS", "Lending origination fee", 100, { fallback: "10" });
  checkBpsEnv("LENDING_MAX_LTV_BPS", "Lending max LTV", 8000, { fallback: "6000" });
  checkBpsEnv("LENDING_LIQUIDATION_THRESHOLD_BPS", "Lending liquidation threshold", 9000, { fallback: "8000" });
  checkBpsEnv("LENDING_LIQUIDATION_BONUS_BPS", "Lending liquidation bonus", 2000, { fallback: "500" });
  checkBpsEnv("SWAP_FEE_BPS", "Swap fee", MAX_SWAP_FEE_BPS, { fallback: "30" });
  checkBpsEnv("SWAP_PROTOCOL_FEE_SHARE_BPS", "Swap protocol fee share", MAX_SWAP_PROTOCOL_FEE_SHARE_BPS, {
    fallback: "2000",
  });
  checkBpsEnv("INITIAL_DEPOSIT_FEE_BPS", "Initial deposit fee", MAX_BANK_FEE_BPS, {
    required: false,
    fallback: "0",
  });
  checkBpsEnv("INITIAL_WITHDRAWAL_FEE_BPS", "Initial withdrawal fee", MAX_BANK_FEE_BPS, {
    required: false,
    fallback: "0",
  });

  if (artifactExists("SimpleBankV3.sol", "SimpleBankV3")) {
    pass("SimpleBankV3 artifact exists", "artifacts/contracts/SimpleBankV3.sol/SimpleBankV3.json");
  } else {
    fail("SimpleBankV3 artifact exists", "run npm.cmd run compile");
  }

  if (artifactExists("SimpleWETHYieldVaultV2.sol", "SimpleWETHYieldVaultV2")) {
    pass("SimpleWETHYieldVaultV2 artifact exists", "artifacts/contracts/SimpleWETHYieldVaultV2.sol/SimpleWETHYieldVaultV2.json");
  } else {
    fail("SimpleWETHYieldVaultV2 artifact exists", "run npm.cmd run compile");
  }

  if (artifactExists(path.join("strategies", "SimpleStrategyManager.sol"), "SimpleStrategyManager")) {
    pass("SimpleStrategyManager artifact exists", "artifacts/contracts/strategies/SimpleStrategyManager.sol/SimpleStrategyManager.json");
  } else {
    fail("SimpleStrategyManager artifact exists", "run npm.cmd run compile");
  }

  if (artifactExists(path.join("strategies", "AaveV3WETHStrategy.sol"), "AaveV3WETHStrategy")) {
    pass("AaveV3WETHStrategy artifact exists", "artifacts/contracts/strategies/AaveV3WETHStrategy.sol/AaveV3WETHStrategy.json");
  } else {
    fail("AaveV3WETHStrategy artifact exists", "run npm.cmd run compile");
  }

  if (artifactExists("SimpleLendingPool.sol", "SimpleLendingPool")) {
    pass("SimpleLendingPool artifact exists", "artifacts/contracts/SimpleLendingPool.sol/SimpleLendingPool.json");
  } else {
    fail("SimpleLendingPool artifact exists", "run npm.cmd run compile");
  }

  if (artifactExists("SimpleSwapPool.sol", "SimpleSwapPool")) {
    pass("SimpleSwapPool artifact exists", "artifacts/contracts/SimpleSwapPool.sol/SimpleSwapPool.json");
  } else {
    fail("SimpleSwapPool artifact exists", "run npm.cmd run compile");
  }

  if (artifactExists("SimpleTreasury.sol", "SimpleTreasury")) {
    pass("SimpleTreasury artifact exists", "artifacts/contracts/SimpleTreasury.sol/SimpleTreasury.json");
  } else {
    fail("SimpleTreasury artifact exists", "run npm.cmd run compile");
  }

  const bankDeployment = checkDeployment(path.join("deployments", "mainnet.json"), "SimpleBankV3", "Bank");
  const vaultDeployment = checkDeployment(
    path.join("deployments", "strategy-vault-mainnet.json"),
    "SimpleWETHYieldVaultV2",
    "Strategy vault"
  );
  const managerDeployment = checkDeployment(
    path.join("deployments", "strategy-manager-mainnet.json"),
    "SimpleStrategyManager",
    "Strategy manager"
  );
  const lendingDeployment = checkDeployment(
    path.join("deployments", "lending-pool-mainnet.json"),
    "SimpleLendingPool",
    "Lending pool"
  );
  const swapDeployment = checkDeployment(
    path.join("deployments", "swap-pool-mainnet.json"),
    "SimpleSwapPool",
    "Swap pool"
  );
  const treasuryDeployment = checkDeployment(
    path.join("deployments", "treasury-mainnet.json"),
    "SimpleTreasury",
    "Treasury"
  );

  if (bankDeployment && initialOwner) {
    if (sameAddress(bankDeployment.owner, initialOwner)) {
      pass("Bank deployment owner matches INITIAL_OWNER", bankDeployment.owner);
    } else {
      fail("Bank deployment owner matches INITIAL_OWNER", `${bankDeployment.owner || "(empty)"} != ${initialOwner}`);
    }
  }

  if (lendingDeployment) {
    const expectedLendingOwner = env("LENDING_OWNER") || initialOwner;
    const expectedLendingTreasury = env("LENDING_TREASURY") || initialTreasury;
    if (expectedLendingOwner && sameAddress(lendingDeployment.owner, expectedLendingOwner)) {
      pass("Lending deployment owner matches expected owner", lendingDeployment.owner);
    } else if (expectedLendingOwner) {
      fail(
        "Lending deployment owner matches expected owner",
        `${lendingDeployment.owner || "(empty)"} != ${expectedLendingOwner}`
      );
    }

    if (expectedLendingTreasury && sameAddress(lendingDeployment.treasury, expectedLendingTreasury)) {
      pass("Lending deployment treasury matches expected treasury", lendingDeployment.treasury);
    } else if (expectedLendingTreasury) {
      fail(
        "Lending deployment treasury matches expected treasury",
        `${lendingDeployment.treasury || "(empty)"} != ${expectedLendingTreasury}`
      );
    }
  }

  if (swapDeployment) {
    const expectedSwapOwner = env("SWAP_OWNER") || initialOwner;
    const expectedSwapTreasury = env("SWAP_TREASURY") || initialTreasury;
    if (expectedSwapOwner && sameAddress(swapDeployment.owner, expectedSwapOwner)) {
      pass("Swap deployment owner matches expected owner", swapDeployment.owner);
    } else if (expectedSwapOwner) {
      fail("Swap deployment owner matches expected owner", `${swapDeployment.owner || "(empty)"} != ${expectedSwapOwner}`);
    }

    if (expectedSwapTreasury && sameAddress(swapDeployment.treasury, expectedSwapTreasury)) {
      pass("Swap deployment treasury matches expected treasury", swapDeployment.treasury);
    } else if (expectedSwapTreasury) {
      fail(
        "Swap deployment treasury matches expected treasury",
        `${swapDeployment.treasury || "(empty)"} != ${expectedSwapTreasury}`
      );
    }
  }

  if (treasuryDeployment) {
    const expectedTreasuryOwner = env("TREASURY_OWNER") || initialOwner;
    if (expectedTreasuryOwner && sameAddress(treasuryDeployment.owner, expectedTreasuryOwner)) {
      pass("Treasury deployment owner matches expected owner", treasuryDeployment.owner);
    } else if (expectedTreasuryOwner) {
      fail(
        "Treasury deployment owner matches expected owner",
        `${treasuryDeployment.owner || "(empty)"} != ${expectedTreasuryOwner}`
      );
    }
  }

  checkDeploymentAddress(vaultDeployment, "weth", EXPECTED_AAVE_MAINNET.weth, "Vault WETH");
  checkDeploymentAddress(vaultDeployment, "aavePool", EXPECTED_AAVE_MAINNET.pool, "Vault Aave Pool");
  checkDeploymentAddress(vaultDeployment, "aaveAToken", EXPECTED_AAVE_MAINNET.aWeth, "Vault aWETH");
  checkDeploymentAddress(managerDeployment, "weth", EXPECTED_AAVE_MAINNET.weth, "Manager WETH");
  checkDeploymentAddress(managerDeployment, "aavePool", EXPECTED_AAVE_MAINNET.pool, "Manager Aave Pool");
  checkDeploymentAddress(managerDeployment, "aaveAToken", EXPECTED_AAVE_MAINNET.aWeth, "Manager aWETH");
  checkDeploymentAddress(swapDeployment, "token0", EXPECTED_AAVE_MAINNET.weth, "Swap token0 WETH");

  if (env("PREFLIGHT_ONLY").toLowerCase() === "false") {
    warn("Deployment safety switch reviewed", "PREFLIGHT_ONLY=false will send transactions in deploy scripts");
  } else {
    pass("Deployment safety switch reviewed", "PREFLIGHT_ONLY is not false");
  }

  printResults();
}

main();
