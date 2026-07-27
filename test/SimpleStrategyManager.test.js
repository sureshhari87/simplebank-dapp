const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SimpleStrategyManager", function () {
  let weth, manager, strategy, strategy2, owner, vault, user, receiver;

  beforeEach(async function () {
    [owner, vault, user, receiver] = await ethers.getSigners();

    const MockWETH = await ethers.getContractFactory("MockWETH");
    weth = await MockWETH.deploy();
    await weth.waitForDeployment();

    const SimpleStrategyManager = await ethers.getContractFactory("SimpleStrategyManager");
    manager = await SimpleStrategyManager.deploy(await weth.getAddress(), vault.address, owner.address);
    await manager.waitForDeployment();

    const MockYieldStrategy = await ethers.getContractFactory("MockYieldStrategy");
    strategy = await MockYieldStrategy.deploy(await weth.getAddress(), await manager.getAddress());
    await strategy.waitForDeployment();
    strategy2 = await MockYieldStrategy.deploy(await weth.getAddress(), await manager.getAddress());
    await strategy2.waitForDeployment();
  });

  async function fundManager(amount) {
    await weth.connect(user).deposit({ value: amount });
    await weth.connect(user).transfer(await manager.getAddress(), amount);
  }

  describe("Strategy configuration", function () {
    it("sets asset, vault, and owner", async function () {
      expect(await manager.asset()).to.equal(await weth.getAddress());
      expect(await manager.vault()).to.equal(vault.address);
      expect(await manager.owner()).to.equal(owner.address);
      expect(await manager.totalAssets()).to.equal(0n);
      expect(await manager.strategyCount()).to.equal(0n);
    });

    it("adds an approved strategy and can make it default", async function () {
      await expect(manager.connect(owner).addStrategy(await strategy.getAddress(), ethers.parseEther("1"), true))
        .to.emit(manager, "StrategyAdded")
        .withArgs(await strategy.getAddress(), ethers.parseEther("1"), true);

      const config = await manager.strategyConfigs(await strategy.getAddress());
      expect(config.approved).to.equal(true);
      expect(config.maxAssets).to.equal(ethers.parseEther("1"));
      expect(await manager.defaultStrategy()).to.equal(await strategy.getAddress());
      expect(await manager.strategyAt(0)).to.equal(await strategy.getAddress());
    });

    it("rejects strategy management from non-owners", async function () {
      await expect(manager.connect(user).addStrategy(await strategy.getAddress(), 0, false))
        .to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("rejects a strategy with the wrong asset", async function () {
      const MockWETH = await ethers.getContractFactory("MockWETH");
      const otherWeth = await MockWETH.deploy();
      await otherWeth.waitForDeployment();

      const MockYieldStrategy = await ethers.getContractFactory("MockYieldStrategy");
      const wrongStrategy = await MockYieldStrategy.deploy(await otherWeth.getAddress(), await manager.getAddress());
      await wrongStrategy.waitForDeployment();

      await expect(manager.connect(owner).addStrategy(await wrongStrategy.getAddress(), 0, false))
        .to.be.revertedWithCustomError(manager, "StrategyAssetMismatch")
        .withArgs(await weth.getAddress(), await otherWeth.getAddress());
    });
  });

  describe("Deposits and allocation", function () {
    it("keeps deposits idle when there is no default strategy", async function () {
      const amount = ethers.parseEther("1");
      await fundManager(amount);

      await expect(manager.connect(vault).deposit(amount))
        .to.emit(manager, "ManagerDeposit")
        .withArgs(amount, 0, amount);

      expect(await manager.idleAssets()).to.equal(amount);
      expect(await manager.totalAssets()).to.equal(amount);
    });

    it("auto-invests vault deposits into the default strategy within cap", async function () {
      const amount = ethers.parseEther("1");
      const cap = ethers.parseEther("0.6");

      await manager.connect(owner).addStrategy(await strategy.getAddress(), cap, true);
      await fundManager(amount);

      await expect(manager.connect(vault).deposit(amount))
        .to.emit(manager, "StrategyInvested")
        .withArgs(await strategy.getAddress(), cap);

      expect(await manager.idleAssets()).to.equal(ethers.parseEther("0.4"));
      expect(await manager.strategyAssets(await strategy.getAddress())).to.equal(cap);
      expect(await manager.totalAssets()).to.equal(amount);
    });

    it("allows owner to invest idle assets manually and enforces strategy caps", async function () {
      const amount = ethers.parseEther("1");
      const cap = ethers.parseEther("0.5");

      await manager.connect(owner).addStrategy(await strategy.getAddress(), cap, false);
      await fundManager(amount);
      await manager.connect(vault).deposit(amount);

      await expect(manager.connect(owner).invest(await strategy.getAddress(), cap))
        .to.emit(manager, "StrategyInvested")
        .withArgs(await strategy.getAddress(), cap);

      await expect(manager.connect(owner).invest(await strategy.getAddress(), 1))
        .to.be.revertedWithCustomError(manager, "MaxStrategyAssetsExceeded");
    });

    it("treats a zero strategy cap as uncapped", async function () {
      const amount = ethers.parseEther("2");

      await manager.connect(owner).addStrategy(await strategy.getAddress(), 0, false);
      await fundManager(amount);
      await manager.connect(vault).deposit(amount);
      await manager.connect(owner).invest(await strategy.getAddress(), amount);

      expect(await manager.strategyAssets(await strategy.getAddress())).to.equal(amount);
      expect(await manager.availableStrategyCapacity(await strategy.getAddress())).to.equal(ethers.MaxUint256);
    });
  });

  describe("Withdrawals and rebalancing", function () {
    it("pulls from strategies when vault withdrawals exceed manager idle assets", async function () {
      const amount = ethers.parseEther("1");
      const invested = ethers.parseEther("0.8");
      const withdrawal = ethers.parseEther("0.7");

      await manager.connect(owner).addStrategy(await strategy.getAddress(), 0, false);
      await fundManager(amount);
      await manager.connect(vault).deposit(amount);
      await manager.connect(owner).invest(await strategy.getAddress(), invested);

      await expect(manager.connect(vault).withdraw(withdrawal, receiver.address))
        .to.emit(manager, "ManagerWithdrawal")
        .withArgs(receiver.address, withdrawal);

      expect(await weth.balanceOf(receiver.address)).to.equal(withdrawal);
      expect(await manager.idleAssets()).to.equal(0n);
      expect(await manager.strategyAssets(await strategy.getAddress())).to.equal(ethers.parseEther("0.3"));
      expect(await manager.totalAssets()).to.equal(ethers.parseEther("0.3"));
    });

    it("rebalances assets between approved strategies", async function () {
      const amount = ethers.parseEther("1");
      const moveAmount = ethers.parseEther("0.25");

      await manager.connect(owner).addStrategy(await strategy.getAddress(), 0, true);
      await manager.connect(owner).addStrategy(await strategy2.getAddress(), 0, false);
      await fundManager(amount);
      await manager.connect(vault).deposit(amount);

      await expect(manager.connect(owner).rebalance(await strategy.getAddress(), await strategy2.getAddress(), moveAmount))
        .to.emit(manager, "StrategyRebalanced")
        .withArgs(await strategy.getAddress(), await strategy2.getAddress(), moveAmount, moveAmount);

      expect(await manager.strategyAssets(await strategy.getAddress())).to.equal(amount - moveAmount);
      expect(await manager.strategyAssets(await strategy2.getAddress())).to.equal(moveAmount);
      expect(await manager.totalAssets()).to.equal(amount);
    });

    it("does not remove a strategy until it has no assets", async function () {
      const amount = ethers.parseEther("1");

      await manager.connect(owner).addStrategy(await strategy.getAddress(), 0, true);
      await fundManager(amount);
      await manager.connect(vault).deposit(amount);

      await expect(manager.connect(owner).removeStrategy(await strategy.getAddress()))
        .to.be.revertedWithCustomError(manager, "StrategyHasAssets")
        .withArgs(await strategy.getAddress(), amount);

      await manager.connect(owner).divestAll(await strategy.getAddress());
      await expect(manager.connect(owner).removeStrategy(await strategy.getAddress()))
        .to.emit(manager, "StrategyRemoved")
        .withArgs(await strategy.getAddress());
    });

    it("withdraws all strategy and idle assets back to the vault receiver", async function () {
      const amount = ethers.parseEther("1");

      await manager.connect(owner).addStrategy(await strategy.getAddress(), 0, true);
      await fundManager(amount);
      await manager.connect(vault).deposit(amount);

      await manager.connect(vault).withdrawAll(receiver.address);

      expect(await weth.balanceOf(receiver.address)).to.equal(amount);
      expect(await manager.totalAssets()).to.equal(0n);
    });
  });

  describe("Aave adapter compatibility", function () {
    it("can control an Aave strategy adapter deployed with the manager as vault", async function () {
      const amount = ethers.parseEther("1");
      const yieldAmount = ethers.parseEther("0.1");

      const MockAToken = await ethers.getContractFactory("MockAToken");
      const aToken = await MockAToken.deploy();
      await aToken.waitForDeployment();

      const MockAaveV3Pool = await ethers.getContractFactory("MockAaveV3Pool");
      const pool = await MockAaveV3Pool.deploy(await weth.getAddress(), await aToken.getAddress());
      await pool.waitForDeployment();
      await aToken.setPool(await pool.getAddress());

      const AaveV3WETHStrategy = await ethers.getContractFactory("AaveV3WETHStrategy");
      const aaveStrategy = await AaveV3WETHStrategy.deploy(
        await weth.getAddress(),
        await aToken.getAddress(),
        await pool.getAddress(),
        await manager.getAddress(),
        owner.address
      );
      await aaveStrategy.waitForDeployment();

      await manager.connect(owner).addStrategy(await aaveStrategy.getAddress(), 0, true);
      await fundManager(amount);
      await manager.connect(vault).deposit(amount);

      expect(await manager.strategyAssets(await aaveStrategy.getAddress())).to.equal(amount);
      expect(await manager.totalAssets()).to.equal(amount);

      await weth.connect(user).deposit({ value: yieldAmount });
      await weth.connect(user).approve(await pool.getAddress(), yieldAmount);
      await pool.connect(user).accrueYield(await aaveStrategy.getAddress(), yieldAmount);

      expect(await manager.totalAssets()).to.equal(amount + yieldAmount);

      await manager.connect(vault).withdrawAll(receiver.address);

      expect(await weth.balanceOf(receiver.address)).to.equal(amount + yieldAmount);
      expect(await manager.totalAssets()).to.equal(0n);
    });
  });
});
