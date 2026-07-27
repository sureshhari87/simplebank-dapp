const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SimpleLendingPool", function () {
  let pool, owner, lender, lender2, borrower, treasury, liquidator;

  const borrowAprBps = 1000n;
  const originationFeeBps = 100n;
  const noCap = 0n;

  async function deployPool() {
    const SimpleLendingPool = await ethers.getContractFactory("SimpleLendingPool");
    pool = await SimpleLendingPool.deploy(
      owner.address,
      treasury.address,
      borrowAprBps,
      originationFeeBps,
      noCap
    );
    await pool.waitForDeployment();
  }

  async function increaseTime(seconds) {
    await ethers.provider.send("evm_increaseTime", [seconds]);
    await ethers.provider.send("evm_mine", []);
  }

  beforeEach(async function () {
    [owner, lender, lender2, borrower, treasury, liquidator] = await ethers.getSigners();
    await deployPool();
  });

  describe("Deployment", function () {
    it("sets owner, treasury, fees, and default risk parameters", async function () {
      expect(await pool.owner()).to.equal(owner.address);
      expect(await pool.treasury()).to.equal(treasury.address);
      expect(await pool.borrowAprBps()).to.equal(borrowAprBps);
      expect(await pool.originationFeeBps()).to.equal(originationFeeBps);
      expect(await pool.maxLtvBps()).to.equal(6000n);
      expect(await pool.liquidationThresholdBps()).to.equal(8000n);
      expect(await pool.liquidationBonusBps()).to.equal(500n);
    });

    it("rejects invalid constructor parameters", async function () {
      const SimpleLendingPool = await ethers.getContractFactory("SimpleLendingPool");

      await expect(
        SimpleLendingPool.deploy(ethers.ZeroAddress, treasury.address, borrowAprBps, originationFeeBps, noCap)
      ).to.be.revertedWithCustomError(pool, "ZeroAddress");

      await expect(
        SimpleLendingPool.deploy(owner.address, treasury.address, 5001, originationFeeBps, noCap)
      ).to.be.revertedWithCustomError(pool, "RateTooHigh");

      await expect(
        SimpleLendingPool.deploy(owner.address, treasury.address, borrowAprBps, 101, noCap)
      ).to.be.revertedWithCustomError(pool, "FeeTooHigh");
    });
  });

  describe("Supply liquidity", function () {
    it("mints supply shares and allows withdrawal while liquidity is available", async function () {
      const supplied = ethers.parseEther("5");

      await expect(pool.connect(lender).supply({ value: supplied }))
        .to.emit(pool, "Supplied")
        .withArgs(lender.address, supplied, supplied);

      expect(await pool.totalSupplyShares()).to.equal(supplied);
      expect(await pool.supplyShares(lender.address)).to.equal(supplied);
      expect(await pool.supplyBalanceOf(lender.address)).to.equal(supplied);
      expect(await pool.availableLiquidity()).to.equal(supplied);

      const sharesToWithdraw = ethers.parseEther("2");
      await expect(pool.connect(lender).withdrawSupply(sharesToWithdraw))
        .to.emit(pool, "SupplyWithdrawn")
        .withArgs(lender.address, sharesToWithdraw, sharesToWithdraw);

      expect(await pool.supplyShares(lender.address)).to.equal(ethers.parseEther("3"));
      expect(await pool.totalAssets()).to.equal(ethers.parseEther("3"));
    });

    it("enforces the pool liquidity cap and pause on new supply", async function () {
      await pool.connect(owner).setMaxPoolLiquidity(ethers.parseEther("1"));
      await pool.connect(lender).supply({ value: ethers.parseEther("1") });

      await expect(pool.connect(lender2).supply({ value: 1 }))
        .to.be.revertedWithCustomError(pool, "MaxPoolLiquidityExceeded");

      await pool.connect(owner).pause();
      await expect(pool.connect(lender2).supply({ value: 1 }))
        .to.be.revertedWith("Pausable: paused");
    });

    it("treats direct ETH sends as supply", async function () {
      await lender.sendTransaction({
        to: await pool.getAddress(),
        value: ethers.parseEther("1"),
      });

      expect(await pool.supplyShares(lender.address)).to.equal(ethers.parseEther("1"));
      expect(await pool.totalAssets()).to.equal(ethers.parseEther("1"));
    });
  });

  describe("Borrowing and repayment", function () {
    it("allows overcollateralized borrowing and keeps origination fees out of lender liquidity", async function () {
      await pool.connect(lender).supply({ value: ethers.parseEther("10") });

      await expect(
        pool.connect(borrower).borrowWithCollateral(ethers.parseEther("1"), { value: ethers.parseEther("2") })
      )
        .to.emit(pool, "Borrowed")
        .withArgs(borrower.address, ethers.parseEther("1"), ethers.parseEther("0.01"), ethers.parseEther("0.99"));

      const loan = await pool.loans(borrower.address);
      expect(loan.collateral).to.equal(ethers.parseEther("2"));
      expect(loan.debt).to.equal(ethers.parseEther("1"));
      expect(await pool.protocolFees()).to.equal(ethers.parseEther("0.01"));
      expect(await pool.availableLiquidity()).to.equal(ethers.parseEther("9"));
      expect(await pool.totalAssets()).to.equal(ethers.parseEther("10"));
    });

    it("rejects borrows above the configured LTV", async function () {
      await pool.connect(lender).supply({ value: ethers.parseEther("10") });
      await pool.connect(borrower).depositCollateral({ value: ethers.parseEther("1") });

      await expect(pool.connect(borrower).borrow(ethers.parseEther("0.7")))
        .to.be.revertedWithCustomError(pool, "BorrowLimitExceeded");
    });

    it("accrues borrower interest to suppliers and releases collateral after repayment", async function () {
      await pool.connect(lender).supply({ value: ethers.parseEther("10") });
      await pool.connect(borrower).borrowWithCollateral(ethers.parseEther("1"), { value: ethers.parseEther("2") });

      await increaseTime(365 * 24 * 60 * 60);
      const debt = await pool.previewDebt(borrower.address);
      expect(debt).to.equal(ethers.parseEther("1.1"));

      await expect(pool.connect(borrower).repay({ value: debt + ethers.parseEther("0.001") }))
        .to.emit(pool, "InterestAccrued")
        .and.to.emit(pool, "Repaid");

      expect(await pool.totalBorrowDebt()).to.equal(0n);
      expect(await pool.supplyBalanceOf(lender.address)).to.be.gte(ethers.parseEther("10.1"));

      const lenderShares = await pool.supplyShares(lender.address);
      await pool.connect(lender).withdrawSupply(lenderShares);
      await expect(pool.connect(borrower).withdrawCollateral(ethers.parseEther("2")))
        .to.emit(pool, "CollateralWithdrawn")
        .withArgs(borrower.address, ethers.parseEther("2"));
    });

    it("refunds overpayment when a borrower repays more than owed", async function () {
      await pool.connect(lender).supply({ value: ethers.parseEther("10") });
      await pool.connect(borrower).borrowWithCollateral(ethers.parseEther("1"), { value: ethers.parseEther("2") });

      await pool.connect(borrower).repay({ value: ethers.parseEther("2") });

      const loan = await pool.loans(borrower.address);
      expect(loan.debt).to.equal(0n);
      expect(await pool.totalBorrowDebt()).to.equal(0n);
    });
  });

  describe("Liquidation", function () {
    beforeEach(async function () {
      await pool.connect(owner).setBorrowAprBps(5000);
      await pool.connect(owner).setRiskParameters(8000, 8000, 500);
      await pool.connect(lender).supply({ value: ethers.parseEther("10") });
      await pool.connect(borrower).borrowWithCollateral(ethers.parseEther("0.79"), {
        value: ethers.parseEther("1"),
      });
    });

    it("rejects liquidation while the loan is healthy", async function () {
      await expect(pool.connect(liquidator).liquidate(borrower.address, { value: ethers.parseEther("0.1") }))
        .to.be.revertedWithCustomError(pool, "HealthyLoan");
    });

    it("allows liquidation after interest pushes debt past the threshold", async function () {
      await increaseTime(10 * 24 * 60 * 60);

      expect(await pool.isLiquidatable(borrower.address)).to.equal(true);

      await expect(pool.connect(liquidator).liquidate(borrower.address, { value: ethers.parseEther("0.1") }))
        .to.emit(pool, "Liquidated")
        .withArgs(borrower.address, liquidator.address, ethers.parseEther("0.1"), ethers.parseEther("0.105"));

      const loan = await pool.loans(borrower.address);
      expect(loan.collateral).to.equal(ethers.parseEther("0.895"));
      expect(loan.debt).to.be.lt(ethers.parseEther("0.71"));
    });
  });

  describe("Owner controls and fees", function () {
    it("allows owner to update treasury, rates, risk, and cap", async function () {
      await expect(pool.connect(owner).setTreasury(lender2.address))
        .to.emit(pool, "TreasuryUpdated")
        .withArgs(treasury.address, lender2.address);
      await expect(pool.connect(owner).setBorrowAprBps(500))
        .to.emit(pool, "BorrowAprUpdated")
        .withArgs(borrowAprBps, 500);
      await expect(pool.connect(owner).setOriginationFeeBps(10))
        .to.emit(pool, "OriginationFeeUpdated")
        .withArgs(originationFeeBps, 10);
      await expect(pool.connect(owner).setRiskParameters(5000, 7500, 300))
        .to.emit(pool, "RiskParametersUpdated")
        .withArgs(5000, 7500, 300);
      await expect(pool.connect(owner).setMaxPoolLiquidity(ethers.parseEther("2")))
        .to.emit(pool, "MaxPoolLiquidityUpdated")
        .withArgs(noCap, ethers.parseEther("2"));
    });

    it("rejects invalid owner updates and non-owner updates", async function () {
      await expect(pool.connect(lender).setBorrowAprBps(1))
        .to.be.revertedWith("Ownable: caller is not the owner");
      await expect(pool.connect(owner).setTreasury(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(pool, "ZeroAddress");
      await expect(pool.connect(owner).setBorrowAprBps(5001))
        .to.be.revertedWithCustomError(pool, "RateTooHigh");
      await expect(pool.connect(owner).setOriginationFeeBps(101))
        .to.be.revertedWithCustomError(pool, "FeeTooHigh");
      await expect(pool.connect(owner).setRiskParameters(8500, 8000, 500))
        .to.be.revertedWithCustomError(pool, "InvalidRiskParameters");
    });

    it("allows owner to claim collected origination fees", async function () {
      await pool.connect(lender).supply({ value: ethers.parseEther("10") });
      await pool.connect(borrower).borrowWithCollateral(ethers.parseEther("1"), { value: ethers.parseEther("2") });

      await expect(pool.connect(owner).claimProtocolFees())
        .to.emit(pool, "ProtocolFeesClaimed")
        .withArgs(treasury.address, ethers.parseEther("0.01"));

      expect(await pool.protocolFees()).to.equal(0n);
      expect(await pool.availableLiquidity()).to.equal(ethers.parseEther("9"));
    });

    it("disables renouncing ownership", async function () {
      await expect(pool.connect(owner).renounceOwnership())
        .to.be.revertedWithCustomError(pool, "RenounceOwnershipDisabled");
    });
  });
});
