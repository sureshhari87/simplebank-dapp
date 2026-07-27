const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Suite monetization smoke", function () {
  let owner, user, lender, borrower, lp, trader, payout, treasury;
  let bank, weth, vault, strategy, lending, token0, token1, swap;

  async function deployToken(name, symbol) {
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const token = await MockERC20.deploy(name, symbol, 18);
    await token.waitForDeployment();
    return token;
  }

  beforeEach(async function () {
    [owner, user, lender, borrower, lp, trader, payout] = await ethers.getSigners();

    const SimpleTreasury = await ethers.getContractFactory("SimpleTreasury");
    treasury = await SimpleTreasury.deploy(owner.address);
    await treasury.waitForDeployment();
    const treasuryAddress = await treasury.getAddress();

    const SimpleBankV3 = await ethers.getContractFactory("SimpleBankV3");
    bank = await SimpleBankV3.deploy(100, owner.address, ethers.parseEther("100"), treasuryAddress);
    await bank.waitForDeployment();

    const MockWETH = await ethers.getContractFactory("MockWETH");
    weth = await MockWETH.deploy();
    await weth.waitForDeployment();

    const SimpleWETHYieldVaultV2 = await ethers.getContractFactory("SimpleWETHYieldVaultV2");
    vault = await SimpleWETHYieldVaultV2.deploy(
      await weth.getAddress(),
      owner.address,
      treasuryAddress,
      1000,
      ethers.parseEther("100")
    );
    await vault.waitForDeployment();

    const MockYieldStrategy = await ethers.getContractFactory("MockYieldStrategy");
    strategy = await MockYieldStrategy.deploy(await weth.getAddress(), await vault.getAddress());
    await strategy.waitForDeployment();
    await vault.connect(owner).setStrategy(await strategy.getAddress());

    const SimpleLendingPool = await ethers.getContractFactory("SimpleLendingPool");
    lending = await SimpleLendingPool.deploy(
      owner.address,
      treasuryAddress,
      800,
      100,
      ethers.parseEther("100")
    );
    await lending.waitForDeployment();

    token0 = await deployToken("Smoke Token A", "SMKA");
    token1 = await deployToken("Smoke Token B", "SMKB");

    const SimpleSwapPool = await ethers.getContractFactory("SimpleSwapPool");
    swap = await SimpleSwapPool.deploy(
      await token0.getAddress(),
      await token1.getAddress(),
      owner.address,
      treasuryAddress,
      30,
      2000
    );
    await swap.waitForDeployment();
  });

  it("keeps every monetized module pointed at the central treasury", async function () {
    const treasuryAddress = await treasury.getAddress();

    expect(await bank.treasury()).to.equal(treasuryAddress);
    expect(await vault.treasury()).to.equal(treasuryAddress);
    expect(await lending.treasury()).to.equal(treasuryAddress);
    expect(await swap.treasury()).to.equal(treasuryAddress);
  });

  it("routes SimpleBank deposit fees into the central treasury", async function () {
    await bank.connect(owner).setDepositFeeBps(100);

    await bank.connect(user).deposit({ value: ethers.parseEther("1") });
    const protocolFees = await bank.protocolFees();
    expect(protocolFees).to.equal(ethers.parseEther("0.01"));

    const treasuryAddress = await treasury.getAddress();
    const treasuryBefore = await ethers.provider.getBalance(treasuryAddress);
    await bank.connect(owner).claimProtocolFees();

    expect(await bank.protocolFees()).to.equal(0n);
    expect(await ethers.provider.getBalance(treasuryAddress)).to.equal(treasuryBefore + protocolFees);
  });

  it("routes lending origination fees into the central treasury", async function () {
    await lending.connect(lender).supply({ value: ethers.parseEther("2") });
    await lending.connect(borrower).borrowWithCollateral(ethers.parseEther("0.5"), {
      value: ethers.parseEther("1"),
    });

    const protocolFees = await lending.protocolFees();
    expect(protocolFees).to.equal(ethers.parseEther("0.005"));

    const treasuryAddress = await treasury.getAddress();
    const treasuryBefore = await ethers.provider.getBalance(treasuryAddress);
    await lending.connect(owner).claimProtocolFees();

    expect(await lending.protocolFees()).to.equal(0n);
    expect(await ethers.provider.getBalance(treasuryAddress)).to.equal(treasuryBefore + protocolFees);
  });

  it("routes swap protocol fees into the central treasury", async function () {
    const liquidity0 = ethers.parseEther("10");
    const liquidity1 = ethers.parseEther("1000");
    const amountIn = ethers.parseEther("1");

    await token0.mint(lp.address, liquidity0);
    await token1.mint(lp.address, liquidity1);
    await token0.connect(lp).approve(await swap.getAddress(), liquidity0);
    await token1.connect(lp).approve(await swap.getAddress(), liquidity1);
    await swap.connect(lp).addLiquidity(liquidity0, liquidity1, 0, 0, lp.address);

    await token0.mint(trader.address, amountIn);
    await token0.connect(trader).approve(await swap.getAddress(), amountIn);
    await swap.connect(trader).swapExactTokensForTokens(await token0.getAddress(), amountIn, 0, trader.address);

    const protocolFees0 = await swap.protocolFees0();
    expect(protocolFees0).to.be.gt(0n);

    const treasuryAddress = await treasury.getAddress();
    await swap.connect(owner).claimProtocolFees();

    expect(await swap.protocolFees0()).to.equal(0n);
    expect(await token0.balanceOf(treasuryAddress)).to.equal(protocolFees0);
  });

  it("mints vault performance fee shares to treasury and lets Safe redeem through treasury execute", async function () {
    const depositAmount = ethers.parseEther("10");
    const yieldAmount = ethers.parseEther("1");

    await vault.connect(user).depositETH(user.address, { value: depositAmount });
    await vault.connect(owner).invest(depositAmount);

    await weth.connect(user).deposit({ value: yieldAmount });
    await weth.connect(user).transfer(await strategy.getAddress(), yieldAmount);
    await vault.connect(user).harvestPerformanceFee();

    const treasuryAddress = await treasury.getAddress();
    const treasuryShares = await vault.balanceOf(treasuryAddress);
    expect(treasuryShares).to.be.gt(0n);
    expect(await vault.convertToAssets(treasuryShares)).to.be.gt(ethers.parseEther("0.09"));

    const redeemData = vault.interface.encodeFunctionData("redeemETH", [
      treasuryShares,
      payout.address,
      treasuryAddress,
    ]);
    const payoutBefore = await ethers.provider.getBalance(payout.address);

    await treasury.connect(owner).execute(await vault.getAddress(), 0, redeemData);

    expect(await vault.balanceOf(treasuryAddress)).to.equal(0n);
    expect(await ethers.provider.getBalance(payout.address)).to.be.gt(payoutBefore);
  });
});
