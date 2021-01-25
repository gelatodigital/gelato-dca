const { ethers, artifacts, network } = require('hardhat');
const { utils, BigNumber } = ethers;
const { expect } = require('chai');
const { canExec, exec } = require('./executor');
const {
  getSubmittedTaskV2,
  getGelatoGasPriceV2,
  getAggregatedOracles,
  getTokenFromFaucet,
} = require('./gelatoHelper');
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
const gasPriceOracleAddress = network.config.addresses.gasPriceOracleAddress;

let swapImplementation;
let swapProxy;
let admin;
let adminAddress;
let gelatoUser;
let gelatoUserAddress;
let executor;
let executorAddress;
let oracleAggregator;
let gelatoKrystal;

describe('test Krystal with Gelato V2 - No Gelato Core', async () => {
  before('tests', async () => {
    [admin, executor, gelatoUser] = await ethers.getSigners();
    adminAddress = await admin.getAddress();
    executorAddress = await executor.getAddress();
    gelatoUserAddress = await gelatoUser.getAddress();

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

    const {
      tokensA,
      tokensB,
      oracles,
      stablecoins,
      decimals,
    } = getAggregatedOracles();

    const oracleAggregatorFactory = await ethers.getContractFactory(
      'OracleAggregator',
      admin,
    );

    oracleAggregator = await oracleAggregatorFactory.deploy(
      wethAddress,
      tokensA,
      tokensB,
      oracles,
      stablecoins,
      decimals,
    );

    const gelatoKrystalV2Factory = await ethers.getContractFactory(
      'GelatoKrystalV2',
      admin,
    );

    gelatoKrystal = await gelatoKrystalV2Factory.deploy(
      executorAddress,
      oracleAggregator.address,
      gasPriceOracleAddress,
      swapProxy.address,
      adminAddress,
    );

    // approve allowance
    await swapProxy.approveAllowances(
      [wethAddress, usdtAddress, usdcAddress, daiAddress],
      [kyberProxy, uniswapRouter, sushiswapRouter],
      false,
    );

    // update storage data
    await swapProxy.updateSupportedPlatformWallets([adminAddress], true);
  });

  it('trade t2t on kyber (cycle)', async () => {
    // Encode Task
    const TWO_MINUTES = 120;
    const NUM_TRADES = 3;
    const dai = await ethers.getContractAt('IERC20Ext', daiAddress);
    const usdc = await ethers.getContractAt('IERC20Ext', usdcAddress);
    const tradeAmount = utils.parseUnits('1000', '18'); // 1000 DAI

    // Get DAI form faucet
    await getTokenFromFaucet(
      daiAddress,
      gelatoUserAddress,
      tradeAmount.mul(NUM_TRADES),
    );

    const submitTx = await gelatoKrystal
      .connect(gelatoUser)
      .submit(
        daiAddress,
        usdcAddress,
        tradeAmount,
        NUM_TRADES,
        9000,
        8000,
        TWO_MINUTES,
        0,
      );
    submitTx.wait();

    // Collect Gelato Task Receipt
    let taskReceipt = await getSubmittedTaskV2(gelatoKrystal);

    // Approve User Proxy to spend user token
    const totalApprove = tradeAmount.mul(BigNumber.from(NUM_TRADES));
    await dai.connect(gelatoUser).approve(gelatoKrystal.address, totalApprove);

    // Fetch Gelato Gas Price
    const gelatoGasPrice = await getGelatoGasPriceV2(gasPriceOracleAddress);

    const daiBalanceBefore = await dai.balanceOf(gelatoUserAddress);
    const usdcBalanceBefore = await usdc.balanceOf(gelatoUserAddress);

    // Simulate Task Cycle
    for (let i = 0; i < NUM_TRADES; i++) {
      let res = await canExec(
        executor,
        taskReceipt.canExecAddress,
        taskReceipt.canExecPayload,
      );
      expect(res).to.be.eq(
        'VM Exception while processing transaction: revert SafeMath: subtraction overflow',
      );

      // Fast forward to next execution timestamp
      const block = await admin.provider.getBlock();
      const executionTime = block.timestamp + TWO_MINUTES;
      await admin.provider.send('evm_mine', [executionTime]);

      // Can execute? (should be OK)
      res = await canExec(
        executor,
        taskReceipt.canExecAddress,
        taskReceipt.canExecPayload,
      );
      expect(res).to.be.eq('OK');

      // Executor executes
      res = await exec(
        executor,
        taskReceipt.execAddress,
        taskReceipt.execFunctionAbi,
        taskReceipt.execParams,
        gelatoGasPrice,
      );
      expect(res).to.be.eq('OK');

      if (i != NUM_TRADES - 1) {
        // Collect next Task Receipt in cycle
        taskReceipt = await getSubmittedTaskV2(gelatoKrystal);
      }
    }
    const daiBalanceAfter = await dai.balanceOf(gelatoUserAddress);
    const usdcBalanceAfter = await usdc.balanceOf(gelatoUserAddress);
    expect(daiBalanceBefore).to.be.gt(daiBalanceAfter);
    expect(usdcBalanceBefore).to.be.lt(usdcBalanceAfter);
  });
});
