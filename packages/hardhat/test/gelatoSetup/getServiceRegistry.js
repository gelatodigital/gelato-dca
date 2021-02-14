const hre = require("hardhat");
const {ethers} = hre;

module.exports = async function (adminWallet, executorRegistry) {
  //#region Executor gets whitelisted on ExecutorRegistry
  const serviceRegistryFactory = await ethers.getContractFactory(
    "ServiceRegistry",
    adminWallet
  );

  return await serviceRegistryFactory.deploy(executorRegistry);
  //#endregion
};
