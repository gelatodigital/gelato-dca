const { ethers, artifacts, network } = require('hardhat');
const { utils, BigNumber } = ethers;
const { expect } = require('chai');
const { GelatoCore } = require('@gelatonetwork/core');
const {
  getSubmittedTaskReceipt,
  getGelatoGasPrices,
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
const gelatoCoreAddress = network.config.addresses.gelatoCoreAddress;

let swapImplementation;
let swapProxy;
let admin;
let adminAddress;
let gelatoUser;
let gelatoUserAddress;
let gelatoCore;
let executor;
let gelatoKrystal;

describe('test Krystal with Gelato V1 - No User Proxy', async () => {
  before('tests', async () => {
    [admin, executor, gelatoUser] = await ethers.getSigners();
    adminAddress = await admin.getAddress();
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

    gelatoCore = await ethers.getContractAt(GelatoCore.abi, gelatoCoreAddress);

    const minExecutorStake = await gelatoCore.minExecutorStake();
    await gelatoCore.connect(executor).stakeExecutor({
      value: minExecutorStake,
      gasLimit: 5000000,
    });

    const gelatoKrystalFactory = await ethers.getContractFactory(
      'GelatoKrystal',
      admin,
    );

    gelatoKrystal = await gelatoKrystalFactory.deploy(
      gelatoCore.address,
      network.config.addresses.oracleAggregatorAddress,
      swapProxy.address,
      await executor.getAddress(),
      adminAddress, // the platform wallet must be admin or it causes an error in the swap
      { value: ethers.utils.parseEther('10') },
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
    const tradeAmount = utils.parseUnits('1000', '18'); // 1000 DAI

    // Get DAI form faucet
    await getTokenFromFaucet(
      daiAddress,
      gelatoUserAddress,
      tradeAmount.mul(NUM_TRADES),
    );

    const order = {
      _inToken: daiAddress,
      _outToken: usdcAddress,
      _amountPerTrade: tradeAmount,
      _nTrades: NUM_TRADES,
      _minSlippage: 100, // starts at 1%
      _maxSlippage: 0, // max slippage of 10%
      _delay: TWO_MINUTES,
      _gasPriceCeil: 0,
    };

    const submitTx = await gelatoKrystal
      .connect(gelatoUser)
      .submitDCAKyber(order);
    submitTx.wait();

    // Collect Gelato Task Receipt
    let taskReceipt = await getSubmittedTaskReceipt(gelatoCore);

    // Approve User Proxy to spend user token
    const totalApprove = tradeAmount.mul(BigNumber.from(NUM_TRADES));
    await dai.connect(gelatoUser).approve(gelatoKrystal.address, totalApprove);

    // Fetch Gelato Gas Price
    const { gelatoGasPrice, gelatoMaxGas } = await getGelatoGasPrices(
      gelatoCore,
    );

    // Simulate Task Cycle
    for (let i = 0; i < NUM_TRADES; i++) {
      // Can execute? (timestamp condition should block)
      let canExecResult = await gelatoCore
        .connect(executor)
        .canExec(taskReceipt, gelatoMaxGas, gelatoGasPrice);
      expect(canExecResult).to.be.eq(
        'ConditionNotOk:GelatoKrystsal: Time not passed',
      );

      // Fast forward to next execution timestamp
      const block = await admin.provider.getBlock();
      const executionTime = block.timestamp + TWO_MINUTES;
      await admin.provider.send('evm_mine', [executionTime]);

      // Can execute? (should be OK)
      canExecResult = await gelatoCore
        .connect(executor)
        .canExec(taskReceipt, gelatoMaxGas, gelatoGasPrice);

      expect(canExecResult).to.be.eq('OK');

      const executorEthBefore = await executor.provider.getBalance(
        await executor.getAddress(),
      );
      // Executor executes
      await expect(
        gelatoCore.connect(executor).exec(taskReceipt, {
          gasPrice: gelatoGasPrice,
          gasLimit: 5000000,
        }),
      ).to.emit(gelatoCore, 'LogExecSuccess');
      const executorEthAfter = await executor.provider.getBalance(
        await executor.getAddress(),
      );
      const ethSpent =
        Number(utils.formatEther(executorEthBefore)) -
        Number(utils.formatEther(executorEthAfter));
      console.log(`    -----------------------------------------`);
      console.log(
        `    exec gas cost: ${ethSpent.toFixed(5)} ETH (${Number(
          utils.parseEther(ethSpent.toString()) / gelatoGasPrice,
        ).toFixed(2)} gas)`,
      );
      console.log(`    -----------------------------------------`);

      if (i != NUM_TRADES - 1) {
        // Collect next Task Receipt in cycle
        taskReceipt = await getSubmittedTaskReceipt(gelatoCore);
      }
    }
  });
});
