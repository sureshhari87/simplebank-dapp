const fs = require("fs");
const path = require("path");

const artifactPath = path.join(
  process.cwd(),
  "artifacts",
  "contracts",
  "SimpleBankV2.sol",
  "SimpleBankV2.json"
);

const outputPath = path.join(process.cwd(), "contract-config.js");
const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
const abi = JSON.stringify(artifact.abi, null, 2);

const config = `const CONTRACT_ABI = ${abi};

const NETWORKS = {
  11155111: {
    chainId: "0xaa36a7",
    chainName: "Sepolia Test Network",
    contractAddress: "0x13e8e9f745E6E9f7Ab512fe25E153359AADCD73b",
    deploymentBlock: 0,
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
    contractAddress: "",
    deploymentBlock: 0,
    rpcUrls: ["https://ethereum.publicnode.com"],
    blockExplorerUrls: ["https://etherscan.io"],
    nativeCurrency: {
      name: "Ether",
      symbol: "ETH",
      decimals: 18
    }
  }
};

function getActiveNetworkConfig() {
  if (typeof window !== "undefined" && window.ethereum && window.ethereum.chainId) {
    const chainId = Number.parseInt(window.ethereum.chainId, 16);
    return NETWORKS[chainId] || NETWORKS[11155111];
  }

  return NETWORKS[11155111];
}

const ACTIVE_NETWORK = getActiveNetworkConfig();

window.CONTRACT_CONFIG = {
  abi: CONTRACT_ABI,
  networks: NETWORKS,
  defaultChainId: 11155111,
  address: ACTIVE_NETWORK.contractAddress,
  network: ACTIVE_NETWORK,
  explorerTxUrl(txHash) {
    const activeNetwork = window.CONTRACT_CONFIG?.network || ACTIVE_NETWORK;
    return activeNetwork.blockExplorerUrls[0] + "/tx/" + txHash;
  }
};

console.log(
  "Contract config loaded:",
  ACTIVE_NETWORK.chainName,
  ACTIVE_NETWORK.contractAddress || "no address configured"
);
`;

fs.writeFileSync(outputPath, config);
console.log(`Generated ${outputPath} from ${artifactPath}`);
