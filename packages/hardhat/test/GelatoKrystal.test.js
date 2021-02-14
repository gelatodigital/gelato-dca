const {ethers, artifacts, network, run} = require("hardhat");
const {utils, BigNumber} = ethers;
const {expect} = require("chai");
const {canExec} = require("../helpers/canExecKrystal");
const {
  getSubmittedTask,
  getGelatoGasPrice,
  getTokenFromFaucet,
} = require("../helpers/gelatoHelper");
const setupGelato = require("../gelatoSetup/setupGelato");
const whitelistService = require("../gelatoSetup/whitelistService");
const SmartWalletSwapImplementation = artifacts.readArtifactSync(
  "SmartWalletSwapImplementation"
);

// mainnet addresses
const kyberProxy = network.config.KyberProxy;
const uniswapRouter = network.config.UniswapRouter;
const sushiswapRouter = network.config.SushiswapRouter;
const ethAddress = network.config.ETH;
const wethAddress = network.config.WETH;
const usdtAddress = network.config.USDT;
const usdcAddress = network.config.USDC;
const daiAddress = network.config.DAI;
const gasPriceOracleAddress = network.config.GelatoGasPriceOracle;

let swapImplementation;
let swapProxy;
let admin;
let adminAddress;
let gelatoUser;
let gelatoUserAddress;
let executor;
let executorAddress;
let gelatoKrystal;
let gelatoAddressStorage;
let executorModule;

