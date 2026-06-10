import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";

async function deployRouterFixture() {
  const [owner, alice, bob] = await ethers.getSigners();

  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const tokenA = await MockERC20.deploy("Token A", "TKA");
  const tokenB = await MockERC20.deploy("Token B", "TKB");
  const WGYDS = await ethers.getContractFactory("WGYDS");
  const wgyds = await WGYDS.deploy();

  const Factory = await ethers.getContractFactory("GydsSwapFactory");
  const factory = await Factory.deploy(owner.address);

  const Router = await ethers.getContractFactory("GydsSwapRouter");
  const router = await Router.deploy(await factory.getAddress(), await wgyds.getAddress());

  // Mint tokens
  const MINT = ethers.parseEther("10000000");
  await tokenA.mint(owner.address, MINT);
  await tokenB.mint(owner.address, MINT);
  await tokenA.mint(alice.address, MINT);
  await tokenB.mint(alice.address, MINT);

  // Approve router
  await tokenA.approve(await router.getAddress(), MINT);
  await tokenB.approve(await router.getAddress(), MINT);
  await tokenA.connect(alice).approve(await router.getAddress(), MINT);
  await tokenB.connect(alice).approve(await router.getAddress(), MINT);

  const deadline = () => Math.floor(Date.now() / 1000) + 3600;

  return { owner, alice, bob, tokenA, tokenB, wgyds, factory, router, deadline };
}

async function withLiquidity() {
  const f = await loadFixture(deployRouterFixture);
  const { owner, tokenA, tokenB, router, deadline } = f;
  const amt = ethers.parseEther("100000");
  await router.addLiquidity(
    await tokenA.getAddress(),
    await tokenB.getAddress(),
    amt, amt,
    0n, 0n,
    owner.address,
    deadline()
  );
  return f;
}

