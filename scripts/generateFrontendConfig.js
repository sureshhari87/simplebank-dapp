const fs = require("fs");
const path = require("path");

const DEFAULT_CONTRACT_NAME = "SimpleBankV3";
const SUPPORTED_CONTRACT_NAMES = new Set(["SimpleBankV2", "SimpleBankV3"]);
const contractName = process.env.FRONTEND_CONTRACT_NAME || process.env.CONTRACT_NAME || DEFAULT_CONTRACT_NAME;

if (!SUPPORTED_CONTRACT_NAMES.has(contractName)) {
  throw new Error(
    `Contract name must be one of ${Array.from(SUPPORTED_CONTRACT_NAMES).join(", ")}, got: ${contractName}`
  );
}

const artifactPath = path.join(
  process.cwd(),
  "artifacts",
  "contracts",
  `${contractName}.sol`,
  `${contractName}.json`
);

const outputPath = path.join(process.cwd(), "contract-config.js");
const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
const abi = JSON.stringify(artifact.abi, null, 2);
const SUPPORTED_VAULT_CONTRACT_NAMES = [
  "SimpleWETHYieldVault",
  "SimpleWETHYieldVaultV2",
];

function readArtifactAbi(sourceFileName, artifactName) {
  const targetPath = path.join(
    process.cwd(),
    "artifacts",
    "contracts",
    sourceFileName,
    `${artifactName}.json`
  );

  if (!fs.existsSync(targetPath)) return [];
  return JSON.parse(fs.readFileSync(targetPath, "utf8")).abi;
}

const vaultAbis = {
  SimpleWETHYieldVault: readArtifactAbi("SimpleWETHYieldVault.sol", "SimpleWETHYieldVault"),
  SimpleWETHYieldVaultV2: readArtifactAbi("SimpleWETHYieldVaultV2.sol", "SimpleWETHYieldVaultV2"),
};
const vaultAbisJson = JSON.stringify(vaultAbis, null, 2);
const managerAbi = JSON.stringify(
  readArtifactAbi("strategies/SimpleStrategyManager.sol", "SimpleStrategyManager"),
  null,
  2
);
const lendingAbi = JSON.stringify(
  readArtifactAbi("SimpleLendingPool.sol", "SimpleLendingPool"),
  null,
  2
);
const swapAbi = JSON.stringify(
  readArtifactAbi("SimpleSwapPool.sol", "SimpleSwapPool"),
  null,
  2
);
const treasuryAbi = JSON.stringify(
  readArtifactAbi("SimpleTreasury.sol", "SimpleTreasury"),
  null,
  2
);

function readDeployment(networkName) {
  const deploymentPath = path.join(process.cwd(), "deployments", `${networkName}.json`);
  if (!fs.existsSync(deploymentPath)) return {};

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const deploymentContractName = deployment.contractName || "SimpleBankV2";
  if (deploymentContractName !== contractName) return {};
  return deployment;
}

function getDeploymentValue(deployment, key, fallback) {
  return deployment[key] === undefined || deployment[key] === null ? fallback : deployment[key];
}

function readVaultDeployment(networkName) {
  const configuredDeploymentName = process.env.FRONTEND_VAULT_DEPLOYMENT_NAME || process.env.VAULT_DEPLOYMENT_NAME;
  const deploymentNames = configuredDeploymentName
    ? [configuredDeploymentName]
    : ["strategy-vault", "weth-vault"];

  for (const deploymentName of deploymentNames) {
    const deploymentPath = path.join(process.cwd(), "deployments", `${deploymentName}-${networkName}.json`);
    if (!fs.existsSync(deploymentPath)) continue;

    const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
    if (!SUPPORTED_VAULT_CONTRACT_NAMES.includes(deployment.contractName)) continue;
    return deployment;
  }

  return {};
}

function readManagerDeployment(networkName) {
  const deploymentPath = path.join(process.cwd(), "deployments", `strategy-manager-${networkName}.json`);
  if (!fs.existsSync(deploymentPath)) return {};

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  if (deployment.contractName !== "SimpleStrategyManager") return {};
  return deployment;
}

function readLendingDeployment(networkName) {
  const deploymentPath = path.join(process.cwd(), "deployments", `lending-pool-${networkName}.json`);
  if (!fs.existsSync(deploymentPath)) return {};

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  if (deployment.contractName !== "SimpleLendingPool") return {};
  return deployment;
}

