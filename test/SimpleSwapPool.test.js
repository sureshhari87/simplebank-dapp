const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SimpleSwapPool", function () {
  let token0, token1, pool, owner, treasury, lp, trader, other;

  const swapFeeBps = 30n;
  const protocolFeeShareBps = 2000n;

  async function deployToken(name, symbol) {
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const token = await MockERC20.deploy(name, symbol, 18);
    await token.waitForDeployment();
    return token;
  }

  async function deployPool() {
    const SimpleSwapPool = await ethers.getContractFactory("SimpleSwapPool");
    pool = await SimpleSwapPool.deploy(
      await token0.getAddress(),
      await token1.getAddress(),
      owner.address,
      treasury.address,
      swapFeeBps,
      protocolFeeShareBps
    );
    await pool.waitForDeployment();
  }

  async function mintAndApprove(user, amount0, amount1) {
    if (amount0 > 0n) {
      await token0.mint(user.address, amount0);
      await token0.connect(user).approve(await pool.getAddress(), amount0);
    }
    if (amount1 > 0n) {
      await token1.mint(user.address, amount1);
      await token1.connect(user).approve(await pool.getAddress(), amount1);
    }
  }

  async function seedLiquidity(amount0 = ethers.parseEther("10"), amount1 = ethers.parseEther("20")) {
    await mintAndApprove(lp, amount0, amount1);
    await pool.connect(lp).addLiquidity(amount0, amount1, 0, 0, lp.address);
  }

  beforeEach(async function () {
    [owner, treasury, lp, trader, other] = await ethers.getSigners();
    token0 = await deployToken("Token A", "TKNA");
    token1 = await deployToken("Token B", "TKNB");
    await deployPool();
  });

  describe("Deployment", function () {
    it("sets tokens, owner, treasury, and fee parameters", async function () {
      expect(await pool.token0()).to.equal(await token0.getAddress());
      expect(await pool.token1()).to.equal(await token1.getAddress());
      expect(await pool.owner()).to.equal(owner.address);
      expect(await pool.treasury()).to.equal(treasury.address);
      expect(await pool.swapFeeBps()).to.equal(swapFeeBps);
      expect(await pool.protocolFeeShareBps()).to.equal(protocolFeeShareBps);
      expect(await pool.name()).to.equal("SimpleBank Swap LP");
      expect(await pool.symbol()).to.equal("sbSWAP-LP");
    });

    it("rejects invalid constructor parameters", async function () {
      const SimpleSwapPool = await ethers.getContractFactory("SimpleSwapPool");

      await expect(
        SimpleSwapPool.deploy(
          ethers.ZeroAddress,
          await token1.getAddress(),
          owner.address,
          treasury.address,
          swapFeeBps,
          protocolFeeShareBps
        )
      ).to.be.revertedWithCustomError(pool, "ZeroAddress");

      await expect(
        SimpleSwapPool.deploy(
          await token0.getAddress(),
          await token0.getAddress(),
          owner.address,
          treasury.address,
          swapFeeBps,
          protocolFeeShareBps
        )
      ).to.be.revertedWithCustomError(pool, "IdenticalTokens");

      await expect(
        SimpleSwapPool.deploy(
          await token0.getAddress(),
          await token1.getAddress(),
          owner.address,
          treasury.address,
          101,
          protocolFeeShareBps
        )
      ).to.be.revertedWithCustomError(pool, "FeeTooHigh");

      await expect(
        SimpleSwapPool.deploy(
          await token0.getAddress(),
          await token1.getAddress(),
          owner.address,
          treasury.address,
          swapFeeBps,
          5001
        )
      ).to.be.revertedWithCustomError(pool, "FeeTooHigh");
    });
  });

  describe("Liquidity", function () {
    it("adds initial liquidity and mints LP shares", async function () {
      const amount0 = ethers.parseEther("4");
      const amount1 = ethers.parseEther("9");
      await mintAndApprove(lp, amount0, amount1);

      const expectedLiquidity = await pool.quoteAddLiquidity.staticCall(amount0, amount1);

      await expect(pool.connect(lp).addLiquidity(amount0, amount1, 0, 0, lp.address))
        .to.emit(pool, "LiquidityAdded")
        .withArgs(lp.address, lp.address, amount0, amount1, expectedLiquidity[2]);

      expect(await pool.reserve0()).to.equal(amount0);
      expect(await pool.reserve1()).to.equal(amount1);
      expect(await pool.balanceOf(lp.address)).to.equal(expectedLiquidity[2]);
    });

    it("adds later liquidity at the pool ratio", async function () {
      await seedLiquidity();
      await mintAndApprove(other, ethers.parseEther("5"), ethers.parseEther("20"));

      await pool.connect(other).addLiquidity(
        ethers.parseEther("5"),
        ethers.parseEther("20"),
        0,
        0,
        other.address
      );

      expect(await pool.reserve0()).to.equal(ethers.parseEther("15"));
      expect(await pool.reserve1()).to.equal(ethers.parseEther("30"));
      expect(await token1.balanceOf(other.address)).to.equal(ethers.parseEther("10"));
    });

    it("removes liquidity pro rata", async function () {
      await seedLiquidity();
      const shares = await pool.balanceOf(lp.address);
      const halfShares = shares / 2n;

      await expect(pool.connect(lp).removeLiquidity(halfShares, 0, 0, lp.address))
        .to.emit(pool, "LiquidityRemoved")
        .withArgs(lp.address, lp.address, ethers.parseEther("5"), ethers.parseEther("10"), halfShares);

      expect(await pool.reserve0()).to.equal(ethers.parseEther("5"));
      expect(await pool.reserve1()).to.equal(ethers.parseEther("10"));
      expect(await token0.balanceOf(lp.address)).to.equal(ethers.parseEther("5"));
      expect(await token1.balanceOf(lp.address)).to.equal(ethers.parseEther("10"));
    });
  });

  describe("Swaps and fees", function () {
    beforeEach(async function () {
      await seedLiquidity();
      await mintAndApprove(trader, ethers.parseEther("1"), 0n);
    });

    it("swaps exact input and accrues protocol fees from the input token", async function () {
      const amountIn = ethers.parseEther("1");
      const quotedOut = await pool.getAmountOut(await token0.getAddress(), amountIn);
      const protocolFee = (amountIn * swapFeeBps * protocolFeeShareBps) / (10000n * 10000n);

      await expect(
        pool.connect(trader).swapExactTokensForTokens(await token0.getAddress(), amountIn, quotedOut, trader.address)
      )
        .to.emit(pool, "Swapped")
        .withArgs(
          trader.address,
          trader.address,
          await token0.getAddress(),
          await token1.getAddress(),
          amountIn,
          quotedOut,
          protocolFee
        );

      expect(await pool.protocolFees0()).to.equal(protocolFee);
      expect(await pool.reserve0()).to.equal(ethers.parseEther("11") - protocolFee);
      expect(await pool.reserve1()).to.equal(ethers.parseEther("20") - quotedOut);
      expect(await token1.balanceOf(trader.address)).to.equal(quotedOut);
    });

    it("rejects swaps below the minimum output", async function () {
      const amountIn = ethers.parseEther("1");
      const quotedOut = await pool.getAmountOut(await token0.getAddress(), amountIn);

      await expect(
        pool.connect(trader).swapExactTokensForTokens(
          await token0.getAddress(),
          amountIn,
          quotedOut + 1n,
          trader.address
        )
      ).to.be.revertedWithCustomError(pool, "SlippageExceeded");
    });

    it("claims protocol fees to treasury", async function () {
      const amountIn = ethers.parseEther("1");
      await pool.connect(trader).swapExactTokensForTokens(await token0.getAddress(), amountIn, 0, trader.address);
      const fees = await pool.protocolFees0();

      await expect(pool.connect(owner).claimProtocolFees())
        .to.emit(pool, "ProtocolFeesClaimed")
        .withArgs(treasury.address, fees, 0);

      expect(await token0.balanceOf(treasury.address)).to.equal(fees);
      expect(await pool.protocolFees0()).to.equal(0n);
      expect(await pool.reserve0()).to.equal(ethers.parseEther("11") - fees);
    });
  });

  describe("Owner controls", function () {
    it("allows owner to update treasury and fees", async function () {
      await expect(pool.connect(owner).setTreasury(other.address))
        .to.emit(pool, "TreasuryUpdated")
        .withArgs(treasury.address, other.address);

      await expect(pool.connect(owner).setSwapFeeBps(50))
        .to.emit(pool, "SwapFeeUpdated")
        .withArgs(swapFeeBps, 50);

      await expect(pool.connect(owner).setProtocolFeeShareBps(3000))
        .to.emit(pool, "ProtocolFeeShareUpdated")
        .withArgs(protocolFeeShareBps, 3000);
    });

    it("rejects invalid owner updates and non-owner calls", async function () {
      await expect(pool.connect(lp).setSwapFeeBps(1))
        .to.be.revertedWith("Ownable: caller is not the owner");
      await expect(pool.connect(owner).setTreasury(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(pool, "ZeroAddress");
      await expect(pool.connect(owner).setSwapFeeBps(101))
        .to.be.revertedWithCustomError(pool, "FeeTooHigh");
      await expect(pool.connect(owner).setProtocolFeeShareBps(5001))
        .to.be.revertedWithCustomError(pool, "FeeTooHigh");
      await expect(pool.connect(owner).claimProtocolFees())
        .to.be.revertedWithCustomError(pool, "NoProtocolFees");
      await expect(pool.connect(owner).renounceOwnership())
        .to.be.revertedWithCustomError(pool, "RenounceOwnershipDisabled");
    });

    it("pauses liquidity additions and swaps while withdrawals remain available", async function () {
      await seedLiquidity();
      await mintAndApprove(trader, ethers.parseEther("1"), ethers.parseEther("1"));

      await pool.connect(owner).pause();

      await expect(
        pool.connect(trader).addLiquidity(ethers.parseEther("1"), ethers.parseEther("1"), 0, 0, trader.address)
      ).to.be.revertedWith("Pausable: paused");
      await expect(
        pool.connect(trader).swapExactTokensForTokens(await token0.getAddress(), ethers.parseEther("1"), 0, trader.address)
      ).to.be.revertedWith("Pausable: paused");

      const shares = await pool.balanceOf(lp.address);
      await pool.connect(lp).removeLiquidity(shares, 0, 0, lp.address);
      expect(await pool.totalSupply()).to.equal(0n);
    });
  });
});