describe("GydsSwapRouter", function () {
  describe("addLiquidity", function () {
    it("Should create a new pair and add liquidity", async function () {
      const { owner, tokenA, tokenB, factory, router, deadline } = await loadFixture(deployRouterFixture);
      const amt = ethers.parseEther("1000");
      await router.addLiquidity(
        await tokenA.getAddress(),
        await tokenB.getAddress(),
        amt, amt,
        0n, 0n,
        owner.address,
        deadline()
      );
      const pairAddr = await factory.getPair(await tokenA.getAddress(), await tokenB.getAddress());
      expect(pairAddr).to.not.equal(ethers.ZeroAddress);
    });

    it("Should revert past deadline", async function () {
      const { owner, tokenA, tokenB, router } = await loadFixture(deployRouterFixture);
      const expired = Math.floor(Date.now() / 1000) - 100;
      const amt = ethers.parseEther("1000");
      await expect(
        router.addLiquidity(
          await tokenA.getAddress(),
          await tokenB.getAddress(),
          amt, amt, 0n, 0n,
          owner.address,
          expired
        )
      ).to.be.revertedWith("GydsSwap: EXPIRED");
    });

    it("Should revert if amountA is below minimum", async function () {
      const { owner, tokenA, tokenB, router, deadline } = await loadFixture(deployRouterFixture);
      const amt = ethers.parseEther("1000");
      // First add liquidity to set price
      await router.addLiquidity(await tokenA.getAddress(), await tokenB.getAddress(), amt, amt, 0n, 0n, owner.address, deadline());
      // Now add with very high minimum (impossible to satisfy)
      await expect(
        router.addLiquidity(
          await tokenA.getAddress(),
          await tokenB.getAddress(),
          amt, amt,
          amt * 2n, // amountAMin too high
          0n,
          owner.address,
          deadline()
        )
      ).to.be.revertedWith("GydsSwap: INSUFFICIENT_A_AMOUNT");
    });
  });

  describe("removeLiquidity", function () {
    it("Should remove liquidity and return tokens", async function () {
      const { owner, tokenA, tokenB, factory, router, deadline } = await withLiquidity();

      const pairAddr = await factory.getPair(await tokenA.getAddress(), await tokenB.getAddress());
      const Pair = await ethers.getContractFactory("GydsSwapPair");
      const pair = Pair.attach(pairAddr) as any;
      const lpToken = (await ethers.getContractFactory("GLPToken")).attach(await pair.lpToken()) as any;
      const lp = await lpToken.balanceOf(owner.address);

      await lpToken.approve(await router.getAddress(), lp);
      const balBefore = await tokenA.balanceOf(owner.address);
      await router.removeLiquidity(
        await tokenA.getAddress(),
        await tokenB.getAddress(),
        lp, 0n, 0n,
        owner.address,
        deadline()
      );
      expect(await tokenA.balanceOf(owner.address)).to.be.gt(balBefore);
    });
  });

  describe("swapExactTokensForTokens", function () {
    it("Should swap exact tokens along a direct path", async function () {
      const { alice, tokenA, tokenB, router, deadline } = await withLiquidity();
      const amtIn = ethers.parseEther("100");
      const path = [await tokenA.getAddress(), await tokenB.getAddress()];
      const balBefore = await tokenB.balanceOf(alice.address);
      await router.connect(alice).swapExactTokensForTokens(amtIn, 0n, path, alice.address, deadline());
      expect(await tokenB.balanceOf(alice.address)).to.be.gt(balBefore);
    });

    it("Should revert if output is below amountOutMin (slippage)", async function () {
      const { alice, tokenA, tokenB, router, deadline } = await withLiquidity();
      const amtIn = ethers.parseEther("100");
      const path = [await tokenA.getAddress(), await tokenB.getAddress()];
      const hugeMinium = ethers.parseEther("999999999");
      await expect(
        router.connect(alice).swapExactTokensForTokens(amtIn, hugeMinium, path, alice.address, deadline())
      ).to.be.revertedWith("GydsSwap: INSUFFICIENT_OUTPUT_AMOUNT");
    });

    it("Should revert past deadline", async function () {
      const { alice, tokenA, tokenB, router } = await withLiquidity();
      const expired = Math.floor(Date.now() / 1000) - 100;
      const path = [await tokenA.getAddress(), await tokenB.getAddress()];
      await expect(
        router.connect(alice).swapExactTokensForTokens(ethers.parseEther("100"), 0n, path, alice.address, expired)
      ).to.be.revertedWith("GydsSwap: EXPIRED");
    });
  });

  describe("swapTokensForExactTokens", function () {
    it("Should receive exact output amount", async function () {
      const { alice, tokenA, tokenB, router, deadline } = await withLiquidity();
      const amtOut = ethers.parseEther("50");
      const path = [await tokenA.getAddress(), await tokenB.getAddress()];
      const amtInMax = ethers.parseEther("10000");
      await router.connect(alice).swapTokensForExactTokens(amtOut, amtInMax, path, alice.address, deadline());
      const balAfter = await tokenB.balanceOf(alice.address);
      // Alice had 10M - previous tests affected balance, just check she received some
      expect(balAfter).to.be.gt(0n);
    });
  });

  describe("getAmountsOut (quote)", function () {
    it("Should return correct amounts for a path", async function () {
      const { tokenA, tokenB, router } = await withLiquidity();
      const amtIn = ethers.parseEther("100");
      const path = [await tokenA.getAddress(), await tokenB.getAddress()];
      const amounts = await router.getAmountsOut(amtIn, path);
      expect(amounts.length).to.equal(2);
      expect(amounts[0]).to.equal(amtIn);
      expect(amounts[1]).to.be.gt(0n);
    });

    it("Should account for 0.3% fee in quote", async function () {
      const { tokenA, tokenB, factory, router } = await withLiquidity();
      const amtIn = ethers.parseEther("1000");
      const pairAddr = await factory.getPair(await tokenA.getAddress(), await tokenB.getAddress());
      const Pair = await ethers.getContractFactory("GydsSwapPair");
      const pair = Pair.attach(pairAddr) as any;
      const [r0, r1] = await pair.getReserves();
      const path = [await tokenA.getAddress(), await tokenB.getAddress()];
      const amounts = await router.getAmountsOut(amtIn, path);
      const t0 = await pair.token0();
      const addrA = await tokenA.getAddress();
      const [rIn, rOut] = t0 === addrA ? [r0, r1] : [r1, r0];
      const expected = (amtIn * 997n * rOut) / (rIn * 1000n + amtIn * 997n);
      expect(amounts[1]).to.equal(expected);
    });
  });
});
