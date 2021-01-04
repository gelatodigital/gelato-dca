const { ethers } = require('hardhat');
const gelato = require('@gelatonetwork/core');

module.exports.enableGelatoCore = async (cpk, gelatoCoreAddress, opCode) => {
  let ifaceGnoSafe = new ethers.utils.Interface([
    'function enableModule(address)',
  ]);

  // Send some ETH To User Proxy
  await cpk.signer.sendTransaction({
    to: cpk.address,
    value: ethers.utils.parseEther('1'),
  });

  // User Proxy enables Gelato
  const enableModuleTx = await cpk.execTransactions(
    [
      {
        to: cpk.address,
        operation: opCode,
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
};

module.exports.encodeStandardTaskCycle = async (
  cpk,
  swapProxy,
  conditionTimeStateful,
  inToken,
  outTokenAddress,
  tradeAmount,
  delay,
) => {
  const conditionEveryXminutes = new gelato.Condition({
    inst: conditionTimeStateful.address,
    data: await conditionTimeStateful.getConditionData(cpk.address),
  });
  const receiver = await cpk.signer.getAddress();

  const transferFromAction = new gelato.Action({
    addr: inToken.address,
    data: inToken.interface.encodeFunctionData('transferFrom', [
      receiver,
      cpk.address,
      tradeAmount,
    ]),
    operation: gelato.Operation.Call,
  });

  const approveAction = new gelato.Action({
    addr: inToken.address,
    data: inToken.interface.encodeFunctionData('approve', [
      swapProxy.address,
      tradeAmount.toString(),
    ]),
    operation: gelato.Operation.Call,
  });

  const swapKyberAction = new gelato.Action({
    addr: swapProxy.address,
    data: swapProxy.interface.encodeFunctionData('swapKyber', [
      inToken.address,
      outTokenAddress,
      tradeAmount.toString(),
      0,
      receiver,
      8,
      receiver,
      '0x',
      false,
    ]),
    operation: gelato.Operation.Call,
  });

  const actionUpdateConditionTime = new gelato.Action({
    addr: conditionTimeStateful.address,
    data: conditionTimeStateful.interface.encodeFunctionData('setRefTime', [
      delay,
      0,
    ]),
    operation: gelato.Operation.Call,
  });

  let task = new gelato.Task({
    conditions: [conditionEveryXminutes],
    actions: [
      transferFromAction,
      approveAction,
      swapKyberAction,
      actionUpdateConditionTime,
    ],
    selfProviderGasLimit: 0,
    selfProviderGasPriceCeil: 0,
  });

  const taskSpec = new gelato.TaskSpec({
    conditions: [task.conditions[0].inst],
    actions: task.actions,
    gasPriceCeil: 0,
  });

  return { task, taskSpec };
};

module.exports.getSubmittedTaskReceipt = async (gelatoCore) => {
  const block = await ethers.provider.getBlock();
  const currentGelatoId = await gelatoCore.currentTaskReceiptId();
  const topics = gelatoCore.filters.LogTaskSubmitted(currentGelatoId).topics;
  const filter = {
    address: gelatoCore.address.toLowerCase(),
    blockhash: block.hash,
    topics,
  };
  const logs = await ethers.provider.getLogs(filter);
  if (logs.length != 1) {
    throw Error('cannot find unique task receipt');
  }
  const event = gelatoCore.interface.parseLog(logs[0]);
  return event.args.taskReceipt;
};

module.exports.getGelatoGasPrices = async (gelatoCore) => {
  const oracleAbi = ['function latestAnswer() view returns (int256)'];
  const gelatoGasPriceOracleAddress = await gelatoCore.gelatoGasPriceOracle();

  // Get gelatoGasPriceOracleAddress
  const gelatoGasPriceOracle = await ethers.getContractAt(
    oracleAbi,
    gelatoGasPriceOracleAddress,
    gelatoCore.signer,
  );

  // lastAnswer is used by GelatoGasPriceOracle as well as the Chainlink Oracle
  const gelatoGasPrice = await gelatoGasPriceOracle.latestAnswer();
  const gelatoMaxGas = await gelatoCore.gelatoMaxGas();

  return { gelatoGasPrice, gelatoMaxGas };
};
