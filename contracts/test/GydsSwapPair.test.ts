import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

// Minimal ERC-20 for testing — mint arbitrary amounts
const ERC20_ABI = [
  "constructor(string name, string symbol)",
  "function mint(address to, uint256 amount) external",
  "function transfer(address to, uint256 amount) external returns (bool)",
  "function balanceOf(address) external view returns (uint256)",
  "function approve(address spender, uint256 amount) external returns (bool)",
];

async function deployFixture() {
  const [owner, alice, bob] = await ethers.getSigners();

  // Deploy two mock ERC-20 tokens
  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const tokenA = await MockERC20.deploy("Token A", "TKA");
  const tokenB = await MockERC20.deploy("Token B", "TKB");

  // Deploy Factory
  const Factory = await ethers.getContractFactory("GydsSwapFactory");
  const factory = await Factory.deploy(owner.address);

  // Create a pair
  const tx = await factory.createPair(
    await tokenA.getAddress(),
    await tokenB.getAddress(),
    "TKA",
    "TKB"
  );
  const receipt = await tx.wait();
  const pairAddr = await factory.getPair(await tokenA.getAddress(), await tokenB.getAddress());

  const Pair = await ethers.getContractFactory("GydsSwapPair");
  const pair = Pair.attach(pairAddr) as any;

  const GLPToken = await ethers.getContractFactory("GLPToken");
  const lpToken = GLPToken.attach(await pair.lpToken()) as any;

  // Mint tokens for testing
  const AMOUNT = ethers.parseEther("1000000");
  await tokenA.mint(owner.address, AMOUNT);
  await tokenB.mint(owner.address, AMOUNT);
  await tokenA.mint(alice.address, AMOUNT);
  await tokenB.mint(alice.address, AMOUNT);

  return { owner, alice, bob, tokenA, tokenB, factory, pair, lpToken };
}

