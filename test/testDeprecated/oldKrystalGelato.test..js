const { ethers, artifacts, network } = require('hardhat');
const { utils, BigNumber } = ethers;
const { expect } = require('chai');
const { GelatoCore } = require('@gelatonetwork/core');
const CPK = require('contract-proxy-kit');
const {
  encodeStandardTaskCycle,
  getSubmittedTaskReceipt,
  getGelatoGasPrices,
  enableGelatoCore,
  getTokenFromFaucet,
} = require('../gelatoHelper');
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
const masterCopy111Address = network.config.addresses.masterCopy111Address;
const cpkFactoryAddress = network.config.addresses.cpkFactoryAddress;
const multiSendAddress = network.config.addresses.multiSendAddress;
const fallbackHandlerAddress = network.config.addresses.fallbackHandlerAddress;
const gelatoCoreAddress = network.config.addresses.gelatoCoreAddress;
const externalProviderAddress =
  network.config.addresses.externalProviderAddress;
const gnosisSafeProviderModuleAddress =
  network.config.addresses.gnosisSafeProviderModuleAddress;

let swapImplementation;
let swapProxy;
let admin;
let adminAddress;
let gelatoCore;
let executor;
let conditionTimeStateful;

describe('(deprecated) test Krystal with Gelato', async () => {
  before('tests', async () => {
    [admin, executor] = await ethers.getSigners();
    adminAddress = await admin.getAddress();

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

    const conditionTimeStatefulFactory = await ethers.getContractFactory(
      'ConditionTimeStateful',
      admin,
    );

    conditionTimeStateful = await conditionTimeStatefulFactory.deploy(
      gelatoCoreAddress,
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
    // Unlock Gelato Provider
    let gelatoProvider = await ethers.provider.getSigner(
      externalProviderAddress,
    );

    await network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [externalProviderAddress],
    });

    const myGelatoProvider = {
      addr: externalProviderAddress,
      module: gnosisSafeProviderModuleAddress,
    };

    // Set up User Proxy
    let cpk = await CPK.create({
      ethers,
      signer: admin,
      networks: {
        31337: {
          masterCopyAddress: masterCopy111Address,
          proxyFactoryAddress: cpkFactoryAddress,
          multiSendAddress: multiSendAddress,
          fallbackHandlerAddress: fallbackHandlerAddress,
        },
      },
    });

    await enableGelatoCore(cpk, gelatoCoreAddress, CPK.CALL);

    // Encode Task
    const TWO_MINUTES = 120;
    const NUM_TRADES = 3;
    const dai = await ethers.getContractAt('IERC20Ext', daiAddress);
    const tradeAmount = utils.parseUnits('100', '18'); // 100 DAI

    // Get USDC form faucet
    await getTokenFromFaucet(
      daiAddress,
      adminAddress,
      tradeAmount.mul(NUM_TRADES),
    );

    const { task, taskSpec } = await encodeStandardTaskCycle(
      cpk,
      swapProxy,
      conditionTimeStateful,
      dai,
      wethAddress,
      tradeAmount,
      TWO_MINUTES,
    );

    // Set up Gelato Provider (whitelist Task Spec, provide funds)
    const provideTaskSpecTx = await gelatoCore
      .connect(gelatoProvider)
      .multiProvide(
        await executor.getAddress(), // executor
        [taskSpec], // Task Specs
        [myGelatoProvider.module], // Provider Module
        {
          value: ethers.utils.parseEther('5'),
        },
      );
    await provideTaskSpecTx.wait();

    // Submit Task Cylce
    const submitTaskCycleTx = await cpk.execTransactions(
      [
        {
          to: gelatoCore.address,
          operation: CPK.CALL,
          value: 0,
          data: gelatoCore.interface.encodeFunctionData('submitTaskCycle', [
            myGelatoProvider,
            [task],
            999999999999, // timeout
            NUM_TRADES,
          ]),
        },
      ],
      {
        gasLimit: 5000000,
      },
    );
    await submitTaskCycleTx.transactionResponse.wait();

    // Collect Gelato Task Receipt
    let taskReceipt = await getSubmittedTaskReceipt(gelatoCore);

    // Approve User Proxy to spend user token
    const totalApprove = tradeAmount.mul(BigNumber.from(NUM_TRADES));
    await dai.approve(cpk.address, totalApprove);

    // Fetch Gelato Gas Price
    const { gelatoGasPrice, gelatoMaxGas } = await getGelatoGasPrices(
      gelatoCore,
    );

    // Simulate Task Cycle
    for (let i = 0; i < NUM_TRADES; i++) {
      // Can execute? (should be OK)
      let canExecResult = await gelatoCore
        .connect(executor)
        .canExec(taskReceipt, gelatoMaxGas, gelatoGasPrice);

      expect(canExecResult).to.be.eq('OK');

      // Executor executes
      await expect(
        gelatoCore.connect(executor).exec(taskReceipt, {
          gasPrice: gelatoGasPrice,
          gasLimit: 5000000,
        }),
      ).to.emit(gelatoCore, 'LogExecSuccess');

      if (i != NUM_TRADES - 1) {
        // Collect next Task Receipt in cycle
        taskReceipt = await getSubmittedTaskReceipt(gelatoCore);

        // Can execute? (timestamp condition should block)
        canExecResult = await gelatoCore
          .connect(executor)
          .canExec(taskReceipt, gelatoMaxGas, gelatoGasPrice);
        expect(canExecResult).to.be.eq(
          'ConditionNotOk:NotOkTimestampDidNotPass',
        );

        // Fast forward to next execution timestamp
        const block = await admin.provider.getBlock();
        const executionTime = block.timestamp + TWO_MINUTES;
        await admin.provider.send('evm_mine', [executionTime]);
      }
    }
  });
});
