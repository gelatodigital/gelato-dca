const { ethers, artifacts, network } = require('hardhat');
const { expect } = require('chai');
const gelato = require('@gelatonetwork/core');
const CPK = require('contract-proxy-kit');
const IERC20Ext = artifacts.readArtifactSync('IERC20Ext');
const SmartWalletSwapImplementation = artifacts.readArtifactSync(
  'SmartWalletSwapImplementation',
);
const GasToken = artifacts.readArtifactSync('IGasToken');

// mainnet addresses
const kyberProxy = '0x9AAb3f75489902f3a48495025729a0AF77d4b11e';
const weth = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
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

const { ethAddress, emptyHint } = require('./helper');

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
  before('test trade in uniswap curve', async () => {
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

    const conditionTimeStatefulFactory = await ethers.getContractFactory(
      'ConditionTimeStateful',
      admin,
    );

    conditionTimeStateful = await conditionTimeStatefulFactory.deploy(
      gelatoCoreAddress,
    );

    // approve allowance
    await swapProxy.approveAllowances(
      [weth, usdtAddress, usdcAddress, daiAddress],
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
      let token = await ethers.getContractAt(IERC20Ext.abi, tokenAddresses[i]);
      let val = ethers.utils.parseEther('100000');
      await token.approve(swapProxy.address, val.toString());
    }
  });

  it('trade e2t on kyber', async () => {
    let tokenNames = ['USDT', 'USDC', 'DAI'];
    let tokenAddresses = [usdtAddress, usdcAddress, daiAddress];
    // let tokenDecimals = [6, 6, 18];
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
        adminAddress,
        8,
        adminAddress,
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
    let ethAmount = ethers.utils.parseEther('1'); // one eth
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
          adminAddress,
          8,
          adminAddress,
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
          adminAddress,
          8,
          adminAddress,
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
      let token = await ethers.getContractAt(IERC20Ext.abi, tokenAddresses[i]);
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
        adminAddress,
        8,
        adminAddress,
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
        let token = await ethers.getContractAt(
          IERC20Ext.abi,
          tokenAddresses[j],
        );
        let tokenAmount = Math.round((await token.balanceOf(adminAddress)) / 5);
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
          adminAddress,
          8,
          adminAddress,
          true,
          false,
          { from: adminAddress },
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
          adminAddress,
          8,
          adminAddress,
          true,
          true,
          { from: adminAddress },
        );
        /* eslint-disable no-console */
        console.log(
          `[${routerNames[i]}] Transaction ${tokenNames[j]} -> ETH with gas token`,
        );
      }
    }
  });

  it('integrate gelato with user proxy', async () => {
    gelatoCore = await ethers.getContractAt(
      gelato.GelatoCore.abi,
      gelatoCoreAddress,
      admin,
    );

    // Unlock Gelato Provider
    let provider = await ethers.provider.getSigner(externalProviderAddress);
    let providerAddress = await provider.getAddress();

    await network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [providerAddress],
    });

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

    const minExecutorStake = await gelatoCore.minExecutorStake();
    await gelatoCore.connect(executor).stakeExecutor({
      value: minExecutorStake,
      gasLimit: 5000000,
    });

    let ifaceGnoSafe = new ethers.utils.Interface([
      'function enableModule(address)',
    ]);

    // Send some ETH To Proxy
    await admin.sendTransaction({
      to: cpk.address,
      value: ethers.utils.parseEther('1'),
    });

    const enableModuleTx = await cpk.execTransactions(
      [
        {
          to: cpk.address,
          operation: CPK.CALL,
          value: 0,
          data: ifaceGnoSafe.encodeFunctionData('enableModule', [
            gelatoCoreAddress,
          ]),
        },
      ],
      {
        gasLimit: 5000000,
      },
    );

    await enableModuleTx.transactionResponse.wait();

    const myGelatoProvider = {
      addr: providerAddress,
      module: gnosisSafeProviderModuleAddress,
    };

    const conditionEvery2minutes = new gelato.Condition({
      inst: conditionTimeStateful.address,
      data: await conditionTimeStateful.getConditionData(cpk.address),
    });

    let usdc = await ethers.getContractAt(IERC20Ext.abi, usdcAddress, admin);

    const tradeAmount = (5 * 10 ** 6).toString();
    const NUM_TRADES = 3;
    const totalAmount = (NUM_TRADES * Number(tradeAmount)).toString();

    const transferFromAction = new gelato.Action({
      addr: usdc.address,
      data: usdc.interface.encodeFunctionData('transferFrom', [
        adminAddress,
        cpk.address,
        tradeAmount,
      ]),
      operation: gelato.Operation.Call,
    });

    const approveAction = new gelato.Action({
      addr: usdc.address,
      data: usdc.interface.encodeFunctionData('approve', [
        swapProxy.address,
        tradeAmount,
      ]),
      operation: gelato.Operation.Call,
    });

    const swapKyberAction = new gelato.Action({
      addr: swapProxy.address,
      data: swapProxy.interface.encodeFunctionData('swapKyber', [
        usdcAddress,
        weth,
        tradeAmount,
        0,
        adminAddress,
        8,
        adminAddress,
        emptyHint,
        false,
      ]),
      operation: gelato.Operation.Call,
    });
    const TWO_MINUTES = 120;
    const actionUpdateConditionTime = new gelato.Action({
      addr: conditionTimeStateful.address,
      data: conditionTimeStateful.interface.encodeFunctionData('setRefTime', [
        TWO_MINUTES,
        0,
      ]),
      operation: gelato.Operation.Call,
    });

    let task = new gelato.Task({
      conditions: [conditionEvery2minutes],
      actions: [
        transferFromAction,
        approveAction,
        swapKyberAction,
        actionUpdateConditionTime,
      ],
      selfProviderGasLimit: 0,
      selfProviderGasPriceCeil: 0,
    });

    const submitTaskCycleTx = await cpk.execTransactions(
      [
        {
          to: gelatoCore.address,
          operation: CPK.CALL,
          value: 0,
          data: gelatoCore.interface.encodeFunctionData('submitTaskCycle', [
            myGelatoProvider,
            [task],
            999999999999,
            NUM_TRADES,
          ]),
        },
      ],
      {
        gasLimit: 5000000,
      },
    );

    let taskSubmitTxReceipt = await submitTaskCycleTx.transactionResponse.wait();
    let currentGelatoId = await gelatoCore.currentTaskReceiptId();
    let topics = gelatoCore.filters.LogTaskSubmitted(currentGelatoId).topics;
    let filter = {
      address: gelatoCore.address.toLowerCase(),
      blockhash: taskSubmitTxReceipt.blockHash,
      topics,
    };
    let logs = await admin.provider.getLogs(filter);
    let log = logs.find(
      (log) => log.transactionHash === taskSubmitTxReceipt.transactionHash,
    );
    let event = gelatoCore.interface.parseLog(log);
    let taskReceipt = event.args.taskReceipt;

    const taskSpec = new gelato.TaskSpec({
      conditions: [task.conditions[0].inst],
      actions: task.actions,
      gasPriceCeil: 0,
    });

    // Provide Task Spec
    const provideTaskSpecTx = await gelatoCore.connect(provider).multiProvide(
      await executor.getAddress(), // executor
      [taskSpec], // Task Specs
      [gnosisSafeProviderModuleAddress], // Gnosis Safe provider Module
      {
        value: ethers.utils.parseEther('5'),
      },
    );
    await provideTaskSpecTx.wait();

    // approve proxy before exec
    await usdc.approve(cpk.address, totalAmount);

    const oracleAbi = ['function latestAnswer() view returns (int256)'];
    const gelatoGasPriceOracleAddress = await gelatoCore.gelatoGasPriceOracle();

    // Get gelatoGasPriceOracleAddress
    const gelatoGasPriceOracle = await ethers.getContractAt(
      oracleAbi,
      gelatoGasPriceOracleAddress,
      admin,
    );

    // lastAnswer is used by GelatoGasPriceOracle as well as the Chainlink Oracle
    const gelatoGasPrice = await gelatoGasPriceOracle.latestAnswer();
    const gelatoMaxGas = await gelatoCore.gelatoMaxGas();

    for (let i = 0; i < NUM_TRADES; i++) {
      let canExecResult = await gelatoCore
        .connect(executor)
        .canExec(taskReceipt, gelatoMaxGas, gelatoGasPrice);

      expect(canExecResult).to.be.eq('OK');
      await expect(
        gelatoCore.connect(executor).exec(taskReceipt, {
          gasPrice: gelatoGasPrice,
          gasLimit: 5000000,
        }),
      ).to.emit(gelatoCore, 'LogExecSuccess');

      if (i != NUM_TRADES - 1) {
        const block = await admin.provider.getBlock();
        currentGelatoId = await gelatoCore.currentTaskReceiptId();
        topics = gelatoCore.filters.LogTaskSubmitted(currentGelatoId).topics;
        filter = {
          address: gelatoCore.address.toLowerCase(),
          blockhash: block.hash,
          topics,
        };
        logs = await admin.provider.getLogs(filter);
        event = gelatoCore.interface.parseLog(logs[0]);
        taskReceipt = event.args.taskReceipt;

        canExecResult = await gelatoCore
          .connect(executor)
          .canExec(taskReceipt, gelatoMaxGas, gelatoGasPrice);

        expect(canExecResult).to.be.eq(
          'ConditionNotOk:NotOkTimestampDidNotPass',
        );
        const executionTime = block.timestamp + TWO_MINUTES;
        await admin.provider.send('evm_mine', [executionTime]);
      }
    }
  });
});