function readSwapDeployment(networkName) {
  const deploymentPath = path.join(process.cwd(), "deployments", `swap-pool-${networkName}.json`);
  if (!fs.existsSync(deploymentPath)) return {};

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  if (deployment.contractName !== "SimpleSwapPool") return {};
  return deployment;
}

function readTreasuryDeployment(networkName) {
  const deploymentPath = path.join(process.cwd(), "deployments", `treasury-${networkName}.json`);
  if (!fs.existsSync(deploymentPath)) return {};

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  if (deployment.contractName !== "SimpleTreasury") return {};
  return deployment;
}

const sepoliaDeployment = readDeployment("sepolia");
const mainnetDeployment = readDeployment("mainnet");
const sepoliaVaultDeployment = readVaultDeployment("sepolia");
const mainnetVaultDeployment = readVaultDeployment("mainnet");
const sepoliaManagerDeployment = readManagerDeployment("sepolia");
const mainnetManagerDeployment = readManagerDeployment("mainnet");
const sepoliaLendingDeployment = readLendingDeployment("sepolia");
const mainnetLendingDeployment = readLendingDeployment("mainnet");
const sepoliaSwapDeployment = readSwapDeployment("sepolia");
const mainnetSwapDeployment = readSwapDeployment("mainnet");
const sepoliaTreasuryDeployment = readTreasuryDeployment("sepolia");
const mainnetTreasuryDeployment = readTreasuryDeployment("mainnet");

