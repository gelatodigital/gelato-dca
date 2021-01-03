const { ethers, artifacts, network } = require('hardhat');
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
const kyberProxy = '0x9AAb3f75489902f3a48495025729a0AF77d4b11e';
const wethAddress = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
const uniswapRouter = '0x7a250d5630b4cf539739df2c5dacb4c659f2488d';
const sushiswapRouter = '0xd9e1ce17f2641f24ae83637ab66a2cca9c378b9f';
const usdtAddress = '0xdac17f958d2ee523a2206206994597c13d831ec7';
const usdcAddress = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const daiAddress = '0x6b175474e89094c44da98b954eedeac495271d0f';
const gasTokenAddress = '0x0000000000b3F879cb30FE243b4Dfee438691c04';
const masterCopy111Address = '0x34CfAC646f301356fAa8B21e94227e3583Fe3F5F';
const cpkFactoryAddress = '0x0fB4340432e56c014fa96286de17222822a9281b';
const multiSendAddress = '0xB522a9f781924eD250A11C54105E51840B138AdD';
const fallbackHandlerAddress = '0x40A930851BD2e590Bd5A5C981b436de25742E980';
const gelatoCoreAddress = '0x025030bdaa159f281cae63873e68313a703725a5';
const externalProviderAddress = '0x3d9A46b5D421bb097AC28B4f70a4A1441A12920C';
const gnosisSafeProviderModuleAddress =
  '0x2E87AD9BBdaa9113cd5cA1920c624E2749D7086B';
const ethAddress = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
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
    let gelatoProviderAddress = await gelatoProvider.getAddress();

    await network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [gelatoProviderAddress],
    });

    const myGelatoProvider = {
      addr: gelatoProviderAddress,
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
    const tradeAmount = 5 * 10 ** 6; // 5 USDC
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
    const totalApprove = (tradeAmount * NUM_TRADES).toString();
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
