const { expect } = require("chai");
const { ethers } = require("hardhat");

const { calculateRequiredInterestReserve } = require("../scripts/deploy");

describe("Interest reserve policy", function () {
  it("calculates the required reserve from expected TVL, APY, and period", function () {
    const expectedTvl = ethers.parseEther("10");
    const interestRateBps = 100;
    const periodDays = 30n;

    expect(calculateRequiredInterestReserve(expectedTvl, interestRateBps, periodDays)).to.equal(
      8219178082191781n
    );
  });

  it("rounds up partial wei so the policy does not underfund", function () {
    expect(calculateRequiredInterestReserve(1n, 1, 1n)).to.equal(1n);
  });

  it("returns zero when there is no TVL or no APY", function () {
    expect(calculateRequiredInterestReserve(0n, 100, 30n)).to.equal(0n);
    expect(calculateRequiredInterestReserve(ethers.parseEther("10"), 0, 30n)).to.equal(0n);
  });
});
