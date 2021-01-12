const { sleep } = require('@gelatonetwork/core');
const { getAggregatedOracles } = require('../test/gelatoHelper');

module.exports = async (hre) => {
  if (hre.network.name === 'mainnet') {
    console.log(
      '\n\n Deploying OracleAggregator to mainnet. Hit ctrl + c to abort',
    );
    console.log('❗ CONNECTOR DEPLOYMENT: VERIFY');
    await sleep(10000);
  }
  const { deployments } = hre;
  const { deploy } = deployments;
  const { deployer } = await hre.getNamedAccounts();
  const {
    tokensA,
    tokensB,
    oracles,
    stablecoins,
    decimals,
  } = await getAggregatedOracles();

  await deploy('OracleAggregator', {
    from: deployer,
    args: [
      hre.network.config.addresses.wethAddress,
      tokensA,
      tokensB,
      oracles,
      stablecoins,
      decimals,
    ],
    gasPrice: hre.ethers.utils.parseUnits('10', 'gwei'),
    gasLimit: 6000000,
  });
};

module.exports.tags = ['OracleAggregator'];
