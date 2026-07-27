const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SimpleWETHYieldVault", function () {
  let weth, vault, owner, user, user2, treasury;
  const performanceFeeBps = 1000n;
  const noCap = 0;

  beforeEach(async function () {
    [owner, user, user2, treasury] = await ethers.getSigners();

    const MockWETH = await ethers.getContractFactory("MockWETH");
    weth = await MockWETH.deploy();
    await weth.waitForDeployment();

    const SimpleWETHYieldVault = await ethers.getContractFactory("SimpleWETHYieldVault");
    vault = await SimpleWETHYieldVault.deploy(
      await weth.getAddress(),
      owner.address,
      treasury.address,
      performanceFeeBps,
      noCap
    );
    await vault.waitForDeployment();
  });

  describe("Deployment", function () {
    it("sets WETH asset, owner, treasury, and performance fee", async function () {
      expect(await vault.asset()).to.equal(await weth.getAddress());
      expect(await vault.weth()).to.equal(await weth.getAddress());
      expect(await vault.owner()).to.equal(owner.address);
      expect(await vault.treasury()).to.equal(treasury.address);
      expect(await vault.performanceFeeBps()).to.equal(performanceFeeBps);
      expect(await vault.maxTotalAssets()).to.equal(0n);
      expect(await vault.name()).to.equal("SimpleBank WETH Yield Vault");
      expect(await vault.symbol()).to.equal("sbWETH");
    });

    it("rejects invalid constructor parameters", async function () {
      const SimpleWETHYieldVault = await ethers.getContractFactory("SimpleWETHYieldVault");

      await expect(
        SimpleWETHYieldVault.deploy(ethers.ZeroAddress, owner.address, treasury.address, 0, 0)
      ).to.be.revertedWithCustomError(vault, "ZeroAddress");
      await expect(
        SimpleWETHYieldVault.deploy(await weth.getAddress(), owner.address, treasury.address, 2001, 0)
      ).to.be.revertedWithCustomError(vault, "FeeTooHigh");
    });
  });

  describe("Deposits and withdrawals", function () {
    it("accepts ETH deposits by wrapping to WETH and minting shares", async function () {
      const amount = ethers.parseEther("1");

      await expect(vault.connect(user).depositETH(user.address, { value: amount }))
        .to.emit(vault, "Deposit");

      expect(await vault.totalAssets()).to.equal(amount);
      expect(await weth.balanceOf(await vault.getAddress())).to.equal(amount);
      expect(await vault.balanceOf(user.address)).to.be.gt(0n);
      expect(await vault.accountedAssets()).to.equal(amount);
      expect(await ethers.provider.getBalance(await vault.getAddress())).to.equal(0n);
    });

    it("supports standard ERC4626 WETH deposits", async function () {
      const amount = ethers.parseEther("2");
      await weth.connect(user).deposit({ value: amount });
      await weth.connect(user).approve(await vault.getAddress(), amount);

      await vault.connect(user).deposit(amount, user.address);

      expect(await vault.totalAssets()).to.equal(amount);
      expect(await weth.balanceOf(user.address)).to.equal(0n);
      expect(await vault.balanceOf(user.address)).to.be.gt(0n);
    });

    it("redeems shares back to ETH", async function () {
      const amount = ethers.parseEther("1");
      await vault.connect(user).depositETH(user.address, { value: amount });
      const shares = await vault.balanceOf(user.address);

      await expect(vault.connect(user).redeemETH(shares, user.address, user.address))
        .to.emit(vault, "Withdraw");

      expect(await vault.balanceOf(user.address)).to.equal(0n);
      expect(await vault.totalAssets()).to.equal(0n);
      expect(await weth.balanceOf(await vault.getAddress())).to.equal(0n);
      expect(await vault.accountedAssets()).to.equal(0n);
    });

    it("rejects direct ETH transfers outside the depositETH flow", async function () {
      await expect(
        user.sendTransaction({
          to: await vault.getAddress(),
          value: ethers.parseEther("0.1"),
        })
      ).to.be.revertedWithCustomError(vault, "DirectETHUnsupported");
    });
  });

  describe("Caps and owner controls", function () {
    it("enforces max total assets on ETH deposits", async function () {
      const cap = ethers.parseEther("1");
      await vault.connect(owner).setMaxTotalAssets(cap);

      await vault.connect(user).depositETH(user.address, { value: cap });

      await expect(
        vault.connect(user2).depositETH(user2.address, { value: 1 })
      ).to.be.revertedWithCustomError(vault, "MaxTotalAssetsExceeded");
    });

    it("enforces max total assets on WETH deposits", async function () {
      const cap = ethers.parseEther("1");
      await vault.connect(owner).setMaxTotalAssets(cap);
      await weth.connect(user).deposit({ value: cap + 1n });
      await weth.connect(user).approve(await vault.getAddress(), cap + 1n);

      await expect(vault.connect(user).deposit(cap + 1n, user.address))
        .to.be.revertedWithCustomError(vault, "MaxTotalAssetsExceeded");
    });

    it("allows owner to update treasury, performance fee, and cap", async function () {
      await expect(vault.connect(owner).setTreasury(user2.address))
        .to.emit(vault, "TreasuryUpdated")
        .withArgs(treasury.address, user2.address);
      await expect(vault.connect(owner).setPerformanceFeeBps(500))
        .to.emit(vault, "PerformanceFeeUpdated")
        .withArgs(performanceFeeBps, 500);
      await expect(vault.connect(owner).setMaxTotalAssets(ethers.parseEther("5")))
        .to.emit(vault, "MaxTotalAssetsUpdated")
        .withArgs(0, ethers.parseEther("5"));

      expect(await vault.treasury()).to.equal(user2.address);
      expect(await vault.performanceFeeBps()).to.equal(500n);
      expect(await vault.maxTotalAssets()).to.equal(ethers.parseEther("5"));
    });

    it("rejects performance fees above cap and non-owner updates", async function () {
      await expect(vault.connect(owner).setPerformanceFeeBps(2001))
        .to.be.revertedWithCustomError(vault, "FeeTooHigh");
      await expect(vault.connect(user).setPerformanceFeeBps(100))
        .to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("Yield and performance fees", function () {
    it("mints performance fee shares to treasury when yield is donated", async function () {
      const depositAmount = ethers.parseEther("10");
      const yieldAmount = ethers.parseEther("1");

      await vault.connect(user).depositETH(user.address, { value: depositAmount });
      await expect(vault.connect(user2).donateYieldETH({ value: yieldAmount }))
        .to.emit(vault, "YieldDonated")
        .withArgs(user2.address, yieldAmount);

      expect(await vault.totalAssets()).to.equal(depositAmount + yieldAmount);
      expect(await vault.balanceOf(treasury.address)).to.equal(0n);

      await expect(vault.connect(user).harvestPerformanceFee())
        .to.emit(vault, "PerformanceFeeAccrued");

      const treasuryShares = await vault.balanceOf(treasury.address);
      expect(treasuryShares).to.be.gt(0n);
      expect(await vault.convertToAssets(treasuryShares)).to.be.gt(ethers.parseEther("0.09"));
      expect(await vault.accountedAssets()).to.equal(await vault.totalAssets());
    });

    it("does not accrue performance fees when there is no gain", async function () {
      await vault.connect(user).depositETH(user.address, { value: ethers.parseEther("1") });

      await vault.connect(user).harvestPerformanceFee();

      expect(await vault.balanceOf(treasury.address)).to.equal(0n);
      expect(await vault.accountedAssets()).to.equal(await vault.totalAssets());
    });

    it("crystallizes pending fee before new deposits", async function () {
      await vault.connect(user).depositETH(user.address, { value: ethers.parseEther("10") });
      await vault.connect(user2).donateYieldETH({ value: ethers.parseEther("1") });

      await vault.connect(user2).depositETH(user2.address, { value: ethers.parseEther("1") });

      expect(await vault.balanceOf(treasury.address)).to.be.gt(0n);
      expect(await vault.accountedAssets()).to.equal(await vault.totalAssets());
    });
  });
});
