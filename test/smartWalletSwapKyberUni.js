const IERC20Ext = artifacts.require('@kyber.network/utils-sc/contracts/IERC20Ext.sol');
const SmartWalletSwapImplementation = artifacts.require('SmartWalletSwapImplementation.sol');
const SmartWalletSwapProxy = artifacts.require('SmartWalletSwapProxy.sol');
const SmartWalletLending = artifacts.require('SmartWalletLending.sol');
const BurnGasHelper = artifacts.require('BurnGasHelper.sol');
const GasToken = artifacts.require('IGasToken.sol');
// const IKyberProxy = artifacts.require('IKyberProxy.sol');
// const UniswapRouterV02 = artifacts.require('@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol');

const BN = web3.utils.BN;

// address of uniswap router in mainnet
const kyberProxy = "0x9AAb3f75489902f3a48495025729a0AF77d4b11e";
const weth = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const uniswapRouter = '0x7a250d5630b4cf539739df2c5dacb4c659f2488d';
const sushiswapRouter = '0xd9e1ce17f2641f24ae83637ab66a2cca9c378b9f';
const usdtAddress = '0xdac17f958d2ee523a2206206994597c13d831ec7';
const usdcAddress = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const daiAddress = '0x6b175474e89094c44da98b954eedeac495271d0f';
const gasTokenAddress = '0x0000000000b3F879cb30FE243b4Dfee438691c04';

const {ethAddress, ethDecimals, emptyHint} = require('./helper');
// const Helper = require('./helper');

let lending;
let swapImplementation;
let swapProxy;
let burnGasHelper;
let user;
let admin;