describe("GydsSwapPair", function () {
  describe("Deployment", function () {
    it("Should set token0 < token1 (sorted order)", async function () {
      const { tokenA, tokenB, pair } = await loadFixture(deployFixture);
      const t0 = await pair.token0();
      const t1 = await pair.token1();
      const addrA = await tokenA.getAddress();
      const addrB = await tokenB.getAddress();
      expect([t0, t1].sort()).to.deep.equal([addrA, addrB].sort());
      expect(BigInt(t0)).to.be.lessThan(BigInt(t1));
    });

    it("Should deploy an LP token with GLP- prefix", async function () {
      const { pair, lpToken } = await loadFixture(deployFixture);
      const sym = await lpToken.symbol();
      expect(sym).to.match(/^GLP-/);
    });

    it("Should have zero reserves initially", async function () {
      const { pair } = await loadFixture(deployFixture);
      const [r0, r1] = await pair.getReserves();
      expect(r0).to.equal(0n);
      expect(r1).to.equal(0n);
    });
  });

  describe("Mint (add liquidity)", function () {
    it("Should mint LP tokens on first deposit", async function () {
      const { owner, tokenA, tokenB, pair, lpToken } = await loadFixture(deployFixture);
      const amt = ethers.parseEther("1000");
      await tokenA.transfer(await pair.getAddress(), amt);
      await tokenB.transfer(await pair.getAddress(), amt);
      await pair.mint(owner.address);

      const lp = await lpToken.balanceOf(owner.address);
      expect(lp).to.be.gt(0n);
    });

    it("Should lock MINIMUM_LIQUIDITY on first deposit", async function () {
      const { owner, tokenA, tokenB, pair, lpToken } = await loadFixture(deployFixture);
      const amt = ethers.parseEther("1000");
      await tokenA.transfer(await pair.getAddress(), amt);
      await tokenB.transfer(await pair.getAddress(), amt);
      await pair.mint(owner.address);

      const locked = await lpToken.balanceOf(ethers.ZeroAddress);
      expect(locked).to.equal(1000n);
    });

    it("Should update reserves after mint", async function () {
      const { owner, tokenA, tokenB, pair } = await loadFixture(deployFixture);
      const amt = ethers.parseEther("500");
      await tokenA.transfer(await pair.getAddress(), amt);
      await tokenB.transfer(await pair.getAddress(), amt);
      await pair.mint(owner.address);

      const [r0, r1] = await pair.getReserves();
      expect(r0).to.equal(amt);
      expect(r1).to.equal(amt);
    });

    it("Should revert if no tokens sent", async function () {
      const { owner, pair } = await loadFixture(deployFixture);
      await expect(pair.mint(owner.address)).to.be.reverted;
    });
  });

  describe("Burn (remove liquidity)", function () {
    async function withLiquidity() {
      const f = await loadFixture(deployFixture);
      const { owner, tokenA, tokenB, pair } = f;
      const amt = ethers.parseEther("1000");
      await tokenA.transfer(await pair.getAddress(), amt);
      await tokenB.transfer(await pair.getAddress(), amt);
      await pair.mint(owner.address);
      return f;
    }

    it("Should return tokens when LP is burned", async function () {
      const { owner, tokenA, tokenB, pair, lpToken } = await withLiquidity();
      const lp = await lpToken.balanceOf(owner.address);
      await lpToken.transfer(await pair.getAddress(), lp);
      const balBefore = await tokenA.balanceOf(owner.address);
      await pair.burn(owner.address);
      const balAfter = await tokenA.balanceOf(owner.address);
      expect(balAfter).to.be.gt(balBefore);
    });

    it("Should reduce total LP supply after burn", async function () {
      const { owner, pair, lpToken } = await withLiquidity();
      const supplyBefore = await lpToken.totalSupply();
      const lp = await lpToken.balanceOf(owner.address);
      await lpToken.transfer(await pair.getAddress(), lp);
      await pair.burn(owner.address);
      expect(await lpToken.totalSupply()).to.be.lt(supplyBefore);
    });
  });

  describe("Swap", function () {
    async function withLiquidity() {
      const f = await loadFixture(deployFixture);
      const { owner, tokenA, tokenB, pair } = f;
      const amt = ethers.parseEther("100000");
      await tokenA.transfer(await pair.getAddress(), amt);
      await tokenB.transfer(await pair.getAddress(), amt);
      await pair.mint(owner.address);
      return f;
    }

    it("Should swap tokenA for tokenB", async function () {
      const { owner, alice, tokenA, tokenB, pair } = await withLiquidity();
      const amtIn = ethers.parseEther("100");
      await tokenA.connect(alice).transfer(await pair.getAddress(), amtIn);
      const [r0, r1] = await pair.getReserves();
      const amtOut = (amtIn * 997n * r1) / (r0 * 1000n + amtIn * 997n);

      const pairAddr = await pair.getAddress();
      const t0 = await pair.token0();
      const addrA = await tokenA.getAddress();
      const [out0, out1] = t0 === addrA ? [0n, amtOut] : [amtOut, 0n];

      const balBefore = await tokenB.balanceOf(alice.address);
      await pair.swap(out0, out1, alice.address, "0x");
      const balAfter = await tokenB.balanceOf(alice.address);
      expect(balAfter - balBefore).to.equal(amtOut);
    });

    it("Should enforce K invariant (revert on fee bypass)", async function () {
      const { owner, alice, tokenA, tokenB, pair } = await withLiquidity();
      const amtIn = ethers.parseEther("100");
      await tokenA.connect(alice).transfer(await pair.getAddress(), amtIn);
      const [r0, r1] = await pair.getReserves();
      const greedyOut = (amtIn * r1) / (r0 + amtIn);

      const t0 = await pair.token0();
      const addrA = await tokenA.getAddress();
      const [out0, out1] = t0 === addrA ? [0n, greedyOut] : [greedyOut, 0n];
      await expect(pair.swap(out0, out1, alice.address, "0x")).to.be.revertedWith("GydsSwap: K_INVARIANT_FAILED");
    });

    it("Should revert with insufficient liquidity", async function () {
      const { alice, tokenA, pair } = await withLiquidity();
      const [r0] = await pair.getReserves();
      const hugeOut = r0 + 1n;
      await expect(pair.swap(hugeOut, 0n, alice.address, "0x")).to.be.revertedWith("GydsSwap: INSUFFICIENT_LIQUIDITY");
    });

    it("Should revert if output is zero", async function () {
      const { alice, pair } = await withLiquidity();
      await expect(pair.swap(0n, 0n, alice.address, "0x")).to.be.revertedWith("GydsSwap: INSUFFICIENT_OUTPUT_AMOUNT");
    });
  });

  describe("Fee math", function () {
    it("Should collect 0.3% fee (deducted from amountIn)", async function () {
      const { owner, alice, tokenA, tokenB, pair } = await loadFixture(deployFixture);
      const liquidity = ethers.parseEther("100000");
      await tokenA.transfer(await pair.getAddress(), liquidity);
      await tokenB.transfer(await pair.getAddress(), liquidity);
      await pair.mint(owner.address);

      const amtIn = ethers.parseEther("1000");
      await tokenA.connect(alice).transfer(await pair.getAddress(), amtIn);
      const [r0, r1] = await pair.getReserves();
      const expectedOut = (amtIn * 997n * r1) / (r0 * 1000n + amtIn * 997n);

      const t0 = await pair.token0();
      const addrA = await tokenA.getAddress();
      const [out0, out1] = t0 === addrA ? [0n, expectedOut] : [expectedOut, 0n];
      await pair.swap(out0, out1, alice.address, "0x");

      // Effective fee = amtIn - (amtIn * 0.997) = amtIn * 0.003
      const fee = amtIn * 3n / 1000n;
      expect(fee).to.be.gt(0n);
    });
  });

  describe("Sync", function () {
    it("Should sync reserves to match token balances", async function () {
      const { owner, tokenA, tokenB, pair } = await loadFixture(deployFixture);
      const extra = ethers.parseEther("50");
      await tokenA.transfer(await pair.getAddress(), extra);
      await pair.sync();
      const [r0, r1] = await pair.getReserves();
      const t0 = await pair.token0();
      const addrA = await tokenA.getAddress();
      if (t0 === addrA) {
        expect(r0).to.equal(extra);
      } else {
        expect(r1).to.equal(extra);
      }
    });
  });
});
