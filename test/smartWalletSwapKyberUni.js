const hre = require('hardhat');
const IERC20Ext = hre.artifacts.readArtifactSync('IERC20Ext');
const SmartWalletSwapImplementation = hre.artifacts.readArtifactSync(
  'SmartWalletSwapImplementation',
);
// const SmartWalletSwapProxy = hre.artifacts.readArtifactSync('SmartWalletSwapProxy');
const SmartWalletLending = hre.artifacts.readArtifactSync('SmartWalletLending');
const BurnGasHelper = hre.artifacts.readArtifactSync('BurnGasHelper');
const GasToken = hre.artifacts.readArtifactSync('IGasToken');

// address of uniswap router in mainnet
const kyberProxy = '0x9AAb3f75489902f3a48495025729a0AF77d4b11e';
const weth = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
const uniswapRouter = '0x7a250d5630b4cf539739df2c5dacb4c659f2488d';
const sushiswapRouter = '0xd9e1ce17f2641f24ae83637ab66a2cca9c378b9f';
const usdtAddress = '0xdac17f958d2ee523a2206206994597c13d831ec7';
const usdcAddress = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const daiAddress = '0x6b175474e89094c44da98b954eedeac495271d0f';
const gasTokenAddress = '0x0000000000b3F879cb30FE243b4Dfee438691c04';

const { ethAddress, emptyHint } = require('./helper');

let lending;
let swapImplementation;
let swapProxy;
let burnGasHelper;
let user;
let admin;

