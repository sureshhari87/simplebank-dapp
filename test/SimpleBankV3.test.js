const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SimpleBankV3 Fee Bank", function () {
  let bank, owner, addr1, addr2, treasury;
  const initialInterestRate = 100;
  const initialMaxTotalDeposits = 0;
  const lockDuration = 8 * 24 * 60 * 60;

  beforeEach(async function () {
    const SimpleBankV3 = await ethers.getContractFactory("SimpleBankV3");
    [owner, addr1, addr2, treasury] = await ethers.getSigners();
    bank = await SimpleBankV3.deploy(
      initialInterestRate,
      owner.address,
      initialMaxTotalDeposits,
      treasury.address
    );
    await bank.waitForDeployment();
  });

  async function unlockWithdrawals() {
    await ethers.provider.send("evm_increaseTime", [lockDuration]);
    await ethers.provider.send("evm_mine");
  }

  describe("Deployment", function () {
    it("sets treasury and starts with fees disabled", async function () {
      expect(await bank.owner()).to.equal(owner.address);
      expect(await bank.treasury()).to.equal(treasury.address);
      expect(await bank.depositFeeBps()).to.equal(0n);
      expect(await bank.withdrawalFeeBps()).to.equal(0n);
      expect(await bank.protocolFees()).to.equal(0n);
    });

    it("rejects a zero treasury", async function () {
      const SimpleBankV3 = await ethers.getContractFactory("SimpleBankV3");

      await expect(
        SimpleBankV3.deploy(initialInterestRate, owner.address, initialMaxTotalDeposits, ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(bank, "ZeroTreasury");
    });
  });

  describe("Fee configuration", function () {
    it("allows owner to set capped deposit and withdrawal fees", async function () {
      await expect(bank.connect(owner).setDepositFeeBps(25))
        .to.emit(bank, "DepositFeeUpdated")
        .withArgs(0, 25);
      await expect(bank.connect(owner).setWithdrawalFeeBps(75))
        .to.emit(bank, "WithdrawalFeeUpdated")
        .withArgs(0, 75);

      expect(await bank.depositFeeBps()).to.equal(25n);
      expect(await bank.withdrawalFeeBps()).to.equal(75n);
    });

    it("rejects fees above the on-chain cap", async function () {
      const maxFee = await bank.MAX_FEE_BPS();

      await expect(bank.connect(owner).setDepositFeeBps(maxFee + 1n))
        .to.be.revertedWithCustomError(bank, "FeeTooHigh");
      await expect(bank.connect(owner).setWithdrawalFeeBps(maxFee + 1n))
        .to.be.revertedWithCustomError(bank, "FeeTooHigh");
    });

    it("allows owner to update treasury", async function () {
      await expect(bank.connect(owner).setTreasury(addr2.address))
        .to.emit(bank, "TreasuryUpdated")
        .withArgs(treasury.address, addr2.address);

      expect(await bank.treasury()).to.equal(addr2.address);
    });

    it("rejects unauthorized fee updates", async function () {
      await expect(bank.connect(addr1).setDepositFeeBps(10)).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("Deposit fees", function () {
    it("credits the user net of fee and tracks protocol revenue separately", async function () {
      const depositAmount = ethers.parseEther("1");
      const feeBps = 50n;
      const fee = (depositAmount * feeBps) / 10000n;
      const creditedAmount = depositAmount - fee;

      await bank.connect(owner).setDepositFeeBps(feeBps);
      const tx = bank.connect(addr1).deposit({ value: depositAmount });

      await expect(tx)
        .to.emit(bank, "DepositFeeCollected")
        .withArgs(addr1.address, fee, depositAmount, creditedAmount);
      await expect(tx).to.emit(bank, "Deposit").withArgs(addr1.address, creditedAmount);

      expect(await bank.connect(addr1).getBalance()).to.equal(creditedAmount);
      expect(await bank.totalDeposits()).to.equal(creditedAmount);
      expect(await bank.protocolFees()).to.equal(fee);
      expect(await bank.getContractBalance()).to.equal(depositAmount);
      expect(await bank.getRecoverableETH()).to.equal(0n);
    });

    it("applies max total deposit limits to credited deposits, not collected fees", async function () {
      const depositAmount = ethers.parseEther("1");
      const feeBps = 100n;
      const fee = (depositAmount * feeBps) / 10000n;
      const creditedAmount = depositAmount - fee;

      await bank.connect(owner).setDepositFeeBps(feeBps);
      await bank.connect(owner).setMaxTotalDeposits(creditedAmount);
      await bank.connect(addr1).deposit({ value: depositAmount });

      expect(await bank.totalDeposits()).to.equal(creditedAmount);
      await expect(bank.connect(addr1).deposit({ value: 1 }))
        .to.be.revertedWithCustomError(bank, "MaxTotalDepositsExceeded");
    });

    it("charges deposit fees on direct ETH receives", async function () {
      const sendAmount = ethers.parseEther("1");
      const feeBps = 25n;
      const fee = (sendAmount * feeBps) / 10000n;

      await bank.connect(owner).setDepositFeeBps(feeBps);
      await addr1.sendTransaction({
        to: await bank.getAddress(),
        value: sendAmount,
      });

      expect(await bank.getBalanceOf(addr1.address)).to.equal(sendAmount - fee);
      expect(await bank.protocolFees()).to.equal(fee);
    });
  });

  describe("Withdrawal fees", function () {
    it("debits the requested balance and keeps the fee for treasury claim", async function () {
      const depositAmount = ethers.parseEther("1");
      const feeBps = 100n;
      const fee = (depositAmount * feeBps) / 10000n;
      const payoutAmount = depositAmount - fee;

      await bank.connect(addr1).deposit({ value: depositAmount });
      await bank.connect(owner).setWithdrawalFeeBps(feeBps);
      await unlockWithdrawals();

      const tx = bank.connect(addr1).withdraw(depositAmount);
      await expect(tx)
        .to.emit(bank, "WithdrawalFeeCollected")
        .withArgs(addr1.address, fee, depositAmount, payoutAmount);
      await expect(tx).to.emit(bank, "WithdrawalMade").withArgs(addr1.address, depositAmount);

      expect(await bank.getBalanceOf(addr1.address)).to.equal(0n);
      expect(await bank.totalDeposits()).to.equal(0n);
      expect(await bank.protocolFees()).to.equal(fee);
      expect(await bank.getContractBalance()).to.equal(fee);
      expect(await bank.getRecoverableETH()).to.equal(0n);
    });
  });

  describe("Treasury claims and reserve accounting", function () {
    it("transfers accumulated protocol fees to treasury", async function () {
      const depositAmount = ethers.parseEther("1");
      const feeBps = 50n;
      const fee = (depositAmount * feeBps) / 10000n;

      await bank.connect(owner).setDepositFeeBps(feeBps);
      await bank.connect(addr1).deposit({ value: depositAmount });

      const tx = bank.connect(owner).claimProtocolFees();
      await expect(tx).to.emit(bank, "ProtocolFeesClaimed").withArgs(treasury.address, fee);
      await expect(tx).to.changeEtherBalances([bank, treasury], [-fee, fee]);

      expect(await bank.protocolFees()).to.equal(0n);
      expect(await bank.getContractBalance()).to.equal(depositAmount - fee);
    });

    it("does not allow protocol fees to be recovered as surplus", async function () {
      const depositAmount = ethers.parseEther("1");
      const feeBps = 50n;
      const fee = (depositAmount * feeBps) / 10000n;

      await bank.connect(owner).setDepositFeeBps(feeBps);
      await bank.connect(addr1).deposit({ value: depositAmount });

      await expect(bank.connect(owner).recoverETH(fee))
        .to.be.revertedWithCustomError(bank, "NoRecoverableSurplus");
    });

    it("keeps contract accounting balanced across deposits, fees, reserve, and interest", async function () {
      const depositAmount = ethers.parseEther("1000");
      const reserveAmount = ethers.parseEther("10");
      const feeBps = 50n;

      await bank.connect(owner).setDepositFeeBps(feeBps);
      await bank.connect(addr1).deposit({ value: depositAmount });
      await bank.connect(owner).fundInterestReserve({ value: reserveAmount });

      expect(await bank.getContractBalance()).to.equal(
        (await bank.totalDeposits()) + (await bank.interestReserve()) + (await bank.protocolFees())
      );

      await ethers.provider.send("evm_increaseTime", [86400]);
      await ethers.provider.send("evm_mine");
      await bank.connect(addr1).claimInterest();

      expect(await bank.getContractBalance()).to.equal(
        (await bank.totalDeposits()) + (await bank.interestReserve()) + (await bank.protocolFees())
      );
    });

    it("rejects empty fee claims", async function () {
      await expect(bank.connect(owner).claimProtocolFees()).to.be.revertedWithCustomError(bank, "NoProtocolFees");
    });
  });
});
