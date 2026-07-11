const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Invariants", function () {
    let SimpleBankV2, bank, owner, addr1, addr2;
    before(async function () {
        SimpleBankV2 = await ethers.getContractFactory("SimpleBankV2");
        [owner, addr1, addr2] = await ethers.getSigners();
        bank = await SimpleBankV2.deploy(100, owner.address, 0);
        await bank.waitForDeployment();
    });

    it("Total deposits should equal sum of all user balances", async function () {
        // Make some deopsits
        await bank.connect(addr1).deposit({ value: ethers.parseEther("1.0") });
        await bank.connect(addr2).deposit({ value: ethers.parseEther("0.5") });

        const totalDeposits = await bank.totalDeposits();
        const balance1 = await bank.getBalanceOf(addr1.address);
        const balance2 = await bank.getBalanceOf(addr2.address);
        const sum = balance1 + balance2;
        expect(totalDeposits).to.equal(sum);
});

    it("Contract balance should equal totalDeposits when no interest reserve is funded", async function () {
        const contractBalance = await bank.getContractBalance();
        const totalDeposits = await bank.totalDeposits();
        expect(contractBalance).to.equal(totalDeposits);
    });

    it("Contract balance should equal totalDeposits plus interestReserve", async function () {
        const reserveAmount = ethers.parseEther("0.25");
        await bank.connect(owner).fundInterestReserve({ value: reserveAmount });

        const contractBalance = await bank.getContractBalance();
        const totalDeposits = await bank.totalDeposits();
        const interestReserve = await bank.interestReserve();

        expect(contractBalance).to.equal(totalDeposits + interestReserve);
    });
});
