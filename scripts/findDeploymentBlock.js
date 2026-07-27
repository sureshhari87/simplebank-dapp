const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

function getDeploymentMetadata() {
  const deploymentPath = path.join(process.cwd(), "deployments", `${hre.network.name}.json`);
  if (!fs.existsSync(deploymentPath)) return {};
  return JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
}

async function findBlockAtOrBeforeTimestamp(timestamp) {
  let low = 0;
  let high = await hre.ethers.provider.getBlockNumber();

  while (low < high) {
    const mid = Math.floor((low + high + 1) / 2);
    const block = await hre.ethers.provider.getBlock(mid);
    if (!block) {
      high = mid - 1;
    } else if (Number(block.timestamp) <= timestamp) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  return low;
}

async function main() {
  const deployment = getDeploymentMetadata();
  const address = process.env.CONTRACT_ADDRESS || deployment.contractAddress;
  if (!address || !hre.ethers.isAddress(address)) {
    throw new Error("Set CONTRACT_ADDRESS to the deployed contract address");
  }

  const latestBlock = await hre.ethers.provider.getBlockNumber();
  let low = 0;
  let high = latestBlock;

  try {
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      const code = await hre.ethers.provider.getCode(address, mid);
      if (code === "0x") {
        low = mid + 1;
      } else {
        high = mid;
      }
    }

    const code = await hre.ethers.provider.getCode(address, low);
    if (code !== "0x") {
      console.log(`deploymentBlock=${low}`);
      return;
    }
  } catch (error) {
    console.warn(`Archive lookup unavailable, falling back to deployedAt timestamp: ${error.message}`);
  }

  if (!deployment.deployedAt) {
    throw new Error("Archive lookup failed and deployments metadata has no deployedAt timestamp");
  }

  const deployedAtSeconds = Math.floor(new Date(deployment.deployedAt).getTime() / 1000);
  const timestampBlock = await findBlockAtOrBeforeTimestamp(deployedAtSeconds);
  const safeStartBlock = Math.max(0, timestampBlock - 100);

  console.log(`deploymentBlock=${safeStartBlock}`);
  console.log(`timestampBlock=${timestampBlock}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Deployment block lookup failed:", error);
    process.exitCode = 1;
  });
}
