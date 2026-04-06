const hre = require("hardhat");
const fs = require("fs");

async function main() {
 console.log("Deploying SimpleBankV2...");

  const SimpleBankV2 = await hre.ethers.getContractFactory("SimpleBankV2");
  const initialInterestRate = 100;

  const bank = await SimpleBankV2.deploy(initialInterestRate);
  await bank.waitForDeployment();

  const contractAddress = await bank.getAddress();

  const owner = await bank.owner();
  const interestRate = await bank.interestRate();
  const interestRatePercent = Number(interestRate) / 100;

  console.log("\nSimpleBankV2 deployed sucessfully!");
  console.log("Contract address", contractAddress);
  console.log("Owner:", owner);
  console.log("Interest rate:", interestRatePercent + "%");
  

  // Save deployment info
  const data = {
    contractAddress: contractAddress,
    network: "sepolia",
    deployedAt: new Date().toISOString(),
    interestRate: interestRate.toString()
  };
  fs.writeFileSync("deployement.json", JSON.stringify(data, null, 2));
  console.log("/n Deployment info saved to deployment.json"); 
}

main().catch((error) => {
  console.error("Deployment failed:", error);
  process.exitCode = 1;
});