describe('test some simple trades', async () => {
  before('test trade in uniswap curve', async () => {
    [admin] = await hre.ethers.getSigners();
    user = admin.address;
    const burnGasHelperFactory = await hre.ethers.getContractFactory(
      'BurnGasHelper',
      admin,
    );
    const gasHelperDeployTx = await burnGasHelperFactory.deploy(
      admin.address,
      gasTokenAddress,
      14154,
      6870,
      24000,
    );
    await gasHelperDeployTx.deployed();
    burnGasHelper = new hre.ethers.Contract(
      gasHelperDeployTx.address,
      BurnGasHelper.abi,
      admin,
    );

    const lendingFactory = await hre.ethers.getContractFactory(
      'SmartWalletLending',
      admin,
    );
    const lendingDeployTx = await lendingFactory.deploy(admin.address);
    await lendingDeployTx.deployed();
    lending = new hre.ethers.Contract(
      lendingDeployTx.address,
      SmartWalletLending.abi,
      admin,
    );

    const swapImplementationFactory = await hre.ethers.getContractFactory(
      'SmartWalletSwapImplementation',
      admin,
    );
    const swapImplementationDeployTx = await swapImplementationFactory.deploy(
      admin.address,
    );
    await swapImplementationDeployTx.deployed();
    swapImplementation = new hre.ethers.Contract(
      swapImplementationDeployTx.address,
      SmartWalletSwapImplementation.abi,
      admin,
    );

    const swapProxyFactory = await hre.ethers.getContractFactory(
      'SmartWalletSwapProxy',
      admin,
    );
    const swapProxyDeployTx = await swapProxyFactory.deploy(
      admin.address,
      swapImplementation.address,
      kyberProxy,
      [uniswapRouter, sushiswapRouter],
    );
    swapProxy = new hre.ethers.Contract(
      swapProxyDeployTx.address,
      SmartWalletSwapImplementation.abi,
      admin,
    );

    // approve allowance
    await swapProxy.approveAllowances(
      [weth, usdtAddress, usdcAddress, daiAddress],
      [kyberProxy, uniswapRouter, sushiswapRouter],
      false,
    );
    // update storage data
    await swapProxy.updateLendingImplementation(lending.address);
    await swapProxy.updateSupportedPlatformWallets([user], true);
    await swapProxy.updateBurnGasHelper(burnGasHelper.address);

    // mint and transfer gas token to user
    let gasToken = new hre.ethers.Contract(
      gasTokenAddress,
      GasToken.abi,
      admin,
    );
    await gasToken.mint(100);
    await gasToken.mint(100);
    await gasToken.transfer(user, 200);

    let tokenAddresses = [
      gasTokenAddress,
      usdtAddress,
      usdcAddress,
      daiAddress,
    ];
    for (let i = 0; i < tokenAddresses.length; i++) {
      let token = new hre.ethers.Contract(
        tokenAddresses[i],
        IERC20Ext.abi,
        admin,
      );
      let val = hre.ethers.utils.parseEther('100000');
      await token.approve(swapProxy.address, val.toString());
    }
  });

  it('trade e2t on kyber', async () => {
    let tokenNames = ['USDT', 'USDC', 'DAI'];
    let tokenAddresses = [usdtAddress, usdcAddress, daiAddress];
    // let tokenDecimals = [6, 6, 18];
    let ethAmount = hre.ethers.utils.parseEther('1'); // one eth
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
        user,
        8,
        user,
        emptyHint,
        false,
        { value: ethAmount.toString(), gasLimit: 2000000 },
      );
      /* eslint-disable no-console */
      console.log(
        `[Kyber] Transaction ETH -> ${tokenNames[i]} without gas token`,
      );
      await swapProxy.swapKyber(
        ethAddress,
        token,
        ethAmount.toString(),
        minRate.toString(),
        user,
        8,
        user,
        emptyHint,
        true,
        { value: ethAmount.toString(), gasLimit: 2000000 },
      );
      /* eslint-disable no-console */
      console.log(`[Kyber] Transaction ETH -> ${tokenNames[i]} with gas token`);
    }
  });

  it('trade e2t on Uniswap', async () => {
    let tokenNames = ['USDT', 'USDC', 'DAI'];
    let tokenAddresses = [usdtAddress, usdcAddress, daiAddress];
    let routers = [uniswapRouter, sushiswapRouter];
    let routerNames = ['Uniswap', 'Sushiswap'];
    // let tokenDecimals = [6, 6, 18];
    let ethAmount = hre.ethers.utils.parseEther('1'); // one eth
    for (let i = 0; i < routers.length; i++) {
      for (let j = 0; j < tokenAddresses.length; j++) {
        let token = tokenAddresses[j];
        let tradePath = [weth, token]; // get rate needs to use weth
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
          user,
          8,
          user,
          true,
          false,
          { value: ethAmount.toString() },
        );
        /* eslint-disable no-console */
        console.log(
          `[${routerNames[i]}] Transaction ETH -> ${tokenNames[j]} without gas token`,
        );
        await swapProxy.swapUniswap(
          routers[i],
          ethAmount.toString(),
          minDestAmount.toString(),
          tradePath,
          user,
          8,
          user,
          true,
          true,
          { value: ethAmount.toString() },
        );
        /* eslint-disable no-console */
        console.log(
          `[${routerNames[i]}] Transaction ETH -> ${tokenNames[j]} with gas token`,
        );
      }
    }
  });

  it('trade t2e on kyber', async () => {
    let tokenNames = ['USDT', 'USDC', 'DAI'];
    let tokenAddresses = [usdtAddress, usdcAddress, daiAddress];
    for (let i = 0; i < tokenAddresses.length; i++) {
      let token = new hre.ethers.Contract(
        tokenAddresses[i],
        IERC20Ext.abi,
        admin,
      );
      let tokenAmount = Math.round((await token.balanceOf(user)) / 5);
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
        user,
        8,
        user,
        emptyHint,
        false,
      );
      /* eslint-disable no-console */
      console.log(
        `[Kyber] Transaction ${tokenNames[i]} -> ETH without gas token`,
      );
      await swapProxy.swapKyber(
        tokenAddresses[i],
        ethAddress,
        tokenAmount.toString(),
        minRate.toString(),
        user,
        8,
        user,
        emptyHint,
        false,
      );
      /* eslint-disable no-console */
      console.log(`[Kyber] Transaction ${tokenNames[i]} -> ETH with gas token`);
    }
  });

  it('trade t2e on Uniswap', async () => {
    let tokenNames = ['USDT', 'USDC', 'DAI'];
    let tokenAddresses = [usdtAddress, usdcAddress, daiAddress];
    let routers = [uniswapRouter, sushiswapRouter];
    let routerNames = ['Uniswap', 'Sushiswap'];
    for (let i = 0; i < routers.length; i++) {
      for (let j = 0; j < tokenAddresses.length; j++) {
        let token = new hre.ethers.Contract(
          tokenAddresses[j],
          IERC20Ext.abi,
          admin,
        );
        let tokenAmount = Math.round((await token.balanceOf(user)) / 5);
        let tradePath = [tokenAddresses[j], weth]; // get rate needs to use weth
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
          user,
          8,
          user,
          true,
          false,
          { from: user },
        );
        /* eslint-disable no-console */
        console.log(
          `[${routerNames[i]}] Transaction ${tokenNames[j]} -> ETH without gas token`,
        );
        await swapProxy.swapUniswap(
          routers[i],
          tokenAmount.toString(),
          minDestAmount.toString(),
          tradePath,
          user,
          8,
          user,
          true,
          true,
          { from: user },
        );
        /* eslint-disable no-console */
        console.log(
          `[${routerNames[i]}] Transaction ${tokenNames[j]} -> ETH with gas token`,
        );
      }
    }
  });
});
