const hre = require("hardhat");
const {ethers} = hre;

module.exports = async function (adminWallet, executorAddress) {
  //#region Executor gets whitelisted on ExecutorRegistry
  const executorRegistryFactory = await ethers.getContractFactory(
    "ExecutorRegistry",
    adminWallet
  );

  const executorRegistry = await executorRegistryFactory.deploy();
  await executorRegistry.add(executorAddress);
  return executorRegistry;
  //#endregion
};
