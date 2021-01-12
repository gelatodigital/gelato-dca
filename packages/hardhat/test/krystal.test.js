const { ethers, artifacts, network } = require('hardhat');
const { GelatoCore } = require('@gelatonetwork/core');
const SmartWalletSwapImplementation = artifacts.readArtifactSync(
  'SmartWalletSwapImplementation',
);

// mainnet addresses
const kyberProxy = network.config.addresses.kyberProxy;
const wethAddress = network.config.addresses.wethAddress;
const uniswapRouter = network.config.addresses.uniswapRouter;
const sushiswapRouter = network.config.addresses.sushiswapRouter;
const usdtAddress = network.config.addresses.usdtAddress;
const usdcAddress = network.config.addresses.usdcAddress;
const daiAddress = network.config.addresses.daiAddress;
const gasTokenAddress = network.config.addresses.gasTokenAddress;
const gelatoCoreAddress = network.config.addresses.gelatoCoreAddress;
const ethAddress = network.config.addresses.ethAddress;
const emptyHint = '0x';

let lending;
let swapImplementation;
let swapProxy;
let burnGasHelper;
let admin;
let adminAddress;
let gelatoCore;
let executor;

describe('test Krystal simple trades', async () => {
  before('tests', async () => {
    [admin, executor] = await ethers.getSigners();
    adminAddress = await admin.getAddress();

    const burnGasHelperFactory = await ethers.getContractFactory(
      'BurnGasHelper',
      admin,
    );
    burnGasHelper = await burnGasHelperFactory.deploy(
      adminAddress,
      gasTokenAddress,
      14154,
      6870,
      24000,
    );

    const lendingFactory = await ethers.getContractFactory(
      'SmartWalletLending',
      admin,
    );
    lending = await lendingFactory.deploy(adminAddress);

    const swapImplementationFactory = await ethers.getContractFactory(
      'SmartWalletSwapImplementation',
      admin,
    );

    swapImplementation = await swapImplementationFactory.deploy(adminAddress);

    const swapProxyFactory = await ethers.getContractFactory(
      'SmartWalletSwapProxy',
      admin,
    );

    const swapProxyWithoutFunctions = await swapProxyFactory.deploy(
      adminAddress,
      swapImplementation.address,
      kyberProxy,
      [uniswapRouter, sushiswapRouter],
    );

    // The proxy will not have the correct abis to be able to access the functions
    // of the implementation contract
    swapProxy = new ethers.Contract(
      swapProxyWithoutFunctions.address,
      SmartWalletSwapImplementation.abi,
      admin,
    );

    gelatoCore = await ethers.getContractAt(GelatoCore.abi, gelatoCoreAddress);

    const minExecutorStake = await gelatoCore.minExecutorStake();
    await gelatoCore.connect(executor).stakeExecutor({
      value: minExecutorStake,
      gasLimit: 5000000,
    });

    // approve allowance
    await swapProxy.approveAllowances(
      [wethAddress, usdtAddress, usdcAddress, daiAddress],
      [kyberProxy, uniswapRouter, sushiswapRouter],
      false,
    );

    // update storage data
    await swapProxy.updateLendingImplementation(lending.address);
    await swapProxy.updateSupportedPlatformWallets([adminAddress], true);
    await swapProxy.updateBurnGasHelper(burnGasHelper.address);

    // mint and transfer gas token to adminAddress
    const gasToken = await ethers.getContractAt('IGasToken', gasTokenAddress);
    await gasToken.mint(100);
    await gasToken.mint(100);
    await gasToken.transfer(adminAddress, 200);

    let tokenAddresses = [
      gasTokenAddress,
      usdtAddress,
      usdcAddress,
      daiAddress,
    ];
    for (let i = 0; i < tokenAddresses.length; i++) {
      let token = await ethers.getContractAt('IERC20Ext', tokenAddresses[i]);
      let val = ethers.utils.parseEther('100000');
      await token.approve(swapProxy.address, val.toString());
    }
  });

  it('trade e2t on kyber', async () => {
    let tokenAddresses = [usdtAddress, usdcAddress, daiAddress];

    let ethAmount = ethers.utils.parseEther('1'); // one eth
    for (let i = 0; i < tokenAddresses.length; i++) {
      let token = tokenAddresses[i];
      let data = await swapProxy.getExpectedReturnKyber(
        ethAddress,
        token,
        ethAmount.toString(),
        8,
        emptyHint,
      );
      let minRate = (data.expectedRate * 97) / 100;
      await swapProxy.swapKyber(
        ethAddress,
        token,
        ethAmount.toString(),
        minRate.toString(),
        adminAddress,
        8,
        adminAddress,
        emptyHint,
        false, // without gas token
        { value: ethAmount.toString(), gasLimit: 2000000 },
      );

      await swapProxy.swapKyber(
        ethAddress,
        token,
        ethAmount.toString(),
        minRate.toString(),
        adminAddress,
        8,
        adminAddress,
        emptyHint,
        true, // with gas token
        { value: ethAmount.toString(), gasLimit: 2000000 },
      );
    }
  });

  it('trade e2t on Uniswap', async () => {
    let tokenAddresses = [usdtAddress, usdcAddress, daiAddress];
    let routers = [uniswapRouter, sushiswapRouter];

    let ethAmount = ethers.utils.parseEther('1'); // one eth
    for (let i = 0; i < routers.length; i++) {
      for (let j = 0; j < tokenAddresses.length; j++) {
        let token = tokenAddresses[j];
        let tradePath = [wethAddress, token]; // get rate needs to use wethAddress
        let data = await swapProxy.getExpectedReturnUniswap(
          routers[i],
          ethAmount.toString(),
          tradePath,
          8,
        );
        let minDestAmount = Math.round((data.destAmount * 97) / 100);

        tradePath[0] = ethAddress; // trade needs to use eth address
        await swapProxy.swapUniswap(
          routers[i],
          ethAmount.toString(),
          minDestAmount.toString(),
          tradePath,
          adminAddress,
          8,
          adminAddress,
          true,
          false, // without gas token
          { value: ethAmount.toString() },
        );

        await swapProxy.swapUniswap(
          routers[i],
          ethAmount.toString(),
          minDestAmount.toString(),
          tradePath,
          adminAddress,
          8,
          adminAddress,
          true,
          true, // with gas token
          { value: ethAmount.toString() },
        );
      }
    }
  });

  it('trade t2e on kyber', async () => {
    let tokenAddresses = [usdtAddress, usdcAddress, daiAddress];

    for (let i = 0; i < tokenAddresses.length; i++) {
      let token = await ethers.getContractAt('IERC20Ext', tokenAddresses[i]);
      let tokenAmount = Math.round((await token.balanceOf(adminAddress)) / 5);
      let data = await swapProxy.getExpectedReturnKyber(
        tokenAddresses[i],
        ethAddress,
        tokenAmount.toString(),
        8,
        emptyHint,
      );
      let minRate = Math.round((data.expectedRate * 97) / 100);

      await swapProxy.swapKyber(
        tokenAddresses[i],
        ethAddress,
        tokenAmount.toString(),
        minRate.toString(),
        adminAddress,
        8,
        adminAddress,
        emptyHint,
        false, //without gas token
      );

      await swapProxy.swapKyber(
        tokenAddresses[i],
        ethAddress,
        tokenAmount.toString(),
        minRate.toString(),
        adminAddress,
        8,
        adminAddress,
        emptyHint,
        false, // with gas token
      );
    }
  });

  it('trade t2e on Uniswap', async () => {
    let tokenAddresses = [usdtAddress, usdcAddress, daiAddress];
    let routers = [uniswapRouter, sushiswapRouter];

    for (let i = 0; i < routers.length; i++) {
      for (let j = 0; j < tokenAddresses.length; j++) {
        let token = await ethers.getContractAt('IERC20Ext', tokenAddresses[j]);
        let tokenAmount = Math.round((await token.balanceOf(adminAddress)) / 5);
        let tradePath = [tokenAddresses[j], wethAddress]; // get rate needs to use wethAddress
        let data = await swapProxy.getExpectedReturnUniswap(
          routers[i],
          tokenAmount.toString(),
          tradePath,
          8,
        );
        let minDestAmount = Math.round((data.destAmount * 97) / 100);

        tradePath[1] = ethAddress; // trade needs to use eth address
        await swapProxy.swapUniswap(
          routers[i],
          tokenAmount.toString(),
          minDestAmount.toString(),
          tradePath,
          adminAddress,
          8,
          adminAddress,
          true,
          false, // without gas token
          { from: adminAddress },
        );

        await swapProxy.swapUniswap(
          routers[i],
          tokenAmount.toString(),
          minDestAmount.toString(),
          tradePath,
          adminAddress,
          8,
          adminAddress,
          true,
          true, // with gas token
          { from: adminAddress },
        );
      }
    }
  });
});
