import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";

async function deployMarketFixture() {
  const [owner, trader] = await ethers.getSigners();
  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const wgyds = await MockERC20.deploy("Wrapped GYDS", "WGYDS");
  const usdt = await MockERC20.deploy("Tether USD", "USDT");
  const launch = await MockERC20.deploy("Launch Token", "LAUNCH");
  const counterAsset = await MockERC20.deploy("Counter Asset", "OTHER");

  const Factory = await ethers.getContractFactory("GydsSwapFactory");
  const factory = await Factory.deploy(
    owner.address,
    await wgyds.getAddress(),
    await usdt.getAddress(),
  );
  await factory.registerLaunchToken(await launch.getAddress());

  await factory.createPair(await wgyds.getAddress(), await usdt.getAddress(), "WGYDS", "USDT");
  await factory.createPair(await wgyds.getAddress(), await launch.getAddress(), "WGYDS", "LAUNCH");
  await factory.createPair(await launch.getAddress(), await usdt.getAddress(), "LAUNCH", "USDT");
  await factory.createPairForLaunch(
    await launch.getAddress(),
    await counterAsset.getAddress(),
    "LAUNCH",
    "OTHER",
    await launch.getAddress(),
  );

  const mint = ethers.parseEther;
  await wgyds.mint(owner.address, mint("20000"));
  await usdt.mint(owner.address, mint("20000"));
  await launch.mint(owner.address, mint("5120000"));
  await counterAsset.mint(owner.address, mint("1000000"));

  const Pair = await ethers.getContractFactory("GydsSwapPair");
  async function seedPair(tokenA: any, tokenB: any, amountA: bigint, amountB: bigint) {
    const pairAddress = await factory.getPair(await tokenA.getAddress(), await tokenB.getAddress());
    const pair = Pair.attach(pairAddress) as any;
    await tokenA.transfer(pairAddress, amountA);
    await tokenB.transfer(pairAddress, amountB);
    await pair.mint(owner.address);
    return pair;
  }

  const oraclePair = await seedPair(wgyds, usdt, mint("10000"), mint("10000"));
  const launchBasePair = await seedPair(wgyds, launch, mint("1024"), mint("1048576"));
  const launchUsdtPair = await seedPair(launch, usdt, mint("100000"), mint("100"));
  const launchCounterPair = await seedPair(launch, counterAsset, mint("100000"), mint("100000"));

  const Router = await ethers.getContractFactory("GydsSwapRouter");
  const router = await Router.deploy(await factory.getAddress(), await wgyds.getAddress());

  return {
    owner,
    trader,
    wgyds,
    usdt,
    launch,
    counterAsset,
    factory,
    router,
    oraclePair,
    launchBasePair,
    launchUsdtPair,
    launchCounterPair,
  };
}

describe("GydsSwap market-cap trading gate", function () {
  it("uses circulating supply times a 30-minute on-chain USD TWAP", async function () {
    const { wgyds, launch, factory } = await deployMarketFixture();

    expect(await factory.getMarketCapUsdE18(await launch.getAddress())).to.equal(0n);
    expect(await factory.isPairTradeAllowed(await launch.getAddress(), await wgyds.getAddress())).to.equal(true);

    await time.increase(30 * 60);

    expect(await factory.getMarketCapUsdE18(await launch.getAddress())).to.equal(
      ethers.parseEther("5000"),
    );
    expect(
      await factory.isPairTradeAllowed(await launch.getAddress(), await (await factory.usdStablecoin()).toString()),
    ).to.equal(false);
  });

  it("opens a launch token's non-WGYDS pairs at $10,000 and keeps them open", async function () {
    const { owner, launch, usdt, counterAsset, factory, router, launchUsdtPair } = await deployMarketFixture();
    await time.increase(30 * 60);

    await launch.mint(owner.address, ethers.parseEther("5120000"));
    expect(await factory.getMarketCapUsdE18(await launch.getAddress())).to.equal(
      ethers.parseEther("10000"),
    );
    expect(await factory.isPairTradeAllowed(await launch.getAddress(), await usdt.getAddress())).to.equal(true);
    expect(await factory.isPairTradeAllowed(await launch.getAddress(), await counterAsset.getAddress())).to.equal(true);
    await expect(
      router.getAmountsOut(ethers.parseEther("1"), [await launch.getAddress(), await usdt.getAddress()]),
    ).to.not.be.reverted;

    const launchIsToken0 = (await launchUsdtPair.token0()).toLowerCase() ===
      (await launch.getAddress()).toLowerCase();
    const inputAmount = ethers.parseEther("2000");
    await launch.transfer(await launchUsdtPair.getAddress(), inputAmount);
    await launchUsdtPair.swap(
      launchIsToken0 ? 0n : ethers.parseEther("1"),
      launchIsToken0 ? ethers.parseEther("1") : 0n,
      owner.address,
      "0x",
    );

    expect(await factory.marketCapUnlocked(await launch.getAddress())).to.equal(true);
    await launch.burn(ethers.parseEther("8000000"));
    expect(await factory.getMarketCapUsdE18(await launch.getAddress())).to.be.lessThan(
      ethers.parseEther("10000"),
    );
    expect(await factory.isPairTradeAllowed(await launch.getAddress(), await usdt.getAddress())).to.equal(true);
  });

  it("blocks both router quotes and direct pair swaps below $10,000", async function () {
    const { owner, launch, usdt, router, launchUsdtPair } = await deployMarketFixture();
    await time.increase(30 * 60);

    await expect(
      router.getAmountsOut(ethers.parseEther("1"), [await launch.getAddress(), await usdt.getAddress()]),
    ).to.be.revertedWith("GydsSwap: MARKET_CAP_BELOW_10K");

    const launchIsToken0 = (await launchUsdtPair.token0()).toLowerCase() ===
      (await launch.getAddress()).toLowerCase();
    await expect(
      launchUsdtPair.swap(
        launchIsToken0 ? 0n : ethers.parseEther("1"),
        launchIsToken0 ? ethers.parseEther("1") : 0n,
        owner.address,
        "0x",
      ),
    ).to.be.revertedWith("GydsSwap: MARKET_CAP_BELOW_10K");
  });

  it("requires non-base assets to be registered before creating a pair", async function () {
    const { usdt, factory } = await deployMarketFixture();
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const unregistered = await MockERC20.deploy("Unregistered", "NOPE");

    await expect(
      factory.createPair(await unregistered.getAddress(), await usdt.getAddress(), "NOPE", "USDT"),
    ).to.be.revertedWith("GydsSwap: TOKEN_NOT_REGISTERED");

    await factory.registerLaunchToken(await unregistered.getAddress());
    await factory.createPair(await unregistered.getAddress(), await usdt.getAddress(), "NOPE", "USDT");
    const pairAddress = await factory.getPair(await unregistered.getAddress(), await usdt.getAddress());
    expect(await factory.pairGateToken(pairAddress)).to.equal(await unregistered.getAddress());
  });
});