contract('SmartWalletSwapImplementation', accounts => {
  describe('test some simple trades', async () => {
    before('test trade in uniswap curve', async () => {
      user = accounts[0];
      admin = accounts[0];
      burnGasHelper = await BurnGasHelper.new(
        admin, gasTokenAddress, 14154, 6870, 24000
      );

      lending = await SmartWalletLending.new(admin);
      swapImplementation = await SmartWalletSwapImplementation.new(admin);
      swapProxy = await SmartWalletSwapProxy.new(
        admin,
        swapImplementation.address,
        kyberProxy,
        [uniswapRouter, sushiswapRouter]
      );
      swapProxy = await SmartWalletSwapImplementation.at(swapProxy.address);

      // approve allowance
      await swapProxy.approveAllowances(
        [weth, usdtAddress, usdcAddress, daiAddress], [kyberProxy, uniswapRouter, sushiswapRouter], false, { from: admin }
      );
      // update storage data
      await swapProxy.updateLendingImplementation(lending.address, { from: admin });
      await swapProxy.updateSupportedPlatformWallets([user], true, { from: admin });
      await swapProxy.updateBurnGasHelper(burnGasHelper.address, { from: admin });

      // mint and transfer gas token to user
      let gasToken = await GasToken.at(gasTokenAddress);
      await gasToken.mint(100);
      await gasToken.mint(100);
      await gasToken.transfer(user, 200);

      let tokenAddresses = [gasTokenAddress, usdtAddress, usdcAddress, daiAddress];
      for(let i = 0; i < tokenAddresses.length; i++) {
        let token = await IERC20Ext.at(tokenAddresses[i]);
        await token.approve(swapProxy.address, new BN(2).pow(new BN(255)), { from: user });
      }

      swapProxy = await SmartWalletSwapImplementation.at(swapProxy.address);
    });
  
    it('trade e2t on kyber', async () => {
      let tokenNames = ["USDT", "USDC", "DAI"];
      let tokenAddresses = [usdtAddress, usdcAddress, daiAddress];
      // let tokenDecimals = [6, 6, 18];
      let ethAmount = new BN(10).pow(new BN(ethDecimals)); // one eth
      for(let i = 0; i < tokenAddresses.length; i++) {
        let token = tokenAddresses[i];
        let data = await swapProxy.getExpectedReturnKyber(ethAddress, token, ethAmount, 8, emptyHint);
        let minRate = data.expectedRate.mul(new BN(97)).div(new BN(100));

        let tx = await swapProxy.swapKyber(
          ethAddress, token, ethAmount, minRate, user, 8, user, emptyHint, false, { from: user, value: ethAmount, gas: 2000000 }
        );
        console.log(`[Kyber] Transaction gas used ETH -> ${tokenNames[i]} without gas token: ${tx.receipt.gasUsed}`);
        tx = await swapProxy.swapKyber(
          ethAddress, token, ethAmount, minRate, user, 8, user, emptyHint, true, { from: user, value: ethAmount, gas: 2000000 }
        );
        console.log(`[Kyber] Transaction gas used ETH -> ${tokenNames[i]} with gas token: ${tx.receipt.gasUsed}`);
      }
    });

    it('trade e2t on Uniswap', async () => {
      let tokenNames = ["USDT", "USDC", "DAI"];
      let tokenAddresses = [usdtAddress, usdcAddress, daiAddress];
      let routers = [uniswapRouter, sushiswapRouter];
      let routerNames = ["Uniswap", "Sushiswap"];
      // let tokenDecimals = [6, 6, 18];
      let ethAmount = new BN(10).pow(new BN(ethDecimals)); // one eth
      for(let i = 0; i < routers.length; i++) {
        for(let j = 0; j < tokenAddresses.length; j++) {
          let token = tokenAddresses[j];
          let tradePath = [weth, token]; // get rate needs to use weth
          let data = await swapProxy.getExpectedReturnUniswap(routers[i], ethAmount, tradePath, 8);
          let minDestAmount = data.destAmount.mul(new BN(97)).div(new BN(100));
  
          tradePath[0] = ethAddress; // trade needs to use eth address
          let tx = await swapProxy.swapUniswap(
            routers[i], ethAmount, minDestAmount, tradePath, user, 8, user, true, false, { from: user, value: ethAmount }
          );
          console.log(`[${routerNames[i]}] Transaction gas used ETH -> ${tokenNames[j]} without gas token: ${tx.receipt.gasUsed}`);
          tx = await swapProxy.swapUniswap(
            routers[i], ethAmount, minDestAmount, tradePath, user, 8, user, true, true, { from: user, value: ethAmount }
          );
          console.log(`[${routerNames[i]}] Transaction gas used ETH -> ${tokenNames[j]} with gas token: ${tx.receipt.gasUsed}`);
        }
      }
    });

    it('trade t2e on kyber', async () => {
      let tokenNames = ["USDT", "USDC", "DAI"];
      let tokenAddresses = [usdtAddress, usdcAddress, daiAddress];
      for(let i = 0; i < tokenAddresses.length; i++) {
        let token = await IERC20Ext.at(tokenAddresses[i]);
        let tokenAmount = (await token.balanceOf(user)).div(new BN(5));
        let data = await swapProxy.getExpectedReturnKyber(tokenAddresses[i], ethAddress, tokenAmount, 8, emptyHint);
        let minRate = data.expectedRate.mul(new BN(97)).div(new BN(100));

        let tx = await swapProxy.swapKyber(
          tokenAddresses[i], ethAddress, tokenAmount, minRate, user, 8, user, emptyHint, false, { from: user }
        );
        console.log(`[Kyber] Transaction gas used ${tokenNames[i]} -> ETH without gas token: ${tx.receipt.gasUsed}`);
        tx = await swapProxy.swapKyber(
          tokenAddresses[i], ethAddress, tokenAmount, minRate, user, 8, user, emptyHint, false, { from: user }
        );
        console.log(`[Kyber] Transaction gas used ${tokenNames[i]} -> ETH with gas token: ${tx.receipt.gasUsed}`);
      }
    });

    it('trade t2e on Uniswap', async () => {
      let tokenNames = ["USDT", "USDC", "DAI"];
      let tokenAddresses = [usdtAddress, usdcAddress, daiAddress];
      let routers = [uniswapRouter, sushiswapRouter];
      let routerNames = ["Uniswap", "Sushiswap"];
      for(let i = 0; i < routers.length; i++) {
        for(let j = 0; j < tokenAddresses.length; j++) {
          let token = await IERC20Ext.at(tokenAddresses[j]);
          let tokenAmount = (await token.balanceOf(user)).div(new BN(5));
          let tradePath = [tokenAddresses[j], weth]; // get rate needs to use weth
          let data = await swapProxy.getExpectedReturnUniswap(routers[i], tokenAmount, tradePath, 8);
          let minDestAmount = data.destAmount.mul(new BN(97)).div(new BN(100));
  
          tradePath[1] = ethAddress; // trade needs to use eth address
          let tx = await swapProxy.swapUniswap(
            routers[i], tokenAmount, minDestAmount, tradePath, user, 8, user, true, false, { from: user }
          );
          console.log(`[${routerNames[i]}] Transaction gas used ${tokenNames[j]} -> ETH without gas token: ${tx.receipt.gasUsed}`);
          tx = await swapProxy.swapUniswap(
            routers[i], tokenAmount, minDestAmount, tradePath, user, 8, user, true, true, { from: user }
          );
          console.log(`[${routerNames[i]}] Transaction gas used ${tokenNames[j]} -> ETH with gas token: ${tx.receipt.gasUsed}`);
        }
      }
    });
  });
});
