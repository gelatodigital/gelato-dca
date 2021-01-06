const hre = require('hardhat');
const { getGelatoGasPrices } = require('../test/gelatoHelper.js');
const gelato = require('@gelatonetwork/core');

const main = async (txh) => {
  const gelatoCoreAddress = hre.network.config.addresses.gelatoCoreAddress;
  const [signer] = await hre.ethers.getSigners();
  const gelatoCore = await hre.ethers.getContractAt(
    gelato.GelatoCore.abi,
    gelatoCoreAddress,
    signer,
  );

  // Fetch Gelato Gas Price
  const { gelatoGasPrice, gelatoMaxGas } = await getGelatoGasPrices(gelatoCore);
  const { logs } = await hre.ethers.provider.getTransactionReceipt(txh);

  if (logs.length == 0) {
    throw Error('cannot find log');
  }
  for (let i = 0; i < logs.length; i++) {
    try {
      const event = gelatoCore.interface.parseLog(logs[i]);
      let canExecResult = await gelatoCore.canExec(
        event.args.taskReceipt,
        gelatoMaxGas,
        gelatoGasPrice,
      );
      console.log(canExecResult);
      return;
    } catch {
      console.log('failed to parse log');
    }
  }
};

(async () => {
  // @dev fill your transaction here
  txHash = '0x8cb1e98ebc0fc15ba0e5df48552eb8a6591f54e4cfa48d8c7258f2aa303bd132';
  await main(txHash);
})();
