require("dotenv").config();

const fs = require("fs");
const path = require("path");

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const EXPECTED_MAINNET = {
  weth: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  aavePool: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",
  aaveAWeth: "0x4d5F47FA6A74757f35C14fD3a6Ef8E3C9BC514E8",
};

const REQUIRED_SCRIPTS = [
  "compile",
  "test",
  "test:smoke",
  "coverage",
  "audit:deps",
  "audit:tooling",
  "security:slither",
  "security:slither:full",
  "mainnet:readiness",
  "suite:health:mainnet",
  "suite:revenue:mainnet",
  "emergency:encode:mainnet",
  "verify:mainnet",
];

const REQUIRED_ARTIFACTS = [
  "artifacts/contracts/SimpleBankV3.sol/SimpleBankV3.json",
  "artifacts/contracts/SimpleWETHYieldVaultV2.sol/SimpleWETHYieldVaultV2.json",
  "artifacts/contracts/strategies/SimpleStrategyManager.sol/SimpleStrategyManager.json",
  "artifacts/contracts/strategies/AaveV3WETHStrategy.sol/AaveV3WETHStrategy.json",
  "artifacts/contracts/SimpleLendingPool.sol/SimpleLendingPool.json",
  "artifacts/contracts/SimpleSwapPool.sol/SimpleSwapPool.json",
  "artifacts/contracts/SimpleTreasury.sol/SimpleTreasury.json",
];

const REQUIRED_DOCS = [
  "docs/PRODUCTION_READINESS.md",
  "docs/MAINNET_DEPLOYMENT_RUNBOOK.md",
  "docs/INCIDENT_RESPONSE.md",
  "docs/STATIC_ANALYSIS.md",
  "docs/DEPENDENCY_AUDIT.md",
];

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
  return /^0x[a-fA-F0-9]{40}$/.test(value || "") && value.toLowerCase() !== ZERO_ADDRESS;
}

function sameAddress(first, second) {
  return Boolean(first && second && first.toLowerCase() === second.toLowerCase());
}

function isTruthy(name) {
  return ["1", "true", "yes"].includes(env(name).toLowerCase());
}

function exists(relativePath) {
  return fs.existsSync(path.join(process.cwd(), relativePath));
}

function add(level, label, detail) {
  checks.push({ level, label, detail });
}

function pass(label, detail = "") {
  add("PASS", label, detail);
}

function warn(label, detail = "") {
  add("WARN", label, detail);
}

function fail(label, detail = "") {
  add("FAIL", label, detail);
}

function checkRequiredEnv(name, label = name) {
  const value = env(name);
  if (!value) {
    fail(`${label} is set`, `${name} is empty`);
    return "";
  }

  if (/YOUR_|YOUR-|PLACEHOLDER|0xYOUR/i.test(value)) {
    fail(`${label} is not a placeholder`, `${name}=${value}`);
    return value;
  }

  pass(`${label} is set`, name);
  return value;
}

function checkAddressEnv(name, label = name) {
  const value = checkRequiredEnv(name, label);
  if (!value) return "";

  if (!isAddress(value)) {
    fail(`${label} is a non-zero address`, `${name}=${value}`);
    return value;
  }

  pass(`${label} is a non-zero address`, value);
  return value;
}

function checkAddressMatch(name, expected, label) {
  const value = checkAddressEnv(name, label);
  if (!value) return;

  if (!sameAddress(value, expected)) {
    fail(`${label} matches Ethereum mainnet`, `${value} != ${expected}`);
    return;
  }

  pass(`${label} matches Ethereum mainnet`, value);
}

function checkEthCap(name, label) {
  const value = checkRequiredEnv(name, label);
  if (!value) return;

  if (!/^\d+(\.\d+)?$/.test(value) || Number(value) <= 0) {
    fail(`${label} is a positive ETH amount`, `${name}=${value}`);
    return;
  }

  pass(`${label} is a positive ETH amount`, `${value} ETH`);
}

function checkBooleanGate(name, label) {
  if (isTruthy(name)) {
    pass(label, `${name}=true`);
    return;
  }

  fail(label, `${name} must be true before public mainnet launch`);
}

function checkPathEnv(name, label) {
  const value = checkRequiredEnv(name, label);
  if (!value) return;

  const target = path.isAbsolute(value) ? value : path.join(process.cwd(), value);
  if (!fs.existsSync(target)) {
    fail(`${label} file exists`, target);
    return;
  }

  pass(`${label} file exists`, target);
}

function checkPackageScripts() {
  const packagePath = path.join(process.cwd(), "package.json");
  if (!fs.existsSync(packagePath)) {
    fail("package.json exists");
    return;
  }

  const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  for (const scriptName of REQUIRED_SCRIPTS) {
    if (pkg.scripts && pkg.scripts[scriptName]) pass(`npm script exists: ${scriptName}`, pkg.scripts[scriptName]);
    else fail(`npm script exists: ${scriptName}`);
  }
}

function checkLocalArtifacts() {
  for (const artifactPath of REQUIRED_ARTIFACTS) {
    if (exists(artifactPath)) pass("Contract artifact exists", artifactPath);
    else fail("Contract artifact exists", `${artifactPath} missing; run npm.cmd run compile`);
  }
}

function checkDocs() {
  for (const docPath of REQUIRED_DOCS) {
    if (exists(docPath)) pass("Production document exists", docPath);
    else fail("Production document exists", docPath);
  }
}

