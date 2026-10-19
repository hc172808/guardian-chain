import { expect } from "chai";
import { ethers } from "hardhat";

describe("GydsToken", function () {
  it("mints the exact initial supply to the creator using the selected decimals", async function () {
    const [creator, other] = await ethers.getSigners();
    const token = await ethers.deployContract("GydsToken", [
      "Guyana Gold",
      "GYG",
      6,
      creator.address,
      ethers.parseUnits("1000000", 6),
      false,
    ]);
    await token.waitForDeployment();

    expect(await token.decimals()).to.equal(6);
    expect(await token.totalSupply()).to.equal(1_000_000_000_000n);
    expect(await token.balanceOf(creator.address)).to.equal(1_000_000_000_000n);
    expect(await token.balanceOf(other.address)).to.equal(0n);
    expect(await token.owner()).to.equal(creator.address);
    expect(await token.mintingEnabled()).to.equal(false);
    await expect(token.mint(other.address, 1n)).to.be.revertedWith("Minting disabled");
  });

  it("only allows future minting when explicitly enabled", async function () {
    const [creator, other] = await ethers.getSigners();
    const token = await ethers.deployContract("GydsToken", [
      "Mintable Example",
      "MEX",
      18,
      creator.address,
      ethers.parseUnits("25", 18),
      true,
    ]);
    await token.waitForDeployment();

    await token.mint(other.address, ethers.parseUnits("3", 18));
    expect(await token.balanceOf(other.address)).to.equal(ethers.parseUnits("3", 18));
    expect(await token.totalSupply()).to.equal(ethers.parseUnits("28", 18));
  });

  it("transfers all owner authority and rejects actions from the former owner", async function () {
    const [creator, nextOwner, other] = await ethers.getSigners();
    const token = await ethers.deployContract("GydsToken", [
      "Transferable Owner",
      "OWN",
      18,
      creator.address,
      ethers.parseUnits("10", 18),
      true,
    ]);
    await token.waitForDeployment();

    await expect(token.transferOwnership(nextOwner.address))
      .to.emit(token, "OwnershipTransferred")
      .withArgs(creator.address, nextOwner.address);
    expect(await token.owner()).to.equal(nextOwner.address);
    await expect(token.mint(other.address, 1n))
      .to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount")
      .withArgs(creator.address);
    await token.connect(nextOwner).mint(other.address, 1n);
    expect(await token.balanceOf(other.address)).to.equal(1n);
  });

  it("rejects invalid deployment parameters", async function () {
    const [creator] = await ethers.getSigners();
    const factory = await ethers.getContractFactory("GydsToken");
    const supply = ethers.parseUnits("1", 18);

    await expect(factory.deploy("Bad decimals", "BAD", 19, creator.address, supply, false))
      .to.be.revertedWith("Decimals exceed 18");
    await expect(factory.deploy("No supply", "NOS", 18, creator.address, 0, false))
      .to.be.revertedWith("Initial supply is zero");
    await expect(factory.deploy("No owner", "NON", 18, ethers.ZeroAddress, supply, false))
      .to.be.reverted;
  });
});
