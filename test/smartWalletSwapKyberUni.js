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
} = require('./gelatoHelper');
const SmartWalletSwapImplementation = artifacts.readArtifactSync(
  'SmartWalletSwapImplementation',
);
const GasToken = artifacts.readArtifactSync('IGasToken');

// mainnet addresses
const kyberProxy = network.config.kyberProxy;
const wethAddress = network.config.wethAddress;
const uniswapRouter = network.config.uniswapRouter;
const sushiswapRouter = network.config.sushiswapRouter;
const usdtAddress = network.config.usdtAddress;
const usdcAddress = network.config.usdcAddress;
const daiAddress = network.config.daiAddress;
const gasTokenAddress = network.config.gasTokenAddress;
const masterCopy111Address = network.config.masterCopy111Address;
const cpkFactoryAddress = network.config.cpkFactoryAddress;
const multiSendAddress = network.config.multiSendAddress;
const fallbackHandlerAddress = network.config.fallbackHandlerAddress;
const gelatoCoreAddress = network.config.gelatoCoreAddress;
const externalProviderAddress = network.config.externalProviderAddress;
const gnosisSafeProviderModuleAddress =
  network.config.gnosisSafeProviderModuleAddress;
const ethAddress = network.config.ethAddress;
const emptyHint = '0x';

let lending;
let swapImplementation;
let swapProxy;
let burnGasHelper;
let admin;
let adminAddress;
let gelatoCore;
let executor;
let conditionTimeStateful;

describe('test some simple trades', async () => {
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
    await swapProxy.updateLendingImplementation(lending.address);
    await swapProxy.updateSupportedPlatformWallets([adminAddress], true);
    await swapProxy.updateBurnGasHelper(burnGasHelper.address);

    // mint and transfer gas token to adminAddress
    let gasToken = await ethers.getContractAt(GasToken.abi, gasTokenAddress);
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

  it('basic gelato integration (user proxy)', async () => {
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
    const usdc = await ethers.getContractAt('IERC20Ext', usdcAddress);
    const tradeAmount = utils.parseUnits('5', '6'); // 5 USDC
    const { task, taskSpec } = await encodeStandardTaskCycle(
      cpk,
      swapProxy,
      conditionTimeStateful,
      usdc,
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
    const NUM_TRADES = 3;
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
    await usdc.approve(cpk.address, totalApprove);

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
