const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SimpleBankV2", function () {
  let bank, owner, addr1, addr2;
  const initialInterestRate = 100;
  const initialMaxTotalDeposits = 0;
  const lockDuration = 8 * 24 * 60 * 60;

  beforeEach(async function () {
    const SimpleBankV2 = await ethers.getContractFactory("SimpleBankV2");
    [owner, addr1, addr2] = await ethers.getSigners();
    bank = await SimpleBankV2.deploy(initialInterestRate, owner.address, initialMaxTotalDeposits);
    await bank.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the correct owner", async function () {
      expect(await bank.owner()).to.equal(owner.address);
    });

    it("Should set the initial interest rate", async function () {
      expect(await bank.interestRate()).to.equal(initialInterestRate);
    });

    it("Should set the initial global total deposit cap", async function () {
      const SimpleBankV2 = await ethers.getContractFactory("SimpleBankV2");
      const initialCap = ethers.parseEther("10");
      const cappedBank = await SimpleBankV2.deploy(initialInterestRate, owner.address, initialCap);
      await cappedBank.waitForDeployment();

      expect(await cappedBank.maxTotalDeposits()).to.equal(initialCap);
    });

    it("Should reject a zero initial owner", async function () {
      const SimpleBankV2 = await ethers.getContractFactory("SimpleBankV2");

      await expect(SimpleBankV2.deploy(initialInterestRate, ethers.ZeroAddress, initialMaxTotalDeposits)).to.be.revertedWithCustomError(bank, "ZeroOwner");
    });

    it("Should reject an initial interest rate above the cap", async function () {
      const SimpleBankV2 = await ethers.getContractFactory("SimpleBankV2");

      await expect(SimpleBankV2.deploy(501, owner.address, initialMaxTotalDeposits)).to.be.revertedWithCustomError(bank, "RateTooHigh");
    });
  });

  describe("Deposits", function () {
    it("Should accept deposits and update balance", async function () {
      const depositAmount = ethers.parseEther("1.0");

      await bank.connect(addr1).deposit({ value: depositAmount });

      expect(await bank.connect(addr1).getBalance()).to.equal(depositAmount);
      expect(await bank.getContractBalance()).to.equal(depositAmount);
    });

    it("Should record the deposit timestamp for withdrawals", async function () {
      const depositAmount = ethers.parseEther("1.0");
      const tx = await bank.connect(addr1).deposit({ value: depositAmount });
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt.blockNumber);

      expect(await bank.getLastDepositTime(addr1.address)).to.equal(block.timestamp);
    });

    it("Should emit Deposit event", async function () {
      const depositAmount = ethers.parseEther("1.0");

      await expect(bank.connect(addr1).deposit({ value: depositAmount }))
        .to.emit(bank, "Deposit")
        .withArgs(addr1.address, depositAmount);
    });

    it("Should reject zero deposits", async function () {
      await expect(bank.connect(addr1).deposit({ value: 0 })).to.be.revertedWithCustomError(bank, "ZeroDeposit");
    });

    it("Should respect max deposit limit when set", async function () {
      const maxDeposit = ethers.parseEther("2.0");
      await bank.connect(owner).setMaxDeposit(maxDeposit);

      const depositOk = ethers.parseEther("1.5");
      await bank.connect(addr1).deposit({ value: depositOk });

      const depositTooMuch = ethers.parseEther("1.0");

      await expect(bank.connect(addr1).deposit({ value: depositTooMuch })).to.be.revertedWithCustomError(bank, "MaxDepositExceeded");
    });

    it("Should enforce the global total deposit cap across users", async function () {
      const maxTotalDeposits = ethers.parseEther("2.0");
      await expect(bank.connect(owner).setMaxTotalDeposits(maxTotalDeposits))
        .to.emit(bank, "MaxTotalDepositsUpdated")
        .withArgs(0, maxTotalDeposits);

      await bank.connect(addr1).deposit({ value: ethers.parseEther("1.25") });
      await bank.connect(addr2).deposit({ value: ethers.parseEther("0.75") });

      expect(await bank.totalDeposits()).to.equal(maxTotalDeposits);
      await expect(bank.connect(addr1).deposit({ value: 1 })).to.be.revertedWithCustomError(bank, "MaxTotalDepositsExceeded");
    });

    it("Should allow deposits above the global cap when the cap is disabled", async function () {
      await bank.connect(owner).setMaxTotalDeposits(0);

      await bank.connect(addr1).deposit({ value: ethers.parseEther("2") });
      await bank.connect(addr2).deposit({ value: ethers.parseEther("3") });

      expect(await bank.totalDeposits()).to.equal(ethers.parseEther("5"));
    });

    it("Should not block funded interest claims when the global deposit cap is full", async function () {
      const maxTotalDeposits = ethers.parseEther("1000");
      await bank.connect(owner).setMaxTotalDeposits(maxTotalDeposits);
      await bank.connect(addr1).deposit({ value: maxTotalDeposits });
      await bank.connect(owner).fundInterestReserve({ value: ethers.parseEther("10") });

      await ethers.provider.send("evm_increaseTime", [86400]);
      await ethers.provider.send("evm_mine");

      const pending = await bank.getPendingInterest(addr1.address);
      expect(pending).to.be.gt(0);

      await bank.connect(addr1).claimInterest();
      expect(await bank.totalDeposits()).to.be.gt(maxTotalDeposits);
    });

    it("Should enforce max deposit after applying funded interest", async function () {
      const maxDeposit = ethers.parseEther("1000");
      await bank.connect(owner).setMaxDeposit(maxDeposit);
      await bank.connect(addr1).deposit({ value: maxDeposit });
      await bank.connect(owner).fundInterestReserve({ value: ethers.parseEther("10") });

      await ethers.provider.send("evm_increaseTime", [86400]);
      await ethers.provider.send("evm_mine");

      await expect(bank.connect(addr1).deposit({ value: 1 })).to.be.revertedWithCustomError(bank, "MaxDepositExceeded");
    });

    it("Should not allow a later deposit to create unfunded interest", async function () {
      const firstDeposit = ethers.parseEther("1000");
      const secondDeposit = ethers.parseEther("1");

      await bank.connect(addr1).deposit({ value: firstDeposit });

      await ethers.provider.send("evm_increaseTime", [86400]);
      await ethers.provider.send("evm_mine");

      await expect(bank.connect(addr1).deposit({ value: secondDeposit })).to.be.revertedWithCustomError(bank, "InsufficientInterestReserve");
      expect(await bank.connect(addr1).getBalance()).to.equal(firstDeposit);
      expect(await bank.totalDeposits()).to.equal(firstDeposit);
      expect(await bank.getContractBalance()).to.equal(firstDeposit);
    });
  });

  describe("Withdrawals", function () {
    beforeEach(async function () {
      const depositAmount = ethers.parseEther("1.0");
      await bank.connect(addr1).deposit({ value: depositAmount });
    });

    it("Should allow full withdrawal after the lock period", async function () {
      const amount = ethers.parseEther("1.0");

      await ethers.provider.send("evm_increaseTime", [lockDuration]);
      await ethers.provider.send("evm_mine");

      await bank.connect(addr1).withdraw(amount);

      expect(await bank.connect(addr1).getBalance()).to.equal(0n);
    });

    it("Should allow partial withdrawal after the lock period", async function () {
      const withdrawAmount = ethers.parseEther("0.5");

      await ethers.provider.send("evm_increaseTime", [lockDuration]);
      await ethers.provider.send("evm_mine");

      await bank.connect(addr1).withdraw(withdrawAmount);

      expect(await bank.connect(addr1).getBalance()).to.equal(ethers.parseEther("0.5"));
    });

    it("Should reject withdrawals before the lock period expires", async function () {
      await expect(bank.connect(addr1).withdraw(ethers.parseEther("0.1"))).to.be.revertedWithCustomError(bank, "WithdrawalLocked");
    });

    it("Should emit Withdrawal event", async function () {
      const withdrawAmount = ethers.parseEther("0.5");

      await ethers.provider.send("evm_increaseTime", [lockDuration]);
      await ethers.provider.send("evm_mine");

      await expect(bank.connect(addr1).withdraw(withdrawAmount))
        .to.emit(bank, "WithdrawalMade")
        .withArgs(addr1.address, withdrawAmount);
    });

    it("Should reject withdrawal exceeding balance", async function () {
      const withdrawAmount = ethers.parseEther("2.0");

      await ethers.provider.send("evm_increaseTime", [lockDuration]);
      await ethers.provider.send("evm_mine");

      await expect(bank.connect(addr1).withdraw(withdrawAmount)).to.be.revertedWithCustomError(bank, "InsufficientBalance");
    });

    it("Should reject zero withdrawal", async function () {
      await expect(bank.connect(addr1).withdraw(0)).to.be.revertedWithCustomError(bank, "ZeroWithdrawal");
    });
  });

  describe("Interest", function () {
    it("Should apply interest after 1 day", async function () {
      const depositAmount = ethers.parseEther("1000");
      const reserveAmount = ethers.parseEther("10");

      await bank.connect(addr1).deposit({ value: depositAmount });
      await bank.connect(owner).fundInterestReserve({ value: reserveAmount });

      await ethers.provider.send("evm_increaseTime", [86400]);
      await ethers.provider.send("evm_mine");

      const pending = await bank.getPendingInterest(addr1.address);
      expect(pending).to.be.gt(0);
      expect(await bank.getClaimableInterest(addr1.address)).to.equal(pending);

      await bank.connect(addr1).claimInterest();

      const newBalance = await bank.connect(addr1).getBalance();
      expect(newBalance).to.be.gt(depositAmount);
      expect(await bank.getContractBalance()).to.equal((await bank.totalDeposits()) + (await bank.interestReserve()));
      expect(await bank.interestReserve()).to.be.lt(reserveAmount);
    });

    it("Should not allow claiming before 1 day", async function () {
      const depositAmount = ethers.parseEther("1000");

      await bank.connect(addr1).deposit({ value: depositAmount });

      await expect(bank.connect(addr1).claimInterest()).to.be.revertedWithCustomError(bank, "NoInterestYet");
    });

    it("Should not credit unfunded interest", async function () {
      const depositAmount = ethers.parseEther("1000");

      await bank.connect(addr1).deposit({ value: depositAmount });

      await ethers.provider.send("evm_increaseTime", [86400]);
      await ethers.provider.send("evm_mine");

      expect(await bank.getPendingInterest(addr1.address)).to.be.gt(0);
      expect(await bank.getClaimableInterest(addr1.address)).to.equal(0n);

      await expect(bank.connect(addr1).claimInterest()).to.be.revertedWithCustomError(bank, "InsufficientInterestReserve");
      expect(await bank.connect(addr1).getBalance()).to.equal(depositAmount);
      expect(await bank.totalDeposits()).to.equal(depositAmount);
      expect(await bank.getContractBalance()).to.equal(depositAmount);
    });

    it("Should emit InterestClaimed event", async function () {
      const depositAmount = ethers.parseEther("1000");

      await bank.connect(addr1).deposit({ value: depositAmount });
      await bank.connect(owner).fundInterestReserve({ value: ethers.parseEther("10") });

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

      await expect(bank.connect(owner).setInterestRate(501)).to.be.revertedWithCustomError(bank, "RateTooHigh");
    });

    it("Should reject non-owner", async function () {
      await expect(bank.connect(addr1).setInterestRate(200)).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should use two-step ownership transfer", async function () {
      await expect(bank.connect(owner).transferOwnership(addr1.address))
        .to.emit(bank, "OwnershipTransferStarted")
        .withArgs(owner.address, addr1.address);

      expect(await bank.owner()).to.equal(owner.address);
      expect(await bank.pendingOwner()).to.equal(addr1.address);

      await expect(bank.connect(addr2).acceptOwnership()).to.be.revertedWith("Ownable2Step: caller is not the new owner");

      await expect(bank.connect(addr1).acceptOwnership())
        .to.emit(bank, "OwnershipTransferred")
        .withArgs(owner.address, addr1.address);

      expect(await bank.owner()).to.equal(addr1.address);
      expect(await bank.pendingOwner()).to.equal(ethers.ZeroAddress);
      await expect(bank.connect(owner).setInterestRate(200)).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should reject ownership transfer to the zero address", async function () {
      await expect(bank.connect(owner).transferOwnership(ethers.ZeroAddress)).to.be.revertedWithCustomError(bank, "ZeroOwner");
    });

    it("Should disable renouncing ownership", async function () {
      await expect(bank.connect(owner).renounceOwnership()).to.be.revertedWithCustomError(bank, "RenounceOwnershipDisabled");
      expect(await bank.owner()).to.equal(owner.address);
    });

    it("Should allow owner to pause deposits and claims while leaving withdrawals available", async function () {
      const depositAmount = ethers.parseEther("1.0");
      const reserveAmount = ethers.parseEther("1.0");

      await bank.connect(addr1).deposit({ value: depositAmount });
      await bank.connect(owner).fundInterestReserve({ value: reserveAmount });

      await ethers.provider.send("evm_increaseTime", [lockDuration]);
      await ethers.provider.send("evm_mine");

      await bank.connect(owner).pause();
      expect(await bank.paused()).to.equal(true);

      await expect(bank.connect(addr1).deposit({ value: 1 })).to.be.revertedWith("Pausable: paused");
      await expect(bank.connect(addr1).claimInterest()).to.be.revertedWith("Pausable: paused");

      await bank.connect(addr1).withdraw(depositAmount);
      expect(await bank.connect(addr1).getBalance()).to.equal(0n);

      await bank.connect(owner).unpause();
      expect(await bank.paused()).to.equal(false);
    });

    it("Should allow owner to change withdrawal lock duration", async function () {
      await bank.connect(owner).setWithdrawalLockDays(3);
      expect(await bank.withdrawalLockDays()).to.equal(3);
    });

    it("Should reject withdrawal lock duration outside the allowed range", async function () {
      const maxLockDays = await bank.MAX_WITHDRAWAL_LOCK_DAYS();

      await expect(bank.connect(owner).setWithdrawalLockDays(0)).to.be.revertedWithCustomError(bank, "WithdrawalLockOutOfRange");
      await expect(bank.connect(owner).setWithdrawalLockDays(maxLockDays + 1n)).to.be.revertedWithCustomError(bank, "WithdrawalLockOutOfRange");
    });

    it("Should reject admin deposit limits that exceed storage bounds", async function () {
      const tooHigh = 1n << 128n;

      await expect(bank.connect(owner).setMaxDeposit(tooHigh)).to.be.revertedWithCustomError(bank, "DepositLimitTooHigh");
      await expect(bank.connect(owner).setMinDeposit(tooHigh)).to.be.revertedWithCustomError(bank, "DepositLimitTooHigh");
    });

    it("Should keep min deposit below max deposit when a max is active", async function () {
      await bank.connect(owner).setMaxDeposit(ethers.parseEther("1"));
      await expect(bank.connect(owner).setMinDeposit(ethers.parseEther("2"))).to.be.revertedWithCustomError(bank, "MinDepositExceedsMaxDeposit");

      await bank.connect(owner).setMinDeposit(ethers.parseEther("0.5"));
      await expect(bank.connect(owner).setMaxDeposit(ethers.parseEther("0.25"))).to.be.revertedWithCustomError(bank, "MinDepositExceedsMaxDeposit");
    });

    it("Should allow owner to fund the interest reserve", async function () {
      const reserveAmount = ethers.parseEther("1.0");

      await expect(bank.connect(owner).fundInterestReserve({ value: reserveAmount }))
        .to.emit(bank, "InterestReserveFunded")
        .withArgs(owner.address, reserveAmount);

      expect(await bank.interestReserve()).to.equal(reserveAmount);
      expect(await bank.getContractBalance()).to.equal(reserveAmount);
      expect(await bank.getRecoverableETH()).to.equal(0n);
    });

    it("Should reject zero interest reserve funding", async function () {
      await expect(bank.connect(owner).fundInterestReserve({ value: 0 })).to.be.revertedWithCustomError(bank, "ZeroFunding");
    });

    it("Should not allow owner to recover user deposits or the interest reserve", async function () {
      const depositAmount = ethers.parseEther("1.0");
      const reserveAmount = ethers.parseEther("0.5");

      await bank.connect(addr1).deposit({ value: depositAmount });
      await bank.connect(owner).fundInterestReserve({ value: reserveAmount });

      expect(await bank.getRecoverableETH()).to.equal(0n);
      await expect(bank.connect(owner).recoverETH(1)).to.be.revertedWithCustomError(bank, "NoRecoverableSurplus");
    });

    it("Should reject zero ETH recovery", async function () {
      await expect(bank.connect(owner).recoverETH(0)).to.be.revertedWithCustomError(bank, "ZeroRecovery");
    });

    it("Should allow owner to recover only surplus ETH", async function () {
      const depositAmount = ethers.parseEther("1.0");
      const surplusAmount = ethers.parseEther("0.25");

      await bank.connect(addr1).deposit({ value: depositAmount });
      await ethers.provider.send("hardhat_setBalance", [
        await bank.getAddress(),
        ethers.toBeHex(depositAmount + surplusAmount),
      ]);

      expect(await bank.getRecoverableETH()).to.equal(surplusAmount);

      await expect(bank.connect(owner).recoverETH(surplusAmount))
        .to.emit(bank, "ETHRecovered")
        .withArgs(owner.address, surplusAmount);

      expect(await bank.getRecoverableETH()).to.equal(0n);
    });
  });

  describe("Receive function", function () {
    it("Should accept direct ETH transfers", async function () {
      const sendAmount = ethers.parseEther("1.0");

      await addr1.sendTransaction({
        to: await bank.getAddress(),
        value: sendAmount,
      });

      expect(await bank.connect(addr1).getBalance()).to.equal(sendAmount);
      expect(await bank.getContractBalance()).to.equal(sendAmount);
    });
  });
});
