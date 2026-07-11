const hre = require("hardhat");

async function main() {
    const contractAddress = process.env.CONTRACT_ADDRESS;
    const safeAddress = process.env.NEW_OWNER || process.env.SAFE_ADDRESS;

    if (!contractAddress) {
        throw new Error("Set CONTRACT_ADDRESS before running this script");
    }

    if (!safeAddress) {
        throw new Error("Set NEW_OWNER or SAFE_ADDRESS before running this script");
    }

    const SimpleBankV2 = await hre.ethers.getContractFactory("SimpleBankV2");
    const bank = await SimpleBankV2.attach(contractAddress);

    console.log(`Current owner: ${await bank.owner()}`);
    console.log(`Starting two-step ownership transfer to: ${safeAddress}`);

    const tx = await bank.transferOwnership(safeAddress);
    await tx.wait();

    console.log(`Ownership transfer started. Current owner: ${await bank.owner()}`);
    console.log(`Pending owner: ${await bank.pendingOwner()}`);
    console.log("The pending owner must call acceptOwnership() to complete the transfer.");
    console.log(`Transaction hash: ${tx.hash}`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
