const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SimpleWETHYieldVaultV2", function () {
  let weth, vault, strategy, owner, user, user2, treasury;
  const performanceFeeBps = 1000n;
  const noCap = 0;

  beforeEach(async function () {
    [owner, user, user2, treasury] = await ethers.getSigners();

    const MockWETH = await ethers.getContractFactory("MockWETH");
    weth = await MockWETH.deploy();
    await weth.waitForDeployment();

    const SimpleWETHYieldVaultV2 = await ethers.getContractFactory("SimpleWETHYieldVaultV2");
    vault = await SimpleWETHYieldVaultV2.deploy(
      await weth.getAddress(),
      owner.address,
      treasury.address,
      performanceFeeBps,
      noCap
    );
    await vault.waitForDeployment();

    const MockYieldStrategy = await ethers.getContractFactory("MockYieldStrategy");
    strategy = await MockYieldStrategy.deploy(await weth.getAddress(), await vault.getAddress());
    await strategy.waitForDeployment();
  });

  async function setStrategy() {
    await vault.connect(owner).setStrategy(await strategy.getAddress());
  }

  describe("Deployment and strategy configuration", function () {
    it("sets WETH asset, owner, treasury, and no strategy by default", async function () {
      expect(await vault.asset()).to.equal(await weth.getAddress());
      expect(await vault.weth()).to.equal(await weth.getAddress());
      expect(await vault.owner()).to.equal(owner.address);
      expect(await vault.treasury()).to.equal(treasury.address);
      expect(await vault.performanceFeeBps()).to.equal(performanceFeeBps);
      expect(await vault.strategy()).to.equal(ethers.ZeroAddress);
      expect(await vault.name()).to.equal("SimpleBank Strategy WETH Vault");
      expect(await vault.symbol()).to.equal("sbWETH2");
    });

    it("allows the owner to set a compatible strategy", async function () {
      await expect(vault.connect(owner).setStrategy(await strategy.getAddress()))
        .to.emit(vault, "StrategyUpdated")
        .withArgs(ethers.ZeroAddress, await strategy.getAddress());

      expect(await vault.strategy()).to.equal(await strategy.getAddress());
    });

    it("rejects a strategy with a different asset", async function () {
      const MockWETH = await ethers.getContractFactory("MockWETH");
      const otherWeth = await MockWETH.deploy();
      await otherWeth.waitForDeployment();

      const MockYieldStrategy = await ethers.getContractFactory("MockYieldStrategy");
      const wrongStrategy = await MockYieldStrategy.deploy(await otherWeth.getAddress(), await vault.getAddress());
      await wrongStrategy.waitForDeployment();

      await expect(vault.connect(owner).setStrategy(await wrongStrategy.getAddress()))
        .to.be.revertedWithCustomError(vault, "StrategyAssetMismatch")
        .withArgs(await weth.getAddress(), await otherWeth.getAddress());
    });
  });

  describe("Strategy allocation", function () {
    it("invests idle WETH while preserving totalAssets accounting", async function () {
      const depositAmount = ethers.parseEther("10");
      const investedAmount = ethers.parseEther("6");

      await vault.connect(user).depositETH(user.address, { value: depositAmount });
      await setStrategy();

      await expect(vault.connect(owner).invest(investedAmount))
        .to.emit(vault, "StrategyInvested")
        .withArgs(await strategy.getAddress(), investedAmount);

      expect(await vault.totalAssets()).to.equal(depositAmount);
      expect(await vault.idleAssets()).to.equal(ethers.parseEther("4"));
      expect(await vault.strategyAssets()).to.equal(investedAmount);
      expect(await weth.balanceOf(await vault.getAddress())).to.equal(ethers.parseEther("4"));
      expect(await weth.balanceOf(await strategy.getAddress())).to.equal(investedAmount);
      expect(await vault.accountedAssets()).to.equal(depositAmount);
    });

    it("pulls WETH from the strategy when redeeming back to ETH", async function () {
      const depositAmount = ethers.parseEther("10");
      const investedAmount = ethers.parseEther("6");
      const withdrawAmount = ethers.parseEther("7");
      const strategyShortfall = ethers.parseEther("3");

      await vault.connect(user).depositETH(user.address, { value: depositAmount });
      await setStrategy();
      await vault.connect(owner).invest(investedAmount);

      await expect(vault.connect(user).withdrawETH(withdrawAmount, user.address, user.address))
        .to.emit(vault, "StrategyDivested")
        .withArgs(await strategy.getAddress(), strategyShortfall, strategyShortfall);

      expect(await vault.totalAssets()).to.equal(ethers.parseEther("3"));
      expect(await vault.idleAssets()).to.equal(0n);
      expect(await vault.strategyAssets()).to.equal(ethers.parseEther("3"));
      expect(await vault.accountedAssets()).to.equal(ethers.parseEther("3"));
      expect(await ethers.provider.getBalance(await vault.getAddress())).to.equal(0n);
    });

    it("supports standard ERC4626 WETH withdrawals from invested funds", async function () {
      const depositAmount = ethers.parseEther("2");
      const withdrawAmount = ethers.parseEther("1.5");

      await weth.connect(user).deposit({ value: depositAmount });
      await weth.connect(user).approve(await vault.getAddress(), depositAmount);
      await vault.connect(user).deposit(depositAmount, user.address);
      await setStrategy();
      await vault.connect(owner).invest(depositAmount);

      await vault.connect(user).withdraw(withdrawAmount, user2.address, user.address);

      expect(await weth.balanceOf(user2.address)).to.equal(withdrawAmount);
      expect(await vault.totalAssets()).to.equal(ethers.parseEther("0.5"));
      expect(await vault.idleAssets()).to.equal(0n);
      expect(await vault.strategyAssets()).to.equal(ethers.parseEther("0.5"));
    });

    it("harvests performance fees from strategy yield", async function () {
      const depositAmount = ethers.parseEther("10");
      const yieldAmount = ethers.parseEther("1");

      await vault.connect(user).depositETH(user.address, { value: depositAmount });
      await setStrategy();
      await vault.connect(owner).invest(depositAmount);

      await weth.connect(user2).deposit({ value: yieldAmount });
      await weth.connect(user2).transfer(await strategy.getAddress(), yieldAmount);

      expect(await vault.totalAssets()).to.equal(depositAmount + yieldAmount);
      expect(await vault.balanceOf(treasury.address)).to.equal(0n);

      await expect(vault.connect(user).harvestPerformanceFee())
        .to.emit(vault, "PerformanceFeeAccrued");

      const treasuryShares = await vault.balanceOf(treasury.address);
      expect(treasuryShares).to.be.gt(0n);
      expect(await vault.convertToAssets(treasuryShares)).to.be.gt(ethers.parseEther("0.09"));
      expect(await vault.accountedAssets()).to.equal(await vault.totalAssets());
    });

    it("does not switch strategies while the current strategy holds assets", async function () {
      const depositAmount = ethers.parseEther("1");

      await vault.connect(user).depositETH(user.address, { value: depositAmount });
      await setStrategy();
      await vault.connect(owner).invest(depositAmount);

      const MockYieldStrategy = await ethers.getContractFactory("MockYieldStrategy");
      const nextStrategy = await MockYieldStrategy.deploy(await weth.getAddress(), await vault.getAddress());
      await nextStrategy.waitForDeployment();

      await expect(vault.connect(owner).setStrategy(await nextStrategy.getAddress()))
        .to.be.revertedWithCustomError(vault, "StrategyHasAssets")
        .withArgs(await strategy.getAddress(), depositAmount);

      await vault.connect(owner).divestAll();
      await expect(vault.connect(owner).setStrategy(await nextStrategy.getAddress()))
        .to.emit(vault, "StrategyUpdated")
        .withArgs(await strategy.getAddress(), await nextStrategy.getAddress());
    });

    it("enforces the cap across idle and invested assets", async function () {
      const cap = ethers.parseEther("1");
      await vault.connect(owner).setMaxTotalAssets(cap);
      await vault.connect(user).depositETH(user.address, { value: cap });
      await setStrategy();
      await vault.connect(owner).invest(ethers.parseEther("0.8"));

      await expect(vault.connect(user2).depositETH(user2.address, { value: 1 }))
        .to.be.revertedWithCustomError(vault, "MaxTotalAssetsExceeded");
    });
  });
});