const config = `const CONTRACT_ABI = ${abi};
const VAULT_ABIS = ${vaultAbisJson};
const MANAGER_ABI = ${managerAbi};
const LENDING_ABI = ${lendingAbi};
const SWAP_ABI = ${swapAbi};
const TREASURY_ABI = ${treasuryAbi};

const NETWORKS = {
  11155111: {
    chainId: "0xaa36a7",
    chainName: "Sepolia Test Network",
    contractName: "${contractName}",
    contractAddress: "${getDeploymentValue(sepoliaDeployment, "contractAddress", "0x01374a4b858E31DC779794A1e9F4F9207ec9a84e")}",
    deploymentBlock: ${Number(getDeploymentValue(sepoliaDeployment, "deploymentBlock", 11326510))},
    rpcUrls: ["https://ethereum-sepolia.publicnode.com"],
    blockExplorerUrls: ["https://sepolia.etherscan.io"],
    nativeCurrency: {
      name: "Sepolia ETH",
      symbol: "ETH",
      decimals: 18
    }
  },
  1: {
    chainId: "0x1",
    chainName: "Ethereum Mainnet",
    contractName: "${contractName}",
    contractAddress: "${getDeploymentValue(mainnetDeployment, "contractAddress", "")}",
    deploymentBlock: ${Number(getDeploymentValue(mainnetDeployment, "deploymentBlock", 0))},
    rpcUrls: ["https://ethereum.publicnode.com"],
    blockExplorerUrls: ["https://etherscan.io"],
    nativeCurrency: {
      name: "Ether",
      symbol: "ETH",
      decimals: 18
    }
  }
};

const VAULT_NETWORKS = {
  11155111: {
    chainId: "0xaa36a7",
    chainName: "Sepolia Test Network",
    contractName: "${getDeploymentValue(sepoliaVaultDeployment, "contractName", "SimpleWETHYieldVault")}",
    contractAddress: "${getDeploymentValue(sepoliaVaultDeployment, "contractAddress", "")}",
    deploymentBlock: ${Number(getDeploymentValue(sepoliaVaultDeployment, "deploymentBlock", 0))},
    weth: "${getDeploymentValue(sepoliaVaultDeployment, "weth", "")}",
    strategyAddress: "${getDeploymentValue(sepoliaVaultDeployment, "strategyAddress", "")}",
    performanceFeeBps: "${getDeploymentValue(sepoliaVaultDeployment, "performanceFeeBps", "0")}",
    maxTotalAssets: "${getDeploymentValue(sepoliaVaultDeployment, "maxTotalAssets", "0")}",
    blockExplorerUrls: ["https://sepolia.etherscan.io"]
  },
  1: {
    chainId: "0x1",
    chainName: "Ethereum Mainnet",
    contractName: "${getDeploymentValue(mainnetVaultDeployment, "contractName", "SimpleWETHYieldVault")}",
    contractAddress: "${getDeploymentValue(mainnetVaultDeployment, "contractAddress", "")}",
    deploymentBlock: ${Number(getDeploymentValue(mainnetVaultDeployment, "deploymentBlock", 0))},
    weth: "${getDeploymentValue(mainnetVaultDeployment, "weth", "")}",
    strategyAddress: "${getDeploymentValue(mainnetVaultDeployment, "strategyAddress", "")}",
    performanceFeeBps: "${getDeploymentValue(mainnetVaultDeployment, "performanceFeeBps", "0")}",
    maxTotalAssets: "${getDeploymentValue(mainnetVaultDeployment, "maxTotalAssets", "0")}",
    blockExplorerUrls: ["https://etherscan.io"]
  }
};

const MANAGER_NETWORKS = {
  11155111: {
    chainId: "0xaa36a7",
    chainName: "Sepolia Test Network",
    contractName: "SimpleStrategyManager",
    contractAddress: "${getDeploymentValue(sepoliaManagerDeployment, "contractAddress", "")}",
    deploymentBlock: ${Number(getDeploymentValue(sepoliaManagerDeployment, "deploymentBlock", 0))},
    vaultAddress: "${getDeploymentValue(sepoliaManagerDeployment, "vaultAddress", "")}",
    weth: "${getDeploymentValue(sepoliaManagerDeployment, "weth", "")}",
    strategyAddress: "${getDeploymentValue(sepoliaManagerDeployment, "strategyAddress", "")}",
    strategyName: "${getDeploymentValue(sepoliaManagerDeployment, "strategyName", "")}",
    aavePool: "${getDeploymentValue(sepoliaManagerDeployment, "aavePool", "")}",
    aaveAToken: "${getDeploymentValue(sepoliaManagerDeployment, "aaveAToken", "")}",
    initialStrategyMaxAssets: "${getDeploymentValue(sepoliaManagerDeployment, "initialStrategyMaxAssets", "0")}",
    blockExplorerUrls: ["https://sepolia.etherscan.io"]
  },
  1: {
    chainId: "0x1",
    chainName: "Ethereum Mainnet",
    contractName: "SimpleStrategyManager",
    contractAddress: "${getDeploymentValue(mainnetManagerDeployment, "contractAddress", "")}",
    deploymentBlock: ${Number(getDeploymentValue(mainnetManagerDeployment, "deploymentBlock", 0))},
    vaultAddress: "${getDeploymentValue(mainnetManagerDeployment, "vaultAddress", "")}",
    weth: "${getDeploymentValue(mainnetManagerDeployment, "weth", "")}",
    strategyAddress: "${getDeploymentValue(mainnetManagerDeployment, "strategyAddress", "")}",
    strategyName: "${getDeploymentValue(mainnetManagerDeployment, "strategyName", "")}",
    aavePool: "${getDeploymentValue(mainnetManagerDeployment, "aavePool", "")}",
    aaveAToken: "${getDeploymentValue(mainnetManagerDeployment, "aaveAToken", "")}",
    initialStrategyMaxAssets: "${getDeploymentValue(mainnetManagerDeployment, "initialStrategyMaxAssets", "0")}",
    blockExplorerUrls: ["https://etherscan.io"]
  }
};

const LENDING_NETWORKS = {
  11155111: {
    chainId: "0xaa36a7",
    chainName: "Sepolia Test Network",
    contractName: "SimpleLendingPool",
    contractAddress: "${getDeploymentValue(sepoliaLendingDeployment, "contractAddress", "")}",
    deploymentBlock: ${Number(getDeploymentValue(sepoliaLendingDeployment, "deploymentBlock", 0))},
    owner: "${getDeploymentValue(sepoliaLendingDeployment, "owner", "")}",
    treasury: "${getDeploymentValue(sepoliaLendingDeployment, "treasury", "")}",
    borrowAprBps: "${getDeploymentValue(sepoliaLendingDeployment, "borrowAprBps", "0")}",
    originationFeeBps: "${getDeploymentValue(sepoliaLendingDeployment, "originationFeeBps", "0")}",
    maxLtvBps: "${getDeploymentValue(sepoliaLendingDeployment, "maxLtvBps", "0")}",
    liquidationThresholdBps: "${getDeploymentValue(sepoliaLendingDeployment, "liquidationThresholdBps", "0")}",
    liquidationBonusBps: "${getDeploymentValue(sepoliaLendingDeployment, "liquidationBonusBps", "0")}",
    maxPoolLiquidity: "${getDeploymentValue(sepoliaLendingDeployment, "maxPoolLiquidity", "0")}",
    blockExplorerUrls: ["https://sepolia.etherscan.io"]
  },
  1: {
    chainId: "0x1",
    chainName: "Ethereum Mainnet",
    contractName: "SimpleLendingPool",
    contractAddress: "${getDeploymentValue(mainnetLendingDeployment, "contractAddress", "")}",
    deploymentBlock: ${Number(getDeploymentValue(mainnetLendingDeployment, "deploymentBlock", 0))},
    owner: "${getDeploymentValue(mainnetLendingDeployment, "owner", "")}",
    treasury: "${getDeploymentValue(mainnetLendingDeployment, "treasury", "")}",
    borrowAprBps: "${getDeploymentValue(mainnetLendingDeployment, "borrowAprBps", "0")}",
    originationFeeBps: "${getDeploymentValue(mainnetLendingDeployment, "originationFeeBps", "0")}",
    maxLtvBps: "${getDeploymentValue(mainnetLendingDeployment, "maxLtvBps", "0")}",
    liquidationThresholdBps: "${getDeploymentValue(mainnetLendingDeployment, "liquidationThresholdBps", "0")}",
    liquidationBonusBps: "${getDeploymentValue(mainnetLendingDeployment, "liquidationBonusBps", "0")}",
    maxPoolLiquidity: "${getDeploymentValue(mainnetLendingDeployment, "maxPoolLiquidity", "0")}",
    blockExplorerUrls: ["https://etherscan.io"]
  }
};

const SWAP_NETWORKS = {
  11155111: {
    chainId: "0xaa36a7",
    chainName: "Sepolia Test Network",
    contractName: "SimpleSwapPool",
    contractAddress: "${getDeploymentValue(sepoliaSwapDeployment, "contractAddress", "")}",
    deploymentBlock: ${Number(getDeploymentValue(sepoliaSwapDeployment, "deploymentBlock", 0))},
    owner: "${getDeploymentValue(sepoliaSwapDeployment, "owner", "")}",
    treasury: "${getDeploymentValue(sepoliaSwapDeployment, "treasury", "")}",
    token0: "${getDeploymentValue(sepoliaSwapDeployment, "token0", "")}",
    token1: "${getDeploymentValue(sepoliaSwapDeployment, "token1", "")}",
    token0Symbol: "${getDeploymentValue(sepoliaSwapDeployment, "token0Symbol", "")}",
    token1Symbol: "${getDeploymentValue(sepoliaSwapDeployment, "token1Symbol", "")}",
    token0Decimals: ${Number(getDeploymentValue(sepoliaSwapDeployment, "token0Decimals", 18))},
    token1Decimals: ${Number(getDeploymentValue(sepoliaSwapDeployment, "token1Decimals", 18))},
    swapFeeBps: "${getDeploymentValue(sepoliaSwapDeployment, "swapFeeBps", "0")}",
    protocolFeeShareBps: "${getDeploymentValue(sepoliaSwapDeployment, "protocolFeeShareBps", "0")}",
    blockExplorerUrls: ["https://sepolia.etherscan.io"]
  },
  1: {
    chainId: "0x1",
    chainName: "Ethereum Mainnet",
    contractName: "SimpleSwapPool",
    contractAddress: "${getDeploymentValue(mainnetSwapDeployment, "contractAddress", "")}",
    deploymentBlock: ${Number(getDeploymentValue(mainnetSwapDeployment, "deploymentBlock", 0))},
    owner: "${getDeploymentValue(mainnetSwapDeployment, "owner", "")}",
    treasury: "${getDeploymentValue(mainnetSwapDeployment, "treasury", "")}",
    token0: "${getDeploymentValue(mainnetSwapDeployment, "token0", "")}",
    token1: "${getDeploymentValue(mainnetSwapDeployment, "token1", "")}",
    token0Symbol: "${getDeploymentValue(mainnetSwapDeployment, "token0Symbol", "")}",
    token1Symbol: "${getDeploymentValue(mainnetSwapDeployment, "token1Symbol", "")}",
    token0Decimals: ${Number(getDeploymentValue(mainnetSwapDeployment, "token0Decimals", 18))},
    token1Decimals: ${Number(getDeploymentValue(mainnetSwapDeployment, "token1Decimals", 18))},
    swapFeeBps: "${getDeploymentValue(mainnetSwapDeployment, "swapFeeBps", "0")}",
    protocolFeeShareBps: "${getDeploymentValue(mainnetSwapDeployment, "protocolFeeShareBps", "0")}",
    blockExplorerUrls: ["https://etherscan.io"]
  }
};

const TREASURY_NETWORKS = {
  11155111: {
    chainId: "0xaa36a7",
    chainName: "Sepolia Test Network",
    contractName: "SimpleTreasury",
    contractAddress: "${getDeploymentValue(sepoliaTreasuryDeployment, "contractAddress", "")}",
    deploymentBlock: ${Number(getDeploymentValue(sepoliaTreasuryDeployment, "deploymentBlock", 0))},
    owner: "${getDeploymentValue(sepoliaTreasuryDeployment, "owner", "")}",
    blockExplorerUrls: ["https://sepolia.etherscan.io"]
  },
  1: {
    chainId: "0x1",
    chainName: "Ethereum Mainnet",
    contractName: "SimpleTreasury",
    contractAddress: "${getDeploymentValue(mainnetTreasuryDeployment, "contractAddress", "")}",
    deploymentBlock: ${Number(getDeploymentValue(mainnetTreasuryDeployment, "deploymentBlock", 0))},
    owner: "${getDeploymentValue(mainnetTreasuryDeployment, "owner", "")}",
    blockExplorerUrls: ["https://etherscan.io"]
  }
};

function getActiveNetworkConfig() {
  if (typeof window !== "undefined" && window.ethereum && window.ethereum.chainId) {
    const chainId = Number.parseInt(window.ethereum.chainId, 16);
    return NETWORKS[chainId] || NETWORKS[11155111];
  }

  return NETWORKS[11155111];
}

function getActiveVaultNetworkConfig() {
  if (typeof window !== "undefined" && window.ethereum && window.ethereum.chainId) {
    const chainId = Number.parseInt(window.ethereum.chainId, 16);
    return VAULT_NETWORKS[chainId] || VAULT_NETWORKS[11155111];
  }

  return VAULT_NETWORKS[11155111];
}

function getActiveManagerNetworkConfig() {
  if (typeof window !== "undefined" && window.ethereum && window.ethereum.chainId) {
    const chainId = Number.parseInt(window.ethereum.chainId, 16);
    return MANAGER_NETWORKS[chainId] || MANAGER_NETWORKS[11155111];
  }

  return MANAGER_NETWORKS[11155111];
}

function getActiveLendingNetworkConfig() {
  if (typeof window !== "undefined" && window.ethereum && window.ethereum.chainId) {
    const chainId = Number.parseInt(window.ethereum.chainId, 16);
    return LENDING_NETWORKS[chainId] || LENDING_NETWORKS[11155111];
  }

  return LENDING_NETWORKS[11155111];
}

function getActiveSwapNetworkConfig() {
  if (typeof window !== "undefined" && window.ethereum && window.ethereum.chainId) {
    const chainId = Number.parseInt(window.ethereum.chainId, 16);
    return SWAP_NETWORKS[chainId] || SWAP_NETWORKS[11155111];
  }

  return SWAP_NETWORKS[11155111];
}

function getActiveTreasuryNetworkConfig() {
  if (typeof window !== "undefined" && window.ethereum && window.ethereum.chainId) {
    const chainId = Number.parseInt(window.ethereum.chainId, 16);
    return TREASURY_NETWORKS[chainId] || TREASURY_NETWORKS[11155111];
  }

  return TREASURY_NETWORKS[11155111];
}

const ACTIVE_NETWORK = getActiveNetworkConfig();
const ACTIVE_VAULT_NETWORK = getActiveVaultNetworkConfig();
const ACTIVE_VAULT_ABI = VAULT_ABIS[ACTIVE_VAULT_NETWORK.contractName] || [];
const ACTIVE_MANAGER_NETWORK = getActiveManagerNetworkConfig();
const ACTIVE_LENDING_NETWORK = getActiveLendingNetworkConfig();
const ACTIVE_SWAP_NETWORK = getActiveSwapNetworkConfig();
const ACTIVE_TREASURY_NETWORK = getActiveTreasuryNetworkConfig();

window.CONTRACT_CONFIG = {
  abi: CONTRACT_ABI,
  contractName: "${contractName}",
  networks: NETWORKS,
  defaultChainId: 11155111,
  address: ACTIVE_NETWORK.contractAddress,
  network: ACTIVE_NETWORK,
  explorerTxUrl(txHash) {
    const activeNetwork = window.CONTRACT_CONFIG?.network || ACTIVE_NETWORK;
    return activeNetwork.blockExplorerUrls[0] + "/tx/" + txHash;
  }
};

window.VAULT_CONFIG = {
  abi: ACTIVE_VAULT_ABI,
  abis: VAULT_ABIS,
  contractName: ACTIVE_VAULT_NETWORK.contractName,
  networks: VAULT_NETWORKS,
  defaultChainId: 11155111,
  address: ACTIVE_VAULT_NETWORK.contractAddress,
  network: ACTIVE_VAULT_NETWORK,
  explorerTxUrl(txHash) {
    const activeNetwork = window.VAULT_CONFIG?.network || ACTIVE_VAULT_NETWORK;
    return activeNetwork.blockExplorerUrls[0] + "/tx/" + txHash;
  }
};

window.MANAGER_CONFIG = {
  abi: MANAGER_ABI,
  contractName: "SimpleStrategyManager",
  networks: MANAGER_NETWORKS,
  defaultChainId: 11155111,
  address: ACTIVE_MANAGER_NETWORK.contractAddress,
  network: ACTIVE_MANAGER_NETWORK,
  explorerTxUrl(txHash) {
    const activeNetwork = window.MANAGER_CONFIG?.network || ACTIVE_MANAGER_NETWORK;
    return activeNetwork.blockExplorerUrls[0] + "/tx/" + txHash;
  }
};

window.LENDING_CONFIG = {
  abi: LENDING_ABI,
  contractName: "SimpleLendingPool",
  networks: LENDING_NETWORKS,
  defaultChainId: 11155111,
  address: ACTIVE_LENDING_NETWORK.contractAddress,
  network: ACTIVE_LENDING_NETWORK,
  explorerTxUrl(txHash) {
    const activeNetwork = window.LENDING_CONFIG?.network || ACTIVE_LENDING_NETWORK;
    return activeNetwork.blockExplorerUrls[0] + "/tx/" + txHash;
  }
};

window.SWAP_CONFIG = {
  abi: SWAP_ABI,
  contractName: "SimpleSwapPool",
  networks: SWAP_NETWORKS,
  defaultChainId: 11155111,
  address: ACTIVE_SWAP_NETWORK.contractAddress,
  network: ACTIVE_SWAP_NETWORK,
  explorerTxUrl(txHash) {
    const activeNetwork = window.SWAP_CONFIG?.network || ACTIVE_SWAP_NETWORK;
    return activeNetwork.blockExplorerUrls[0] + "/tx/" + txHash;
  }
};

window.TREASURY_CONFIG = {
  abi: TREASURY_ABI,
  contractName: "SimpleTreasury",
  networks: TREASURY_NETWORKS,
  defaultChainId: 11155111,
  address: ACTIVE_TREASURY_NETWORK.contractAddress,
  network: ACTIVE_TREASURY_NETWORK,
  explorerTxUrl(txHash) {
    const activeNetwork = window.TREASURY_CONFIG?.network || ACTIVE_TREASURY_NETWORK;
    return activeNetwork.blockExplorerUrls[0] + "/tx/" + txHash;
  }
};

console.log(
  "Contract config loaded:",
  ACTIVE_NETWORK.chainName,
  ACTIVE_NETWORK.contractAddress || "no address configured"
);
console.log(
  "Vault config loaded:",
  ACTIVE_VAULT_NETWORK.chainName,
  ACTIVE_VAULT_NETWORK.contractAddress || "no vault address configured"
);
console.log(
  "Manager config loaded:",
  ACTIVE_MANAGER_NETWORK.chainName,
  ACTIVE_MANAGER_NETWORK.contractAddress || "no manager address configured"
);
console.log(
  "Lending config loaded:",
  ACTIVE_LENDING_NETWORK.chainName,
  ACTIVE_LENDING_NETWORK.contractAddress || "no lending pool address configured"
);
console.log(
  "Swap config loaded:",
  ACTIVE_SWAP_NETWORK.chainName,
  ACTIVE_SWAP_NETWORK.contractAddress || "no swap pool address configured"
);
console.log(
  "Treasury config loaded:",
  ACTIVE_TREASURY_NETWORK.chainName,
  ACTIVE_TREASURY_NETWORK.contractAddress || "no treasury address configured"
);
`;

fs.writeFileSync(outputPath, config);
console.log(`Generated ${outputPath} from ${artifactPath}`);
