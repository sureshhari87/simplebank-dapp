const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SimpleTreasury", function () {
  let treasury, token, owner, operator, recipient, user;

  async function deployTreasury() {
    const SimpleTreasury = await ethers.getContractFactory("SimpleTreasury");
    treasury = await SimpleTreasury.deploy(owner.address);
    await treasury.waitForDeployment();
  }

  async function deployToken() {
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    token = await MockERC20.deploy("Treasury Token", "TRY", 18);
    await token.waitForDeployment();
  }

  beforeEach(async function () {
    [owner, operator, recipient, user] = await ethers.getSigners();
    await deployTreasury();
    await deployToken();
  });

  it("sets owner and tracks ETH as the first asset", async function () {
    expect(await treasury.owner()).to.equal(owner.address);
    expect(await treasury.trackedAssetCount()).to.equal(1n);
    expect(await treasury.trackedAssetAt(0)).to.equal(ethers.ZeroAddress);
  });

  it("rejects a zero owner", async function () {
    const SimpleTreasury = await ethers.getContractFactory("SimpleTreasury");

    await expect(SimpleTreasury.deploy(ethers.ZeroAddress))
      .to.be.revertedWithCustomError(treasury, "ZeroAddress");
  });

  it("receives and withdraws ETH by owner", async function () {
    await expect(
      user.sendTransaction({
        to: await treasury.getAddress(),
        value: ethers.parseEther("1"),
      })
    )
      .to.emit(treasury, "ETHReceived")
      .withArgs(user.address, ethers.parseEther("1"));

    await expect(treasury.connect(owner).withdrawETH(recipient.address, ethers.parseEther("0.4")))
      .to.emit(treasury, "ETHWithdrawn")
      .withArgs(recipient.address, ethers.parseEther("0.4"));

    expect(await ethers.provider.getBalance(await treasury.getAddress())).to.equal(ethers.parseEther("0.6"));
  });

  it("receives and withdraws ERC20 tokens by owner", async function () {
    const amount = ethers.parseEther("100");
    await token.mint(await treasury.getAddress(), amount);

    await expect(treasury.connect(owner).withdrawToken(await token.getAddress(), recipient.address, ethers.parseEther("25")))
      .to.emit(treasury, "TokenWithdrawn")
      .withArgs(await token.getAddress(), recipient.address, ethers.parseEther("25"));

    expect(await token.balanceOf(recipient.address)).to.equal(ethers.parseEther("25"));
    expect(await token.balanceOf(await treasury.getAddress())).to.equal(ethers.parseEther("75"));
  });

  it("allows an operator to spend ETH within an owner-set cap", async function () {
    await owner.sendTransaction({
      to: await treasury.getAddress(),
      value: ethers.parseEther("1"),
    });
    await treasury.connect(owner).setOperator(operator.address, true);
    await treasury.connect(owner).setAssetPolicy(ethers.ZeroAddress, true, ethers.parseEther("0.5"));

    await expect(treasury.connect(operator).spendETH(recipient.address, ethers.parseEther("0.2")))
      .to.emit(treasury, "ETHSpent")
      .withArgs(operator.address, recipient.address, ethers.parseEther("0.2"));

    expect(await treasury.availableSpend(ethers.ZeroAddress)).to.equal(ethers.parseEther("0.3"));

    await expect(treasury.connect(operator).spendETH(recipient.address, ethers.parseEther("0.31")))
      .to.be.revertedWithCustomError(treasury, "SpendLimitExceeded");
  });

  it("allows an operator to spend ERC20 tokens within an owner-set cap", async function () {
    const tokenAddress = await token.getAddress();
    await token.mint(await treasury.getAddress(), ethers.parseEther("100"));
    await treasury.connect(owner).setOperator(operator.address, true);
    await treasury.connect(owner).setAssetPolicy(tokenAddress, true, ethers.parseEther("10"));

    await expect(treasury.connect(operator).spendToken(tokenAddress, recipient.address, ethers.parseEther("4")))
      .to.emit(treasury, "TokenSpent")
      .withArgs(operator.address, tokenAddress, recipient.address, ethers.parseEther("4"));

    expect(await token.balanceOf(recipient.address)).to.equal(ethers.parseEther("4"));
    expect(await treasury.availableSpend(tokenAddress)).to.equal(ethers.parseEther("6"));
  });

  it("resets spent amounts without changing the cap", async function () {
    await owner.sendTransaction({
      to: await treasury.getAddress(),
      value: ethers.parseEther("1"),
    });
    await treasury.connect(owner).setOperator(operator.address, true);
    await treasury.connect(owner).setAssetPolicy(ethers.ZeroAddress, true, ethers.parseEther("0.5"));
    await treasury.connect(operator).spendETH(recipient.address, ethers.parseEther("0.5"));

    expect(await treasury.availableSpend(ethers.ZeroAddress)).to.equal(0n);
    await expect(treasury.connect(owner).resetAssetSpend(ethers.ZeroAddress))
      .to.emit(treasury, "AssetSpendReset")
      .withArgs(ethers.ZeroAddress, ethers.parseEther("0.5"));

    expect(await treasury.availableSpend(ethers.ZeroAddress)).to.equal(ethers.parseEther("0.5"));
  });

  it("rejects unauthorized operators and disabled assets", async function () {
    await owner.sendTransaction({
      to: await treasury.getAddress(),
      value: ethers.parseEther("1"),
    });

    await expect(treasury.connect(user).spendETH(recipient.address, ethers.parseEther("0.1")))
      .to.be.revertedWithCustomError(treasury, "UnauthorizedOperator");

    await treasury.connect(owner).setOperator(operator.address, true);
    await expect(treasury.connect(operator).spendETH(recipient.address, ethers.parseEther("0.1")))
      .to.be.revertedWithCustomError(treasury, "AssetNotEnabled");
  });

  it("pauses withdrawals and operator spending", async function () {
    await owner.sendTransaction({
      to: await treasury.getAddress(),
      value: ethers.parseEther("1"),
    });
    await treasury.connect(owner).setOperator(operator.address, true);
    await treasury.connect(owner).setAssetPolicy(ethers.ZeroAddress, true, ethers.parseEther("1"));

    await treasury.connect(owner).pause();

    await expect(treasury.connect(owner).withdrawETH(recipient.address, ethers.parseEther("0.1")))
      .to.be.revertedWith("Pausable: paused");
    await expect(treasury.connect(operator).spendETH(recipient.address, ethers.parseEther("0.1")))
      .to.be.revertedWith("Pausable: paused");

    await treasury.connect(owner).unpause();
    await treasury.connect(operator).spendETH(recipient.address, ethers.parseEther("0.1"));
  });

  it("allows the owner to execute an external call from the treasury", async function () {
    const amount = ethers.parseEther("12");
    const data = token.interface.encodeFunctionData("mint", [recipient.address, amount]);

    await expect(treasury.connect(owner).execute(await token.getAddress(), 0, data))
      .to.emit(treasury, "ExternalCallExecuted")
      .withArgs(await token.getAddress(), 0, data, "0x");

    expect(await token.balanceOf(recipient.address)).to.equal(amount);
  });

  it("rejects unauthorized, invalid, and overfunded external calls", async function () {
    const data = token.interface.encodeFunctionData("mint", [recipient.address, ethers.parseEther("1")]);

    await expect(treasury.connect(user).execute(await token.getAddress(), 0, data))
      .to.be.revertedWith("Ownable: caller is not the owner");
    await expect(treasury.connect(owner).execute(ethers.ZeroAddress, 0, data))
      .to.be.revertedWithCustomError(treasury, "ZeroAddress");
    await expect(treasury.connect(owner).execute(await token.getAddress(), 1, data))
      .to.be.revertedWithCustomError(treasury, "InsufficientBalance");

    await treasury.connect(owner).pause();
    await expect(treasury.connect(owner).execute(await token.getAddress(), 0, data))
      .to.be.revertedWith("Pausable: paused");
  });

  it("rejects invalid owner actions and disables renouncing ownership", async function () {
    await expect(treasury.connect(user).setOperator(operator.address, true))
      .to.be.revertedWith("Ownable: caller is not the owner");
    await expect(treasury.connect(owner).setOperator(ethers.ZeroAddress, true))
      .to.be.revertedWithCustomError(treasury, "ZeroAddress");
    await expect(treasury.connect(owner).withdrawETH(ethers.ZeroAddress, 1))
      .to.be.revertedWithCustomError(treasury, "ZeroAddress");
    await expect(treasury.connect(owner).withdrawETH(recipient.address, 0))
      .to.be.revertedWithCustomError(treasury, "ZeroAmount");
    await expect(treasury.connect(owner).withdrawETH(recipient.address, 1))
      .to.be.revertedWithCustomError(treasury, "InsufficientBalance");
    await expect(treasury.connect(owner).renounceOwnership())
      .to.be.revertedWithCustomError(treasury, "RenounceOwnershipDisabled");
  });
});
