import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, mine, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";

async function deployFarmFixture() {
  const [owner, alice, bob] = await ethers.getSigners();

  // Deploy mock GYDS reward token
  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const gydsToken = await MockERC20.deploy("GYDS", "GYDS");

  // Deploy mock LP tokens (GLP tokens for two pools)
  const lpToken1 = await MockERC20.deploy("GLP-GYDS-USDT", "GLP-GYDS-USDT");
  const lpToken2 = await MockERC20.deploy("GLP-GYDS-ETH", "GLP-GYDS-ETH");

  // Deploy Farm: 1 GYDS per block emission
  const Farm = await ethers.getContractFactory("GydsSwapFarm");
  const emissionRate = ethers.parseEther("1"); // 1 GYDS/block
  const farm = await Farm.deploy(await gydsToken.getAddress(), emissionRate);

  // Mint GYDS to farm for rewards
  const rewardPool = ethers.parseEther("1000000");
  await gydsToken.mint(await farm.getAddress(), rewardPool);

  // Mint LP tokens to users
  const LP_AMOUNT = ethers.parseEther("1000");
  await lpToken1.mint(alice.address, LP_AMOUNT);
  await lpToken1.mint(bob.address, LP_AMOUNT);
  await lpToken2.mint(alice.address, LP_AMOUNT);

  // Add pool 1 (100 alloc points)
  await farm.addPool(await lpToken1.getAddress(), 100);

  return { owner, alice, bob, gydsToken, lpToken1, lpToken2, farm, LP_AMOUNT };
}

