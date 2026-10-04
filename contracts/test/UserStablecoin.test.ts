import { expect } from "chai";
import { ethers } from "hardhat";

describe("UserStablecoin", () => {
  async function deployToken() {
    const [, creator, holder, outsider] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("UserStablecoin");
    const initialSupply = ethers.parseUnits("1250", 6);
    const token = await Token.deploy("Review Dollar", "RUSD", 6, creator.address, initialSupply);
    await token.waitForDeployment();
    return { token, creator, holder, outsider, initialSupply };
  }

  it("sets the linked creator wallet as owner and mints the configured initial supply", async () => {
    const { token, creator, initialSupply } = await deployToken();

    expect(await token.owner()).to.equal(creator.address);
    expect(await token.name()).to.equal("Review Dollar");
    expect(await token.symbol()).to.equal("RUSD");
    expect(await token.decimals()).to.equal(6);
    expect(await token.totalSupply()).to.equal(initialSupply);
    expect(await token.balanceOf(creator.address)).to.equal(initialSupply);
  });

  it("allows only the creator to mint and burn another holder's balance", async () => {
    const { token, creator, holder, outsider } = await deployToken();
    await token.connect(creator).mint(holder.address, 100n);

    await expect(token.connect(outsider).mint(holder.address, 1n))
      .to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
    await expect(token.connect(outsider).burnFrom(holder.address, 1n))
      .to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");

    await token.connect(creator).burnFrom(holder.address, 25n);
    expect(await token.balanceOf(holder.address)).to.equal(75n);
  });

  it("allows holders to burn their own tokens and rejects invalid decimals", async () => {
    const { token, creator, holder } = await deployToken();
    await token.connect(creator).mint(holder.address, 100n);
    await token.connect(holder).burn(40n);
    expect(await token.balanceOf(holder.address)).to.equal(60n);

    const Token = await ethers.getContractFactory("UserStablecoin");
    await expect(Token.deploy("Bad Decimals", "BAD", 19, creator.address, 0n))
      .to.be.revertedWith("Decimals exceed 18");
  });
});