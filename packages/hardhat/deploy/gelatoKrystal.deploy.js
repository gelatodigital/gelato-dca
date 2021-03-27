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
      hre.network.config.SwapProxy,
      hre.network.config.UniswapRouter,
      hre.network.config.SushiswapRouter,
      hre.network.config.Gelato,
    ],
    gasPrice: hre.ethers.utils.parseUnits('10', 'gwei'),
    gasLimit: 5000000,
  });
};

module.exports.tags = ['GelatoKrystal'];
