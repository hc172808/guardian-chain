import { expect } from "chai";
import { ethers } from "hardhat";

describe("GydsToken", function () {
  it("mints a fixed exact supply to the deploying wallet and has no authority functions", async function () {
    const [creator, other] = await ethers.getSigners();
    const token = await ethers.deployContract("GydsToken", [
      "Guyana Gold",
      "GYG",
      6,
      ethers.parseUnits("1000000", 6),
    ]);
    await token.waitForDeployment();

    expect(await token.decimals()).to.equal(6);
    expect(await token.totalSupply()).to.equal(1_000_000_000_000n);
    expect(await token.balanceOf(creator.address)).to.equal(1_000_000_000_000n);
    expect(await token.balanceOf(other.address)).to.equal(0n);
    for (const signature of [
      "owner()",
      "mint(address,uint256)",
      "burn(uint256)",
      "pause()",
      "freeze(address)",
      "blacklist(address)",
      "transferOwnership(address)",
    ]) {
      expect(token.interface.hasFunction(signature), `${signature} must not exist`).to.equal(false);
    }
    await token.transfer(other.address, ethers.parseUnits("10", 6));
    expect(await token.totalSupply()).to.equal(1_000_000_000_000n);
  });

  it("rejects invalid deployment parameters", async function () {
    const [creator] = await ethers.getSigners();
    const factory = await ethers.getContractFactory("GydsToken");
    const supply = ethers.parseUnits("1", 18);

    await expect(factory.deploy("Bad decimals", "BAD", 19, supply))
      .to.be.revertedWith("Decimals exceed 18");
    await expect(factory.deploy("No supply", "NOS", 18, 0))
      .to.be.revertedWith("Initial supply is zero");
  });
});