function checkDeploymentFiles() {
  const mainnetFiles = [
    "deployments/mainnet.json",
    "deployments/treasury-mainnet.json",
    "deployments/strategy-vault-mainnet.json",
    "deployments/strategy-manager-mainnet.json",
    "deployments/lending-pool-mainnet.json",
    "deployments/swap-pool-mainnet.json",
  ];

  const hasAnyMainnetDeployment = mainnetFiles.some((fileName) => exists(fileName));
  if (!hasAnyMainnetDeployment) {
    warn("Mainnet deployment files exist", "not deployed yet; expected before final launch");
    return;
  }

  for (const fileName of mainnetFiles) {
    if (exists(fileName)) pass("Mainnet deployment file exists", fileName);
    else fail("Mainnet deployment file exists", fileName);
  }
}

function checkEnv() {
  checkRequiredEnv("MAINNET_RPC_URL", "Mainnet RPC URL");
  checkRequiredEnv("PRIVATE_KEY", "Deployment private key");
  checkRequiredEnv("ETHERSCAN_API_KEY", "Etherscan API key");

  checkAddressEnv("INITIAL_OWNER", "Bank owner Safe");
  checkAddressEnv("TREASURY_OWNER", "Treasury owner Safe");
  checkAddressEnv("INITIAL_TREASURY", "Initial treasury");
  checkAddressEnv("VAULT_OWNER", "Vault owner Safe");
  checkAddressEnv("VAULT_TREASURY", "Vault treasury");
  checkAddressEnv("LENDING_OWNER", "Lending owner Safe");
  checkAddressEnv("LENDING_TREASURY", "Lending treasury");
  checkAddressEnv("SWAP_OWNER", "Swap owner Safe");
  checkAddressEnv("SWAP_TREASURY", "Swap treasury");

  checkAddressMatch("WETH_ADDRESS", EXPECTED_MAINNET.weth, "WETH address");
  checkAddressMatch("AAVE_POOL_ADDRESS", EXPECTED_MAINNET.aavePool, "Aave V3 Pool address");
  checkAddressMatch("AAVE_AWETH_ADDRESS", EXPECTED_MAINNET.aaveAWeth, "Aave V3 aWETH address");
  checkAddressMatch("SWAP_TOKEN0_ADDRESS", EXPECTED_MAINNET.weth, "Swap token0 WETH address");
  checkAddressEnv("SWAP_TOKEN1_ADDRESS", "Swap token1 address");

  checkEthCap("INITIAL_MAX_TOTAL_DEPOSITS_ETH", "Bank TVL cap");
  checkEthCap("VAULT_MAX_TOTAL_ASSETS_ETH", "Vault TVL cap");
  checkEthCap("STRATEGY_MAX_ASSETS_ETH", "Strategy cap");
  checkEthCap("LENDING_MAX_POOL_LIQUIDITY_ETH", "Lending liquidity cap");

  if (env("DEPLOY_SWAP_TEST_TOKEN").toLowerCase() === "true") {
    fail("Swap test token deployment is disabled on mainnet", "DEPLOY_SWAP_TEST_TOKEN=true");
  } else {
    pass("Swap test token deployment is disabled on mainnet");
  }

  if (env("PREFLIGHT_ONLY").toLowerCase() === "false") {
    warn("Deployment safety switch is armed", "PREFLIGHT_ONLY=false sends deployment transactions");
  } else {
    pass("Deployment safety switch is not armed", "PREFLIGHT_ONLY is not false");
  }
}

function checkExternalGates() {
  checkPathEnv("AUDIT_REPORT_PATH", "Independent audit report");
  checkBooleanGate("AUDIT_FINDINGS_RESOLVED", "Audit findings are resolved");
  checkBooleanGate("STATIC_ANALYSIS_REVIEWED", "Static analysis findings are reviewed");
  checkBooleanGate("DEPENDENCY_AUDIT_REVIEWED", "Production dependency audit is clean");
  checkBooleanGate("TOOLING_AUDIT_REVIEWED", "Dev toolchain audit findings are reviewed");
  checkBooleanGate("LEGAL_REVIEW_DONE", "Legal/regulatory review is complete");
  checkBooleanGate("MAINNET_SAFE_REVIEWED", "Mainnet Safe owners and threshold are reviewed");
  checkBooleanGate("MONITORING_CONFIGURED", "Production monitoring is configured");
  checkBooleanGate("INCIDENT_RESPONSE_REVIEWED", "Incident response runbook is reviewed");
  checkBooleanGate("EMERGENCY_DRILL_COMPLETED", "Emergency drill is completed");
  checkBooleanGate("FRONTEND_PRODUCTION_REVIEWED", "Frontend production config is reviewed");
}

function printResults() {
  console.log("\nProduction Readiness Checks");
  console.log("---------------------------");
  for (const check of checks) {
    const suffix = check.detail ? `: ${check.detail}` : "";
    console.log(`[${check.level}] ${check.label}${suffix}`);
  }

  const failures = checks.filter((check) => check.level === "FAIL");
  const warnings = checks.filter((check) => check.level === "WARN");

  console.log("");
  console.log(`Production readiness summary: ${failures.length} failure(s), ${warnings.length} warning(s), ${checks.length} checks.`);
  if (failures.length > 0) process.exitCode = 1;
}

function main() {
  console.log("\nSimpleBank Production Readiness Gate");
  console.log("Target: Ethereum mainnet public launch");

  checkPackageScripts();
  checkLocalArtifacts();
  checkDocs();
  checkEnv();
  checkDeploymentFiles();
  checkExternalGates();
  printResults();
}

main();
