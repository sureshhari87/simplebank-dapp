require("dotenv").config();
require("@nomicfoundation/hardhat-toolbox");
require("solidity-coverage");
require("hardhat-gas-reporter");

if (process.env.TENDERLY_PROJECT || process.env.TENDERLY_USERNAME) {
  require("@tenderly/hardhat-tenderly");
}

const {
  PRIVATE_KEY,
  SEPOLIA_RPC_URL,
  MAINNET_RPC_URL,
  ETHERSCAN_API_KEY,
  TENDERLY_PROJECT,
  TENDERLY_USERNAME,
  REPORT_GAS
} = process.env;

module.exports = {
  solidity: {
    version: "0.8.19",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  gasReporter: {
    enabled: REPORT_GAS === "true",
    currency: "USD",
    gasPrice: 20
  },
  tenderly: {
    project: TENDERLY_PROJECT || "simplebank",
    username: TENDERLY_USERNAME || ""
  },
  networks: {
    hardhat: {},
    sepolia: {
      url: SEPOLIA_RPC_URL || "https://ethereum-sepolia.publicnode.com",
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      chainId: 11155111
    },
    mainnet: {
      url: MAINNET_RPC_URL || "",
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      chainId: 1
    }
  },
  etherscan: {
    apiKey: ETHERSCAN_API_KEY || ""
  }
};
