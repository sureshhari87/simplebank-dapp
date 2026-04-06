require("@nomicfoundation/hardhat-toolbox");

const PRIVATE_KEY = "2e091b89dabf4ffa1a8060d59df88efc0fe405b9f33da05f7cb6bd5cb2dea78e";

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

networks: {
  sepolia: {
    url: "https://ethereum-sepolia.publicnode.com",
    accounts: [PRIVATE_KEY],
    chainId: 11155111
  }
  },
  etherscan: {
    apiKey: "3NAVS9SSKM6V4C9NMAG6HYVBRG32X73GGW"
  }
};