describe("AaveV3WETHStrategy", function () {
  let weth, aToken, pool, strategy, owner, user, receiver;

  beforeEach(async function () {
    [owner, user, receiver] = await ethers.getSigners();

    const MockWETH = await ethers.getContractFactory("MockWETH");
    weth = await MockWETH.deploy();
    await weth.waitForDeployment();

    const MockAToken = await ethers.getContractFactory("MockAToken");
    aToken = await MockAToken.deploy();
    await aToken.waitForDeployment();

    const MockAaveV3Pool = await ethers.getContractFactory("MockAaveV3Pool");
    pool = await MockAaveV3Pool.deploy(await weth.getAddress(), await aToken.getAddress());
    await pool.waitForDeployment();
    await aToken.setPool(await pool.getAddress());

    const AaveV3WETHStrategy = await ethers.getContractFactory("AaveV3WETHStrategy");
    strategy = await AaveV3WETHStrategy.deploy(
      await weth.getAddress(),
      await aToken.getAddress(),
      await pool.getAddress(),
      owner.address,
      owner.address
    );
    await strategy.waitForDeployment();
  });

  it("supplies transferred WETH into Aave and reports aToken balance as assets", async function () {
    const amount = ethers.parseEther("1");

    await weth.connect(user).deposit({ value: amount });
    await weth.connect(user).transfer(await strategy.getAddress(), amount);

    await expect(strategy.connect(owner).deposit(amount))
      .to.emit(strategy, "StrategyDeposit")
      .withArgs(amount);

    expect(await weth.balanceOf(await strategy.getAddress())).to.equal(0n);
    expect(await aToken.balanceOf(await strategy.getAddress())).to.equal(amount);
    expect(await strategy.totalAssets()).to.equal(amount);
  });

  it("withdraws from Aave back to the requested receiver", async function () {
    const amount = ethers.parseEther("1");
    const withdrawal = ethers.parseEther("0.4");

    await weth.connect(user).deposit({ value: amount });
    await weth.connect(user).transfer(await strategy.getAddress(), amount);
    await strategy.connect(owner).deposit(amount);

    await expect(strategy.connect(owner).withdraw(withdrawal, receiver.address))
      .to.emit(strategy, "StrategyWithdrawal")
      .withArgs(receiver.address, withdrawal);

    expect(await weth.balanceOf(receiver.address)).to.equal(withdrawal);
    expect(await strategy.totalAssets()).to.equal(amount - withdrawal);
  });

  it("withdraws all including accrued mock Aave yield", async function () {
    const amount = ethers.parseEther("1");
    const yieldAmount = ethers.parseEther("0.1");

    await weth.connect(user).deposit({ value: amount + yieldAmount });
    await weth.connect(user).transfer(await strategy.getAddress(), amount);
    await strategy.connect(owner).deposit(amount);

    await weth.connect(user).approve(await pool.getAddress(), yieldAmount);
    await pool.connect(user).accrueYield(await strategy.getAddress(), yieldAmount);

    const expectedAssets = amount + yieldAmount;
    expect(await strategy.totalAssets()).to.equal(expectedAssets);

    await strategy.connect(owner).withdrawAll(receiver.address);

    expect(await weth.balanceOf(receiver.address)).to.equal(expectedAssets);
    expect(await strategy.totalAssets()).to.equal(0n);
  });

  it("restricts adapter calls to the configured vault", async function () {
    await expect(strategy.connect(user).deposit(1))
      .to.be.revertedWithCustomError(strategy, "CallerNotVault")
      .withArgs(user.address);
  });
});