describe("test GelatoKrystal", function () {
  this.timeout(0);
  before("tests", async () => {
    [admin, executor, gelatoUser] = await ethers.getSigners();
    adminAddress = await admin.getAddress();
    executorAddress = await executor.getAddress();
    gelatoUserAddress = await gelatoUser.getAddress();

    const gelatoContracts = await setupGelato(admin, executor);
    gelatoAddressStorage = gelatoContracts.gelatoAddressStorage;
    executorModule = gelatoContracts.executorModule;
    const serviceRegistry = gelatoContracts.serviceRegistry;

    const swapImplementationFactory = await ethers.getContractFactory(
      "SmartWalletSwapImplementation",
      admin
    );

    swapImplementation = await swapImplementationFactory.deploy(adminAddress);

    const swapProxyFactory = await ethers.getContractFactory(
      "SmartWalletSwapProxy",
      admin
    );

    const swapProxyWithoutFunctions = await swapProxyFactory.deploy(
      adminAddress,
      swapImplementation.address,
      kyberProxy,
      [uniswapRouter, sushiswapRouter]
    );

    // The proxy will not have the correct abis to be able to access the functions
    // of the implementation contract
    swapProxy = new ethers.Contract(
      swapProxyWithoutFunctions.address,
      SmartWalletSwapImplementation.abi,
      admin
    );

    const GelatoKrystalFactory = await ethers.getContractFactory(
      "GelatoKrystal",
      admin
    );

    gelatoKrystal = await GelatoKrystalFactory.deploy(
      swapProxy.address,
      uniswapRouter,
      sushiswapRouter,
      adminAddress,
      gelatoAddressStorage.address
    );

    // approve allowance
    await swapProxy.approveAllowances(
      [wethAddress, usdtAddress, usdcAddress, daiAddress],
      [kyberProxy, uniswapRouter, sushiswapRouter],
      false
    );

    // update storage data
    await swapProxy.updateSupportedPlatformWallets([adminAddress], true);

    // whitelist service
    await whitelistService(
      serviceRegistry,
      admin,
      executor,
      gelatoKrystal.address
    );
  });

  after("reset EVM", async () => {
    await run("hardhatReset");
  });

  it("trade t2t on kyber (cycle)", async () => {
    // Encode Task
    const TWO_MINUTES = 120;
    const NUM_TRADES = 3;
    const dai = await ethers.getContractAt("IERC20Ext", daiAddress);
    const usdc = await ethers.getContractAt("IERC20Ext", usdcAddress);
    const tradeAmount = utils.parseUnits("1000", "18"); // 1000 DAI

    // Get DAI form faucet
    await getTokenFromFaucet(
      daiAddress,
      gelatoUserAddress,
      tradeAmount.mul(NUM_TRADES)
    );

    const submitTx = await gelatoKrystal
      .connect(gelatoUser)
      .submit(
        daiAddress,
        usdcAddress,
        tradeAmount,
        NUM_TRADES,
        8000,
        5000,
        TWO_MINUTES,
        0
      );
    await submitTx.wait();

    // Collect Gelato Task Receipt
    let taskReceipt = await getSubmittedTask(gelatoKrystal);

    // Approve User Proxy to spend user token
    const totalApprove = tradeAmount.mul(BigNumber.from(NUM_TRADES));
    await dai.connect(gelatoUser).approve(gelatoKrystal.address, totalApprove);

    // Fetch Gelato Gas Price
    const gelatoGasPrice = await getGelatoGasPrice(gasPriceOracleAddress);

    const daiBalanceBefore = await dai.balanceOf(gelatoUserAddress);
    const usdcBalanceBefore = await usdc.balanceOf(gelatoUserAddress);

    // Simulate Task Cycle
    for (let i = 0; i < NUM_TRADES - 1; i++) {
      let res = await canExec(
        executorAddress,
        taskReceipt.order,
        taskReceipt.taskId,
        gelatoKrystal,
        swapProxy,
        uniswapRouter,
        sushiswapRouter
      );
      expect(res.ok).to.be.eq("NotOk: Time not passed");

      // Fast forward to next execution timestamp
      const block = await admin.provider.getBlock();
      const executionTime = block.timestamp + TWO_MINUTES;
      await admin.provider.send("evm_mine", [executionTime]);

      // Can execute? (should be OK)
      res = await canExec(
        executorAddress,
        taskReceipt.order,
        taskReceipt.taskId,
        gelatoKrystal,
        swapProxy,
        uniswapRouter,
        sushiswapRouter
      );
      expect(res.ok).to.be.eq("OK");

      // Executor executes
      /*await gelatoKrystal
        .connect(executor)
        .exec(taskReceipt.order, taskReceipt.taskId, {
          gasPrice: gelatoGasPrice,
          gasLimit: 2000000,
        });*/
      await executorModule
        .connect(executor)
        .exec(gelatoKrystal.address, res.payload, {
          gasLimit: 2500000,
          gasPrice: gelatoGasPrice,
        });

      taskReceipt = await getSubmittedTask(gelatoKrystal);
    }
    const daiBalanceAfter = await dai.balanceOf(gelatoUserAddress);
    const usdcBalanceAfter = await usdc.balanceOf(gelatoUserAddress);
    expect(daiBalanceBefore).to.be.gt(daiBalanceAfter);
    expect(usdcBalanceBefore).to.be.lt(usdcBalanceAfter);

    // cancel task
    await gelatoKrystal
      .connect(gelatoUser)
      .cancel(taskReceipt.order, taskReceipt.taskId);

    // Fast forward to next execution timestamp
    const block = await admin.provider.getBlock();
    const executionTime = block.timestamp + TWO_MINUTES;
    await admin.provider.send("evm_mine", [executionTime]);

    // Can execute? (should be canceled)
    let res = await canExec(
      executorAddress,
      taskReceipt.order,
      taskReceipt.taskId,
      gelatoKrystal,
      swapProxy,
      uniswapRouter,
      sushiswapRouter
    );
    expect(res.ok).to.be.eq("NotOk: Task not found");
  });

  it("trade t2e on kyber (cycle)", async () => {
    // Encode Task
    const TWO_MINUTES = 120;
    const NUM_TRADES = 3;
    const dai = await ethers.getContractAt("IERC20Ext", daiAddress);
    const tradeAmount = utils.parseUnits("1000", "18"); // 1000 DAI

    // Get DAI form faucet
    await getTokenFromFaucet(
      daiAddress,
      gelatoUserAddress,
      tradeAmount.mul(NUM_TRADES)
    );

    const submitTx = await gelatoKrystal
      .connect(gelatoUser)
      .submit(
        daiAddress,
        ethAddress,
        tradeAmount,
        NUM_TRADES,
        8000,
        5000,
        TWO_MINUTES,
        0
      );
    await submitTx.wait();

    // Collect Gelato Task Receipt
    let taskReceipt = await getSubmittedTask(gelatoKrystal);

    // Approve User Proxy to spend user token
    const totalApprove = tradeAmount.mul(BigNumber.from(NUM_TRADES));
    await dai.connect(gelatoUser).approve(gelatoKrystal.address, totalApprove);

    // Fetch Gelato Gas Price
    const gelatoGasPrice = await getGelatoGasPrice(gasPriceOracleAddress);

    const daiBalanceBefore = await dai.balanceOf(gelatoUserAddress);
    const ethBalanceBefore = await gelatoUser.provider.getBalance(
      gelatoUserAddress
    );

    // Simulate Task Cycle
    for (let i = 0; i < NUM_TRADES - 1; i++) {
      let res = await canExec(
        executorAddress,
        taskReceipt.order,
        taskReceipt.taskId,
        gelatoKrystal,
        swapProxy,
        uniswapRouter,
        sushiswapRouter
      );
      expect(res.ok).to.be.eq("NotOk: Time not passed");

      // Fast forward to next execution timestamp
      const block = await admin.provider.getBlock();
      const executionTime = block.timestamp + TWO_MINUTES;
      await admin.provider.send("evm_mine", [executionTime]);

      // Can execute? (should be OK)
      res = await canExec(
        executorAddress,
        taskReceipt.order,
        taskReceipt.taskId,
        gelatoKrystal,
        swapProxy,
        uniswapRouter,
        sushiswapRouter
      );
      expect(res.ok).to.be.eq("OK");

      // Executor executes
      await executorModule
        .connect(executor)
        .exec(gelatoKrystal.address, res.payload, {
          gasLimit: 2500000,
          gasPrice: gelatoGasPrice,
        });

      taskReceipt = await getSubmittedTask(gelatoKrystal);
    }
    const daiBalanceAfter = await dai.balanceOf(gelatoUserAddress);
    const ethBalanceAfter = await admin.provider.getBalance(gelatoUserAddress);
    expect(daiBalanceBefore).to.be.gt(daiBalanceAfter);
    expect(ethBalanceBefore).to.be.lt(ethBalanceAfter);

    // cancel task
    await gelatoKrystal
      .connect(gelatoUser)
      .cancel(taskReceipt.order, taskReceipt.taskId);

    // Fast forward to next execution timestamp
    const block = await admin.provider.getBlock();
    const executionTime = block.timestamp + TWO_MINUTES;
    await admin.provider.send("evm_mine", [executionTime]);

    // Can execute? (should be canceled)
    let res = await canExec(
      executorAddress,
      taskReceipt.order,
      taskReceipt.taskId,
      gelatoKrystal,
      swapProxy,
      uniswapRouter,
      sushiswapRouter
    );
    expect(res.ok).to.be.eq("NotOk: Task not found");
  });

  it("trade e2t on kyber (cycle)", async () => {
    // Encode Task
    const TWO_MINUTES = 120;
    const NUM_TRADES = 3;
    const dai = await ethers.getContractAt("IERC20Ext", daiAddress);
    const tradeAmount = ethers.utils.parseEther("1");

    const submitTx = await gelatoKrystal
      .connect(gelatoUser)
      .submit(
        ethAddress,
        daiAddress,
        tradeAmount,
        NUM_TRADES,
        8000,
        5000,
        TWO_MINUTES,
        0,
        {value: (tradeAmount * NUM_TRADES).toString()}
      );
    await submitTx.wait();

    // Collect Gelato Task Receipt
    let taskReceipt = await getSubmittedTask(gelatoKrystal);

    // Fetch Gelato Gas Price
    const gelatoGasPrice = await getGelatoGasPrice(gasPriceOracleAddress);

    const daiBalanceBefore = await dai.balanceOf(gelatoUserAddress);

    // Simulate Task Cycle
    for (let i = 0; i < NUM_TRADES - 1; i++) {
      let res = await canExec(
        executorAddress,
        taskReceipt.order,
        taskReceipt.taskId,
        gelatoKrystal,
        swapProxy,
        uniswapRouter,
        sushiswapRouter
      );
      expect(res.ok).to.be.eq("NotOk: Time not passed");

      // Fast forward to next execution timestamp
      const block = await admin.provider.getBlock();
      const executionTime = block.timestamp + TWO_MINUTES;
      await admin.provider.send("evm_mine", [executionTime]);

      // Can execute? (should be OK)
      res = await canExec(
        executorAddress,
        taskReceipt.order,
        taskReceipt.taskId,
        gelatoKrystal,
        swapProxy,
        uniswapRouter,
        sushiswapRouter
      );
      expect(res.ok).to.be.eq("OK");

      // Executor executes
      await executorModule
        .connect(executor)
        .exec(gelatoKrystal.address, res.payload, {
          gasLimit: 2500000,
          gasPrice: gelatoGasPrice,
        });

      taskReceipt = await getSubmittedTask(gelatoKrystal);
    }
    const daiBalanceAfter = await dai.balanceOf(gelatoUserAddress);
    expect(daiBalanceAfter).to.be.gt(daiBalanceBefore);

    // cancel task
    await gelatoKrystal
      .connect(gelatoUser)
      .cancel(taskReceipt.order, taskReceipt.taskId);

    // Fast forward to next execution timestamp
    const block = await admin.provider.getBlock();
    const executionTime = block.timestamp + TWO_MINUTES;
    await admin.provider.send("evm_mine", [executionTime]);

    // Can execute? (should be canceled)
    let res = await canExec(
      executorAddress,
      taskReceipt.order,
      taskReceipt.taskId,
      gelatoKrystal,
      swapProxy,
      uniswapRouter,
      sushiswapRouter
    );
    expect(res.ok).to.be.eq("NotOk: Task not found");
  });
});