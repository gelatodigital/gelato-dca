const hre = require("hardhat");
const {ethers} = hre;

module.exports = async function (serviceRegistryAddress) {
  //#region Executor gets whitelisted on ExecutorRegistry
  const executorModuleFactory = await ethers.getContractFactory(
    "ImmutableExecutor"
  );

  return await executorModuleFactory.deploy(serviceRegistryAddress);
  //#endregion
};
