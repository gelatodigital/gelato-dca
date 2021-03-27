const { ethers, network } = require("hardhat");

module.exports.canExec = async (
  executor,
  order,
  taskId,
  gelatoDCA,
  uniRouter,
  sushiRouter,
  oracleAggregator,
  gelatoGasPrice,
  isOutTokenFee
) => {
  const isTaskSubmitted = await gelatoDCA.isTaskSubmitted(order, taskId);
  if (!isTaskSubmitted) {
    return { ok: "NotOk: Task not found" };
  }

  let minReturn;
  try {
    minReturn = await gelatoDCA.getMinReturn(order);
  } catch (_e) {
    return { ok: "NotOk: Time not passed" };
  }

  if (order.inToken == network.config.ETH) {
    const bal = await gelatoDCA.signer.provider.getBalance(gelatoDCA.address);
    if (bal < order.amountPerTrade) {
      return { ok: "NotOk: Insufficient balance for trade" };
    }
  } else {
    const tok = await ethers.getContractAt("IERC20", order.inToken);
    const bal = await tok.balanceOf(order.user);
    if (bal < order.amountPerTrade) {
      return { ok: "NotOk: Insufficient balance for trade" };
    }
    const approval = await tok.allowance(order.user, gelatoDCA.address);
    if (approval < order.amountPerTrade) {
      return { ok: "NotOk: Insufficient approval" };
    }
  }

  const returnKyber = await gelatoDCA.getExpectedReturnKyber(
    order.inToken,
    order.outToken,
    order.amountPerTrade,
    order.platformFeeBps,
    "0x"
  );

  // @dev: here is where we can try many multiple trade paths and pick the best one
  let isKyber = false;

  const tradePaths = [[order.inToken, order.outToken]];
  let bestReturnUniSushiSwap = ethers.BigNumber.from(0);
  let bestTradePath;
  let isUni = true;
  for (let i = 0; i < tradePaths.length; i++) {
    for (const router of [uniRouter, sushiRouter]) {
      const returnUniSushiSwap = await gelatoDCA.getExpectedReturnUniswap(
        router,
        order.amountPerTrade,
        tradePaths[i],
        order.platformFeeBps
      );
      if (returnUniSushiSwap[0].sub(bestReturnUniSushiSwap) > 0) {
        bestReturnUniSushiSwap = returnUniSushiSwap[0];
        bestTradePath = tradePaths[i];
        isUni =
          ethers.utils.getAddress(router) === ethers.utils.getAddress(uniRouter)
            ? true
            : false;
      }
    }
  }

  let bestReturn;
  if (returnKyber[0].sub(bestReturnUniSushiSwap) > 0) {
    bestReturn = returnKyber[0];
    bestTradePath = [];
    isKyber = true;
  } else {
    bestReturn = bestReturnUniSushiSwap;
  }

  const differential = bestReturn.sub(minReturn);
  if (differential < 0) {
    return { ok: "NotOk: Insufficient amount received" };
  }

  const gelato = await ethers.getContractAt(
    "IGelato",
    await gelatoDCA.gelato()
  );
  const canExec = await gelato.canExec(executor);

  if (!canExec) {
    return { ok: "NotOk: Executor cannot exec" };
  }

  let payload;
  const dummyFee = {
    amount: 1,
    swapRate: 0,
    isOutToken: isOutTokenFee ? true : false,
  };
  if (isKyber) {
    payload = gelatoDCA.interface.encodeFunctionData("exec", [
      order,
      taskId,
      0,
      dummyFee,
      [],
    ]);
  } else {
    payload = gelatoDCA.interface.encodeFunctionData("exec", [
      order,
      taskId,
      isUni ? 1 : 2,
      dummyFee,
      bestTradePath,
    ]);
  }

  const [, gasDebitInCreditToken] = await gelato
    .connect(executor)
    .callStatic.estimateExecGasDebit(
      gelatoDCA.address,
      payload,
      isOutTokenFee ? order.outToken : order.inToken,
      {
        gasLimit: 2500000,
        gasPrice: gelatoGasPrice,
      }
    );
  // console.log(`EstimatedGas: ${estimateGas}`)

  const realFee = {
    amount: gasDebitInCreditToken,
    swapRate: 0,
    isOutToken: isOutTokenFee ? true : false,
  };
  if (isKyber) {
    payload = gelatoDCA.interface.encodeFunctionData("exec", [
      order,
      taskId,
      0,
      realFee,
      [],
    ]);
  } else {
    payload = gelatoDCA.interface.encodeFunctionData("exec", [
      order,
      taskId,
      isUni ? 1 : 2,
      realFee,
      bestTradePath,
    ]);
  }

  return { ok: "OK", payload: payload };
};