describe("GydsSwapFarm", function () {
  describe("Pool management", function () {
    it("Should add a pool correctly", async function () {
      const { farm, lpToken1 } = await loadFixture(deployFarmFixture);
      expect(await farm.poolLength()).to.equal(1n);
      const pool = await farm.poolInfo(0);
      expect(pool.lpToken).to.equal(await lpToken1.getAddress());
      expect(pool.allocPoint).to.equal(100n);
    });

    it("Should add multiple pools", async function () {
      const { farm, lpToken2 } = await loadFixture(deployFarmFixture);
      await farm.addPool(await lpToken2.getAddress(), 200);
      expect(await farm.poolLength()).to.equal(2n);
    });

    it("Should update pool alloc points", async function () {
      const { farm } = await loadFixture(deployFarmFixture);
      await farm.setPool(0, 50, true);
      const pool = await farm.poolInfo(0);
      expect(pool.allocPoint).to.equal(50n);
    });
  });

  describe("Stake", function () {
    it("Should accept LP token deposits", async function () {
      const { alice, lpToken1, farm, LP_AMOUNT } = await loadFixture(deployFarmFixture);
      await lpToken1.connect(alice).approve(await farm.getAddress(), LP_AMOUNT);
      await farm.connect(alice).deposit(0, LP_AMOUNT);
      const user = await farm.userInfo(0, alice.address);
      expect(user.amount).to.equal(LP_AMOUNT);
    });

    it("Should transfer LP tokens from user to farm", async function () {
      const { alice, lpToken1, farm, LP_AMOUNT } = await loadFixture(deployFarmFixture);
      await lpToken1.connect(alice).approve(await farm.getAddress(), LP_AMOUNT);
      await farm.connect(alice).deposit(0, LP_AMOUNT);
      expect(await lpToken1.balanceOf(await farm.getAddress())).to.equal(LP_AMOUNT);
      expect(await lpToken1.balanceOf(alice.address)).to.equal(0n);
    });
  });

  describe("Unstake", function () {
    it("Should return LP tokens on withdraw", async function () {
      const { alice, lpToken1, farm, LP_AMOUNT } = await loadFixture(deployFarmFixture);
      await lpToken1.connect(alice).approve(await farm.getAddress(), LP_AMOUNT);
      await farm.connect(alice).deposit(0, LP_AMOUNT);
      await farm.connect(alice).withdraw(0, LP_AMOUNT);
      expect(await lpToken1.balanceOf(alice.address)).to.equal(LP_AMOUNT);
    });

    it("Should revert on over-withdrawal", async function () {
      const { alice, lpToken1, farm, LP_AMOUNT } = await loadFixture(deployFarmFixture);
      await lpToken1.connect(alice).approve(await farm.getAddress(), LP_AMOUNT);
      await farm.connect(alice).deposit(0, LP_AMOUNT);
      await expect(farm.connect(alice).withdraw(0, LP_AMOUNT + 1n)).to.be.reverted;
    });
  });

  describe("Harvest (reward accrual)", function () {
    it("Should accrue rewards over blocks", async function () {
      const { alice, gydsToken, lpToken1, farm, LP_AMOUNT } = await loadFixture(deployFarmFixture);
      await lpToken1.connect(alice).approve(await farm.getAddress(), LP_AMOUNT);
      await farm.connect(alice).deposit(0, LP_AMOUNT);

      // Mine 10 blocks to accumulate rewards
      await mine(10);

      const pending = await farm.pendingGyds(0, alice.address);
      expect(pending).to.be.gt(0n);
    });

    it("Should pay out pending rewards on harvest", async function () {
      const { alice, gydsToken, lpToken1, farm, LP_AMOUNT } = await loadFixture(deployFarmFixture);
      await lpToken1.connect(alice).approve(await farm.getAddress(), LP_AMOUNT);
      await farm.connect(alice).deposit(0, LP_AMOUNT);
      await mine(10);

      const before = await gydsToken.balanceOf(alice.address);
      await farm.connect(alice).harvest(0);
      const after = await gydsToken.balanceOf(alice.address);
      expect(after).to.be.gt(before);
    });

    it("Should pay out rewards on withdraw", async function () {
      const { alice, gydsToken, lpToken1, farm, LP_AMOUNT } = await loadFixture(deployFarmFixture);
      await lpToken1.connect(alice).approve(await farm.getAddress(), LP_AMOUNT);
      await farm.connect(alice).deposit(0, LP_AMOUNT);
      await mine(5);

      const before = await gydsToken.balanceOf(alice.address);
      await farm.connect(alice).withdraw(0, LP_AMOUNT);
      const after = await gydsToken.balanceOf(alice.address);
      expect(after).to.be.gt(before);
    });
  });

  describe("Emergency withdraw", function () {
    it("Should return LP tokens and forfeit rewards", async function () {
      const { alice, gydsToken, lpToken1, farm, LP_AMOUNT } = await loadFixture(deployFarmFixture);
      await lpToken1.connect(alice).approve(await farm.getAddress(), LP_AMOUNT);
      await farm.connect(alice).deposit(0, LP_AMOUNT);
      await mine(10);

      const gydsBefore = await gydsToken.balanceOf(alice.address);
      await farm.connect(alice).emergencyWithdraw(0);
      const lpAfter = await lpToken1.balanceOf(alice.address);
      const gydsAfter = await gydsToken.balanceOf(alice.address);

      // LP tokens returned
      expect(lpAfter).to.equal(LP_AMOUNT);
      // No GYDS rewards paid (emergency)
      expect(gydsAfter).to.equal(gydsBefore);
    });
  });

  describe("Multi-user reward split", function () {
    it("Should split rewards proportionally between stakers", async function () {
      const { alice, bob, gydsToken, lpToken1, farm, LP_AMOUNT } = await loadFixture(deployFarmFixture);
      await lpToken1.connect(alice).approve(await farm.getAddress(), LP_AMOUNT);
      await lpToken1.connect(bob).approve(await farm.getAddress(), LP_AMOUNT);

      // Alice stakes first
      await farm.connect(alice).deposit(0, LP_AMOUNT);
      await mine(5);

      // Bob stakes same amount
      await farm.connect(bob).deposit(0, LP_AMOUNT);
      await mine(10);

      const alicePending = await farm.pendingGyds(0, alice.address);
      const bobPending = await farm.pendingGyds(0, bob.address);

      // Alice has more because she staked earlier (solo for 5 blocks)
      expect(alicePending).to.be.gt(bobPending);
    });
  });
});
