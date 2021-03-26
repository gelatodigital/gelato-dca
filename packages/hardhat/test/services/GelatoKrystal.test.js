const { ethers, deployments, network } = require("hardhat");
const { utils, BigNumber } = ethers;
const { expect } = require("chai");
const { canExec } = require("../helpers/canExecKrystal");
const {
  getSubmittedTaskV2,
  getUpdatedTaskV2,
  getGelatoGasPriceV2,
  getTokenFromFaucet,
} = require("../helpers/gelatoHelper");

// mainnet addresses
const uniswapRouter = network.config.UniswapRouter;
const sushiswapRouter = network.config.SushiswapRouter;
const ethAddress = network.config.ETH;
const usdcAddress = network.config.USDC;
const daiAddress = network.config.DAI;
const gasPriceOracleAddress = network.config.GelatoGasPriceOracle;

let swapProxy;
let owner;
let ownerAddress;
let gelatoUser;
let gelatoUserAddress;
let executor;
let executorAddress = network.config.GelatoExecutor;
let krystalPlatformWallet = network.config.KrystalPlatformWallet
let gelatoKrystal;
let gelato;
let oracleAggregator;

describe("Gelato Krystal Test", function () {
  this.timeout(0);

  before("tests", async () => {
    await deployments.fixture();

    [owner, gelatoUser] = await ethers.getSigners();
    ownerAddress = await owner.getAddress();
    gelatoUserAddress = await gelatoUser.getAddress();
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [executorAddress],
    });
    executor = await ethers.provider.getSigner(executorAddress);

    gelato = await ethers.getContractAt("IGelato", network.config.Gelato)

    oracleAggregator = await ethers.getContractAt(
      "IOracleAggregator",
      await gelato.getOracleAggregator()
    );

    swapProxy = await ethers.getContractAt(
      "SmartWalletSwapImplementation",
      network.config.SwapProxy
    );

    gelatoKrystal = await ethers.getContractAt("GelatoKrystal", (await deployments.get("GelatoKrystal")).address)

  });

  it("trade t2t (cycle)", async () => {
    // Encode Task
    const TWO_MINUTES = 120;
    const NUM_TRADES = 3;
    const dai = await ethers.getContractAt("IERC20", daiAddress);
    const usdc = await ethers.getContractAt("IERC20", usdcAddress);
    const tradeAmount = utils.parseUnits("1000", "18"); // 1000 DAI

    // Get DAI form faucet
    await getTokenFromFaucet(
      daiAddress,
      gelatoUserAddress,
      tradeAmount.mul(NUM_TRADES)
    );

    const submitOrder = {
      inToken: daiAddress,
      outToken: usdcAddress,
      amountPerTrade: tradeAmount,
      numTrades: NUM_TRADES,
      minSlippage: 5000,
      maxSlippage: 5500,
      delay: TWO_MINUTES,
      platformWallet: krystalPlatformWallet,
      platformFeeBps: 50,
    };

    const submitTx = await gelatoKrystal
      .connect(gelatoUser)
      .submit(submitOrder, false);
    await submitTx.wait();

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
    for (let i = 0; i < NUM_TRADES - 1; i++) {
      let res = await canExec(
        executorAddress,
        taskReceipt.order,
        taskReceipt.id,
        gelatoKrystal,
        swapProxy,
        uniswapRouter,
        sushiswapRouter,
        oracleAggregator,
        gelatoGasPrice,
        false
      );
      expect(res.ok).to.be.eq("NotOk: Time not passed");

      // Fast forward to next execution timestamp
      const block = await owner.provider.getBlock();
      const executionTime = block.timestamp + TWO_MINUTES;
      await owner.provider.send("evm_mine", [executionTime]);

      // Can execute? (should be OK)
      res = await canExec(
        executorAddress,
        taskReceipt.order,
        taskReceipt.id,
        gelatoKrystal,
        swapProxy,
        uniswapRouter,
        sushiswapRouter,
        oracleAggregator,
        gelatoGasPrice,
        false
      );
      expect(res.ok).to.be.eq("OK");

      // Executor executes
      /*await gelatoKrystal
        .connect(executor)
        .exec(taskReceipt.order, taskReceipt.id, {
          gasPrice: gelatoGasPrice,
          gasLimit: 2000000,
        });*/
      /*const tx = */ await gelato
        .connect(executor)
        .exec(gelatoKrystal.address, res.payload, daiAddress, {
          gasLimit: 2500000,
          gasPrice: gelatoGasPrice,
        });

      // const {gasUsed} = await tx.wait()
      // console.log(`Gelato Krystal Gas Consumed: ${gasUsed}`)

      taskReceipt = await getSubmittedTaskV2(gelatoKrystal);
    }
    const daiBalanceAfter = await dai.balanceOf(gelatoUserAddress);
    const usdcBalanceAfter = await usdc.balanceOf(gelatoUserAddress);
    expect(daiBalanceBefore).to.be.gt(daiBalanceAfter);
    expect(usdcBalanceBefore).to.be.lt(usdcBalanceAfter);

    // cancel task
    await gelatoKrystal
      .connect(gelatoUser)
      .cancel(taskReceipt.order, taskReceipt.id);

    // Fast forward to next execution timestamp
    const block = await owner.provider.getBlock();
    const executionTime = block.timestamp + TWO_MINUTES;
    await owner.provider.send("evm_mine", [executionTime]);

    // Can execute? (should be Cancelled)
    let res = await canExec(
      executorAddress,
      taskReceipt.order,
      taskReceipt.id,
      gelatoKrystal,
      swapProxy,
      uniswapRouter,
      sushiswapRouter,
      oracleAggregator,
      gelatoGasPrice,
      false
    );
    expect(res.ok).to.be.eq("NotOk: Task not found");
  });

  it("trade t2e (cycle)", async () => {
    // Encode Task
    const TWO_MINUTES = 120;
    const NUM_TRADES = 3;
    const dai = await ethers.getContractAt("IERC20", daiAddress);
    const tradeAmount = utils.parseUnits("1000", "18"); // 1000 DAI

    // Get DAI form faucet
    await getTokenFromFaucet(
      daiAddress,
      gelatoUserAddress,
      tradeAmount.mul(NUM_TRADES)
    );

    const submitOrder = {
      inToken: daiAddress,
      outToken: ethAddress,
      amountPerTrade: tradeAmount,
      numTrades: NUM_TRADES,
      minSlippage: 5000,
      maxSlippage: 5500,
      delay: TWO_MINUTES,
      platformWallet: krystalPlatformWallet,
      platformFeeBps: 50,
    };

    const submitTx = await gelatoKrystal
      .connect(gelatoUser)
      .submit(submitOrder, false);
    await submitTx.wait();

    // Collect Gelato Task Receipt
    let taskReceipt = await getSubmittedTaskV2(gelatoKrystal);

    // Approve User Proxy to spend user token
    const totalApprove = tradeAmount.mul(BigNumber.from(NUM_TRADES));
    await dai.connect(gelatoUser).approve(gelatoKrystal.address, totalApprove);

    // Fetch Gelato Gas Price
    const gelatoGasPrice = await getGelatoGasPriceV2(gasPriceOracleAddress);

    const daiBalanceBefore = await dai.balanceOf(gelatoUserAddress);
    const ethBalanceBefore = await gelatoUser.provider.getBalance(
      gelatoUserAddress
    );

    // Simulate Task Cycle
    for (let i = 0; i < NUM_TRADES - 1; i++) {
      let res = await canExec(
        executorAddress,
        taskReceipt.order,
        taskReceipt.id,
        gelatoKrystal,
        swapProxy,
        uniswapRouter,
        sushiswapRouter,
        oracleAggregator,
        gelatoGasPrice,
        false
      );
      expect(res.ok).to.be.eq("NotOk: Time not passed");

      // Fast forward to next execution timestamp
      const block = await owner.provider.getBlock();
      const executionTime = block.timestamp + TWO_MINUTES;
      await owner.provider.send("evm_mine", [executionTime]);

      // Can execute? (should be OK)
      res = await canExec(
        executorAddress,
        taskReceipt.order,
        taskReceipt.id,
        gelatoKrystal,
        swapProxy,
        uniswapRouter,
        sushiswapRouter,
        oracleAggregator,
        gelatoGasPrice,
        false
      );
      expect(res.ok).to.be.eq("OK");

      // Executor executes

      /*const tx=  */ await gelato
        .connect(executor)
        .exec(gelatoKrystal.address, res.payload, daiAddress, {
          gasLimit: 2500000,
          gasPrice: gelatoGasPrice,
        });

      // const {gasUsed} = await tx.wait()
      // console.log(`Gelato Krystal Gas Consumed: ${gasUsed}`)

      taskReceipt = await getSubmittedTaskV2(gelatoKrystal);
    }
    const daiBalanceAfter = await dai.balanceOf(gelatoUserAddress);
    const ethBalanceAfter = await owner.provider.getBalance(gelatoUserAddress);
    expect(daiBalanceBefore).to.be.gt(daiBalanceAfter);
    expect(ethBalanceBefore).to.be.lt(ethBalanceAfter);

    // cancel task
    await gelatoKrystal
      .connect(gelatoUser)
      .cancel(taskReceipt.order, taskReceipt.id);

    // Fast forward to next execution timestamp
    const block = await owner.provider.getBlock();
    const executionTime = block.timestamp + TWO_MINUTES;
    await owner.provider.send("evm_mine", [executionTime]);

    // Can execute? (should be Cancelled)
    let res = await canExec(
      executorAddress,
      taskReceipt.order,
      taskReceipt.id,
      gelatoKrystal,
      swapProxy,
      uniswapRouter,
      sushiswapRouter,
      oracleAggregator,
      gelatoGasPrice,
      false
    );
    expect(res.ok).to.be.eq("NotOk: Task not found");
  });

  it("trade e2t (cycle)", async () => {
    // Encode Task
    const TWO_MINUTES = 120;
    const NUM_TRADES = 3;
    const usdc = await ethers.getContractAt("IERC20", usdcAddress);
    const tradeAmount = ethers.utils.parseEther("1");

    const submitOrder = {
      inToken: ethAddress,
      outToken: usdcAddress,
      amountPerTrade: tradeAmount,
      numTrades: NUM_TRADES,
      minSlippage: 5000,
      maxSlippage: 5500,
      delay: TWO_MINUTES,
      platformWallet: krystalPlatformWallet,
      platformFeeBps: 50,
    };

    const submitTx = await gelatoKrystal
      .connect(gelatoUser)
      .submit(submitOrder, false, {
        value: (tradeAmount * NUM_TRADES).toString(),
      });
    await submitTx.wait();

    // Collect Gelato Task Receipt
    let taskReceipt = await getSubmittedTaskV2(gelatoKrystal);

    // Fetch Gelato Gas Price
    const gelatoGasPrice = await getGelatoGasPriceV2(gasPriceOracleAddress);

    const daiBalanceBefore = await usdc.balanceOf(gelatoUserAddress);

    // Simulate Task Cycle
    for (let i = 0; i < NUM_TRADES - 1; i++) {
      let res = await canExec(
        executorAddress,
        taskReceipt.order,
        taskReceipt.id,
        gelatoKrystal,
        swapProxy,
        uniswapRouter,
        sushiswapRouter,
        oracleAggregator,
        gelatoGasPrice,
        true
      );
      expect(res.ok).to.be.eq("NotOk: Time not passed");

      // Fast forward to next execution timestamp
      const block = await owner.provider.getBlock();
      const executionTime = block.timestamp + TWO_MINUTES;
      await owner.provider.send("evm_mine", [executionTime]);

      // Can execute? (should be OK)
      res = await canExec(
        executorAddress,
        taskReceipt.order,
        taskReceipt.id,
        gelatoKrystal,
        swapProxy,
        uniswapRouter,
        sushiswapRouter,
        oracleAggregator,
        gelatoGasPrice,
        true
      );
      expect(res.ok).to.be.eq("OK");

      // Executor executes

      /*const tx = */ await gelato
        .connect(executor)
        .exec(gelatoKrystal.address, res.payload, usdcAddress, {
          gasLimit: 2500000,
          gasPrice: gelatoGasPrice,
        });

      // const {gasUsed} = await tx.wait()
      // console.log(`Gelato Krystal Gas Consumed: ${gasUsed}`)

      taskReceipt = await getSubmittedTaskV2(gelatoKrystal);
    }
    const daiBalanceAfter = await usdc.balanceOf(gelatoUserAddress);
    expect(daiBalanceAfter).to.be.gt(daiBalanceBefore);

    // cancel task
    await gelatoKrystal
      .connect(gelatoUser)
      .cancel(taskReceipt.order, taskReceipt.id);

    // Fast forward to next execution timestamp
    const block = await owner.provider.getBlock();
    const executionTime = block.timestamp + TWO_MINUTES;
    await owner.provider.send("evm_mine", [executionTime]);

    // Can execute? (should be Cancelled)
    let res = await canExec(
      executorAddress,
      taskReceipt.order,
      taskReceipt.id,
      gelatoKrystal,
      swapProxy,
      uniswapRouter,
      sushiswapRouter,
      oracleAggregator,
      gelatoGasPrice,
      true
    );
    expect(res.ok).to.be.eq("NotOk: Task not found");
  });
  it("test submitAndExec", async () => {
    // Encode Task
    const TWO_MINUTES = 120;
    const NUM_TRADES = 3;
    const dai = await ethers.getContractAt("IERC20", daiAddress);
    const tradeAmount = ethers.utils.parseEther("1");

    const submitOrder = {
      inToken: ethAddress,
      outToken: daiAddress,
      amountPerTrade: tradeAmount,
      numTrades: NUM_TRADES,
      minSlippage: 5000,
      maxSlippage: 5500,
      delay: TWO_MINUTES,
      platformWallet: krystalPlatformWallet,
      platformFeeBps: 50,
    };

    const submitTx = await gelatoKrystal
      .connect(gelatoUser)
      .submitAndExec(submitOrder, 1, 0, [ethAddress, daiAddress], {
        value: (tradeAmount * NUM_TRADES).toString(),
      });
    await submitTx.wait();

    // Collect Gelato Task Receipt
    let taskReceipt = await getSubmittedTaskV2(gelatoKrystal);

    // Fetch Gelato Gas Price
    const gelatoGasPrice = await getGelatoGasPriceV2(gasPriceOracleAddress);

    const daiBalanceBefore = await dai.balanceOf(gelatoUserAddress);

    // Simulate Task Cycle
    for (let i = 0; i < NUM_TRADES - 1; i++) {
      let res = await canExec(
        executorAddress,
        taskReceipt.order,
        taskReceipt.id,
        gelatoKrystal,
        swapProxy,
        uniswapRouter,
        sushiswapRouter,
        oracleAggregator,
        gelatoGasPrice,
        false
      );
      expect(res.ok).to.be.eq("NotOk: Time not passed");

      // Fast forward to next execution timestamp
      const block = await owner.provider.getBlock();
      const executionTime = block.timestamp + TWO_MINUTES;
      await owner.provider.send("evm_mine", [executionTime]);

      // Can execute? (should be OK)
      res = await canExec(
        executorAddress,
        taskReceipt.order,
        taskReceipt.id,
        gelatoKrystal,
        swapProxy,
        uniswapRouter,
        sushiswapRouter,
        oracleAggregator,
        gelatoGasPrice,
        false
      );
      expect(res.ok).to.be.eq("OK");

      // Executor executes
      /*const tx = */ await gelato
        .connect(executor)
        .exec(gelatoKrystal.address, res.payload, ethAddress, {
          gasLimit: 2500000,
          gasPrice: gelatoGasPrice,
        });

      // const {gasUsed} = await tx.wait()
      // console.log(`Gelato Krystal Gas Consumed: ${gasUsed}`)

      if (i == 0) taskReceipt = await getSubmittedTaskV2(gelatoKrystal);
    }
    const daiBalanceAfter = await dai.balanceOf(gelatoUserAddress);
    expect(daiBalanceAfter).to.be.gt(daiBalanceBefore);

    // Can execute? (should have executed all three tasks and no more)
    let res = await canExec(
      executorAddress,
      taskReceipt.order,
      taskReceipt.id,
      gelatoKrystal,
      swapProxy,
      uniswapRouter,
      sushiswapRouter,
      oracleAggregator,
      gelatoGasPrice,
      false
    );
    expect(res.ok).to.be.eq("NotOk: Task not found");
  });
  it("test editNumTrades", async () => {
    // Encode Task
    const TWO_MINUTES = 120;
    const NUM_TRADES = 10;
    const dai = await ethers.getContractAt("IERC20", daiAddress);
    const tradeAmount = ethers.utils.parseEther("1");

    const submitOrder = {
      inToken: ethAddress,
      outToken: daiAddress,
      amountPerTrade: tradeAmount,
      numTrades: NUM_TRADES,
      minSlippage: 5000,
      maxSlippage: 5500,
      delay: TWO_MINUTES,
      platformWallet: krystalPlatformWallet,
      platformFeeBps: 50,
    };

    const submitTx = await gelatoKrystal
      .connect(gelatoUser)
      .submitAndExec(submitOrder, 1, 0, [ethAddress, daiAddress], {
        value: (tradeAmount * NUM_TRADES).toString(),
      });
    await submitTx.wait();

    // update task cycle length
    const NEW_NUM_TRADES = 2;
    const taskReceipt = await getSubmittedTaskV2(gelatoKrystal);
    const ethBeforeRefund = await gelatoUser.provider.getBalance(
      gelatoUserAddress
    );
    const updateTx = await gelatoKrystal
      .connect(gelatoUser)
      .editNumTrades(taskReceipt.order, taskReceipt.id, NEW_NUM_TRADES);
    await updateTx.wait();

    const ethAfterRefund = await gelatoUser.provider.getBalance(
      gelatoUserAddress
    );
    expect(ethAfterRefund).to.be.gt(ethBeforeRefund);

    let taskReceipt2 = await getUpdatedTaskV2(gelatoKrystal);

    // Fetch Gelato Gas Price
    const gelatoGasPrice = await getGelatoGasPriceV2(gasPriceOracleAddress);

    const daiBalanceBefore = await dai.balanceOf(gelatoUserAddress);

    // Simulate Task Cycle
    for (let i = 0; i < NEW_NUM_TRADES; i++) {
      let res = await canExec(
        executorAddress,
        taskReceipt2.order,
        taskReceipt2.id,
        gelatoKrystal,
        swapProxy,
        uniswapRouter,
        sushiswapRouter,
        oracleAggregator,
        gelatoGasPrice,
        false
      );
      expect(res.ok).to.be.eq("NotOk: Time not passed");

      // Fast forward to next execution timestamp
      const block = await owner.provider.getBlock();
      const executionTime = block.timestamp + TWO_MINUTES;
      await owner.provider.send("evm_mine", [executionTime]);

      // Can execute? (should be OK)
      res = await canExec(
        executorAddress,
        taskReceipt2.order,
        taskReceipt2.id,
        gelatoKrystal,
        swapProxy,
        uniswapRouter,
        sushiswapRouter,
        oracleAggregator,
        gelatoGasPrice,
        false
      );
      expect(res.ok).to.be.eq("OK");

      // Executor executes
      /*const tx = */ await gelato
        .connect(executor)
        .exec(gelatoKrystal.address, res.payload, ethAddress, {
          gasLimit: 2500000,
          gasPrice: gelatoGasPrice,
        });

      // const {gasUsed} = await tx.wait()
      // console.log(`Gelato DCA Gas Consumed: ${gasUsed}`)

      if (i == 0) taskReceipt2 = await getSubmittedTaskV2(gelatoKrystal);
    }
    const daiBalanceAfter = await dai.balanceOf(gelatoUserAddress);
    expect(daiBalanceAfter).to.be.gt(daiBalanceBefore);

    // Can execute? (should have executed all three tasks and no more)
    let res = await canExec(
      executorAddress,
      taskReceipt2.order,
      taskReceipt2.id,
      gelatoKrystal,
      swapProxy,
      uniswapRouter,
      sushiswapRouter,
      oracleAggregator,
      gelatoGasPrice,
      false
    );
    expect(res.ok).to.be.eq("NotOk: Task not found");
  });
});
