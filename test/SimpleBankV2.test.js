const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SimpleBankV2", function () {
  let bank, owner, addr1, addr2;
  const initialInterestRate = 100; // 1%

  beforeEach(async function () {
    const SimpleBankV2 = await ethers.getContractFactory("SimpleBankV2");
    [owner, addr1, addr2] = await ethers.getSigners();
    bank = await SimpleBankV2.deploy(initialInterestRate);
    await bank.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the correct owner", async function () {
      expect(await bank.owner()).to.equal(owner.address);
    });

    it("Should set the initial interest rate", async function () {
      expect(await bank.interestRate()).to.equal(initialInterestRate);
    });
  });

  describe("Deposits", function () {
    it("Should accept deposits and update balance", async function () {
      const depositAmount = ethers.parseEther("1.0");

      await bank.connect(addr1).deposit({ value: depositAmount });

      expect(await bank.connect(addr1).getBalance()).to.equal(depositAmount);
      expect(await bank.getContractBalance()).to.equal(depositAmount);
    });

    it("Should emit Deposit event", async function () {
      const depositAmount = ethers.parseEther("1.0");

      await expect(bank.connect(addr1).deposit({ value: depositAmount }))
        .to.emit(bank, "Deposit")
        .withArgs(addr1.address, depositAmount);
    });

    it("Should reject zero deposits", async function () {
      await expect(
        bank.connect(addr1).deposit({ value: 0 })
      ).to.be.revertedWithCustomError(bank, "ZeroDeposit");
    });

    it("Should respect max deposit limit when set", async function () {
      const maxDeposit = ethers.parseEther("2.0");
      await bank.connect(owner).setMaxDeposit(maxDeposit);

      const depositOk = ethers.parseEther("1.5");
      await bank.connect(addr1).deposit({ value: depositOk });

      const depositTooMuch = ethers.parseEther("1.0");

      await expect(
        bank.connect(addr1).deposit({ value: depositTooMuch })
      ).to.be.revertedWithCustomError(bank, "MaxDepositExceeded");
    });
  });

  describe("Withdrawals", function () {
    beforeEach(async function () {
      const depositAmount = ethers.parseEther("1.0");
      await bank.connect(addr1).deposit({ value: depositAmount });
    });

    it("Should allow full withdrawal", async function () {
      const withdrawAmount = ethers.parseEther("1.0");

      await bank.connect(addr1).withdraw(withdrawAmount);

      expect(await bank.connect(addr1).getBalance()).to.equal(0);
      expect(await bank.getContractBalance()).to.equal(0);
    });

    it("Should allow partial withdrawal", async function () {
      const withdrawAmount = ethers.parseEther("0.5");

      await bank.connect(addr1).withdraw(withdrawAmount);

      expect(await bank.connect(addr1).getBalance()).to.equal(
        ethers.parseEther("0.5")
      );
    });

    it("Should emit Withdrawal event", async function () {
      const withdrawAmount = ethers.parseEther("0.5");

      await expect(bank.connect(addr1).withdraw(withdrawAmount))
        .to.emit(bank, "Withdrawal")
        .withArgs(addr1.address, withdrawAmount);
    });

    it("Should reject withdrawal exceeding balance", async function () {
      const withdrawAmount = ethers.parseEther("2.0");

      await expect(
        bank.connect(addr1).withdraw(withdrawAmount)
      ).to.be.revertedWithCustomError(bank, "InsufficientBalance");
    });

    it("Should reject zero withdrawal", async function () {
      await expect(
        bank.connect(addr1).withdraw(0)
      ).to.be.revertedWithCustomError(bank, "ZeroWithdrawal");
    });
  });

  describe("Interest", function () {
    it("Should apply interest after 1 day", async function () {
      const depositAmount = ethers.parseEther("1000");

      await bank.connect(addr1).deposit({ value: depositAmount });

      await ethers.provider.send("evm_increaseTime", [86400]);
      await ethers.provider.send("evm_mine");

      const pending = await bank.getPendingInterest(addr1.address);
      expect(pending).to.be.gt(0);

      await bank.connect(addr1).claimInterest();

      const newBalance = await bank.connect(addr1).getBalance();
      expect(newBalance).to.be.gt(depositAmount);
    });

    it("Should not allow claiming before 1 day", async function () {
      const depositAmount = ethers.parseEther("1000");

      await bank.connect(addr1).deposit({ value: depositAmount });

      await expect(
        bank.connect(addr1).claimInterest()
      ).to.be.revertedWithCustomError(bank, "NoInterestYet");
    });

    it("Should emit InterestClaimed event", async function () {
      const depositAmount = ethers.parseEther("1000");

      await bank.connect(addr1).deposit({ value: depositAmount });

      await ethers.provider.send("evm_increaseTime", [86400]);
      await ethers.provider.send("evm_mine");

      const tx = await bank.connect(addr1).claimInterest();

      await expect(tx).to.emit(bank, "InterestClaimed");
    });
  });

  describe("Owner functions", function () {
    it("Should allow owner to change interest rate", async function () {
      const newRate = 200;

      await bank.connect(owner).setInterestRate(newRate);
      expect(await bank.interestRate()).to.equal(newRate);

      await expect(
        bank.connect(owner).setInterestRate(501)
      ).to.be.revertedWithCustomError(bank, "RateTooHigh");
    });

    it("Should reject non-owner", async function () {
      await expect(
        bank.connect(addr1).setInterestRate(200)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should allow owner to pause and unpause", async function () {
      await bank.connect(owner).pause();
      expect(await bank.paused()).to.equal(true);

      await expect(
        bank.connect(addr1).deposit({ value: 1 })
      ).to.be.revertedWith("Pausable: paused");

      await bank.connect(owner).unpause();
      expect(await bank.paused()).to.equal(false);
    });

    it("Should allow owner to recover ETH", async function () {
      const depositAmount = ethers.parseEther("1.0");

      await bank.connect(addr1).deposit({ value: depositAmount });

      const ownerBalanceBefore = await ethers.provider.getBalance(owner.address);

      await bank.connect(owner).recoverETH(depositAmount);

      const ownerBalanceAfter = await ethers.provider.getBalance(owner.address);

      expect(ownerBalanceAfter).to.be.gt(ownerBalanceBefore);
    });
  });

  describe("Receive function", function () {
    it("Should accept direct ETH transfers", async function () {
      const sendAmount = ethers.parseEther("1.0");

      await addr1.sendTransaction({
        to: bank.getAddress(),
        value: sendAmount,
      });

      expect(await bank.connect(addr1).getBalance()).to.equal(sendAmount);
      expect(await bank.getContractBalance()).to.equal(sendAmount);
    });
  });
});