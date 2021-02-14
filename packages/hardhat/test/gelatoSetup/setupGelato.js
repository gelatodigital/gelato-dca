const hre = require("hardhat");
const {ethers, network} = hre;
const getExecutorModule = require("./getExecutorModule");
const getServiceRegistry = require("./getServiceRegistry");
const whitelistExecutor = require("./whitelistExecutor");

// @dev Returns Gelato Address Storage
module.exports = async function (adminWallet, executorWallet) {
  //#region Setup Gelato v2 for use case
  const executorAddress = await executorWallet.getAddress();

  // Deploy Executor Registry and whitelist Executor
  const executorRegistry = await whitelistExecutor(
    adminWallet,
    executorAddress
  );

  // Get Service Registry Address
  const serviceRegistry = await getServiceRegistry(
    adminWallet,
    executorRegistry.address
  );

  // Get ExecutorModule
  const executorModule = await getExecutorModule(serviceRegistry.address);

  // Deploy Gelato Address Storage
  const oracleAggregator = await ethers.getContractAt(
    "IOracleAggregator",
    network.config.OracleAggregator
  );

  const gelatoAddressStorageFactory = await ethers.getContractFactory(
    "GelatoAddressStorage",
    adminWallet
  );

  const gelatoAddressStorage = await gelatoAddressStorageFactory.deploy(
    executorModule.address,
    oracleAggregator.address,
    network.config.GelatoGasPriceOracle,
    serviceRegistry.address
  );
  return {
    gelatoAddressStorage,
    executorRegistry,
    serviceRegistry,
    executorModule,
    oracleAggregator,
  };
  //#endregion
};
