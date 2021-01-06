const { sleep } = require('@gelatonetwork/core');

module.exports = async (hre) => {
  /*if (hre.network.name=='ropsten') {
      return   // dumb hack to deploy after oracle aggregator
  }*/
  if (hre.network.name === 'mainnet') {
    console.log(
      '\n\n Deploying GelatoKrystal to mainnet. Hit ctrl + c to abort',
    );
    console.log('❗ GELATO KRYSTAL DEPLOYMENT: VERIFY');
    await sleep(10000);
  }
  const { deployments } = hre;
  const { deploy } = deployments;
  const { deployer } = await hre.getNamedAccounts();

  await deploy('GelatoKrystal', {
    from: deployer,
    args: [
      hre.network.config.addresses.gelatoCoreAddress,
      (await deployments.get('OracleAggregator')).address,
      hre.network.config.addresses.swapProxyAddress,
      hre.network.config.addresses.executorAddress,
      hre.network.config.addresses.platformWalletAddress,
    ],
    gasPrice: hre.ethers.utils.parseUnits('10', 'gwei'),
    gasLimit: 5000000,
    value: 1,
  });
};

module.exports.tags = ['GelatoKrystal'];
module.exports.dependencies = ['OracleAggregator'];
