const hre = require("hardhat");
const fs = require("fs");

const {
  getDeploymentPath,
  getInterestReservePolicy,
} = require("./deploy");

function resolveContractAddress(networkName) {
  if (process.env.CONTRACT_ADDRESS && hre.ethers.isAddress(process.env.CONTRACT_ADDRESS)) {
    return process.env.CONTRACT_ADDRESS;
  }

  const deploymentPath = getDeploymentPath(networkName);
  if (!fs.existsSync(deploymentPath)) {
    throw new Error(`CONTRACT_ADDRESS is not set and ${deploymentPath} does not exist`);
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  if (!hre.ethers.isAddress(deployment.contractAddress)) {
    throw new Error(`Invalid contractAddress in ${deploymentPath}`);
  }

  return deployment.contractAddress;
}

function resolveContractName(networkName) {
  if (process.env.CONTRACT_NAME) {
    return process.env.CONTRACT_NAME;
  }

  const deploymentPath = getDeploymentPath(networkName);
  if (!fs.existsSync(deploymentPath)) {
    return "SimpleBankV2";
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  return deployment.contractName || "SimpleBankV2";
}

async function main() {
  const networkName = hre.network.name;
  const contractAddress = resolveContractAddress(networkName);
  const contractName = resolveContractName(networkName);
  const bank = await hre.ethers.getContractAt(contractName, contractAddress);

  const [interestReserve, interestRate, maxTotalDeposits, totalDeposits] = await Promise.all([
    bank.interestReserve(),
    bank.interestRate(),
    bank.maxTotalDeposits(),
    bank.totalDeposits(),
  ]);

  const hasTvlCap = maxTotalDeposits > 0n;
  const defaultExpectedTvl = hasTvlCap ? maxTotalDeposits : totalDeposits;
  const defaultExpectedTvlSource = hasTvlCap ? "maxTotalDeposits" : "totalDeposits";
  const policy = getInterestReservePolicy(defaultExpectedTvl, Number(interestRate), defaultExpectedTvlSource);

  console.log("\nInterest reserve policy check");
  console.log("Network:", networkName);
  console.log("Contract type:", contractName);
  console.log("Contract:", contractAddress);
  console.log("Interest rate:", `${Number(interestRate) / 100}%`);
  console.log("Total deposits:", `${hre.ethers.formatEther(totalDeposits)} ETH`);
  console.log("Global TVL cap:", `${hre.ethers.formatEther(maxTotalDeposits)} ETH`);
  console.log("Policy expected TVL:", `${hre.ethers.formatEther(policy.expectedTvl)} ETH (${policy.expectedTvlSource})`);
  console.log("Policy period:", `${policy.periodDays.toString()} days`);
  console.log("Required reserve:", `${hre.ethers.formatEther(policy.requiredReserve)} ETH`);
  console.log("Current reserve:", `${hre.ethers.formatEther(interestReserve)} ETH`);

  if (interestReserve < policy.requiredReserve) {
    const shortfall = policy.requiredReserve - interestReserve;
    throw new Error(`interestReserve is below policy by ${hre.ethers.formatEther(shortfall)} ETH`);
  }

  console.log("Interest reserve policy passed.");
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Interest reserve policy check failed:", error);
    process.exitCode = 1;
  });
}

module.exports = {
  main,
  resolveContractAddress,
  resolveContractName,
};
