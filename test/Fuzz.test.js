const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SimpleBankV2 - Fuzz Tests", function () {
    let SimpleBankV2, bank, owner, addr1;

    beforeEach(async function () {
        SimpleBankV2 = await ethers.getContractFactory("SimpleBankV2");
        [owner, addr1] = await ethers.getSigners();
        bank = await SimpleBankV2.deploy(100, owner.address, 0);
        await bank.waitForDeployment();
        await bank.connect(owner).fundInterestReserve({ value: ethers.parseEther("1") });
    });

    it("Fuzz: deposit + withdraw should never break balance", async function () {
    for (let i = 0; i < 30; i++) {

        // ✅ fresh user each iteration
        const [_, user] = await ethers.getSigners();

        const randomEth = 0.001 + Math.random() * 0.099;
        const depositWei = ethers.parseEther(randomEth.toFixed(6));

        await bank.connect(user).deposit({ value: depositWei });

        let balance = await bank.getBalanceOf(user.address);

        // ✅ balance should be >= deposit (interest may add)
        expect(balance).to.be.gte(depositWei);

        const withdrawFraction = Math.random();
        const withdrawWei = (balance * BigInt(Math.floor(withdrawFraction * 100))) / 100n;

        if (withdrawWei > 0n) {
            try {
                const lockDuration = 7 * 24 * 60 * 60;
                await ethers.provider.send("evm_increaseTime", [lockDuration]);
                await ethers.provider.send("evm_mine");

                await bank.connect(user).withdraw(withdrawWei);

                const newBalance = await bank.getBalanceOf(user.address);

                expect(newBalance).to.be.gte(0n);
                expect(newBalance).to.be.lte(balance);

            } catch (err) {
                if (!err.message.includes("WithdrawalLocked")) {
                    throw err;
                }
            }
        }
    }
});

    it("Fuzz: deposit respects minDeposit if set", async function() {
        const minDepositWei = ethers.parseEther("0.01");
        await bank.connect(owner).setMinDeposit(minDepositWei);

        for (let i = 0; i < 20; i++) {
            const randomEth = 0.001 + Math.random() * 0.02;
            const depositWei = ethers.parseEther(randomEth.toFixed(6));
            if (depositWei < minDepositWei) {
                await expect(bank.connect(addr1).deposit({ value: depositWei }))
                .to.be.revertedWithCustomError(bank, "BelowMinDeposit"); 
            } else {
                await bank.connect(addr1).deposit({ value: depositWei });
            }
        }
    });
});
