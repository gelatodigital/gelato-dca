const hre = require('hardhat');
const { BigNumber } = hre.ethers;

const main = async () => {
  const gelatoKrystalAddr = hre.network.config.addresses.gelatoKrystalAddress;
  const wethAddress = hre.network.config.addresses.wethAddress;
  const daiAddress = hre.network.config.addresses.daiAddress;
  const [signer] = await hre.ethers.getSigners();
  const gelatoKrystal = await hre.ethers.getContractAt(
    'GelatoKrystal',
    gelatoKrystalAddr,
    signer,
  );
  const dai = await hre.ethers.getContractAt('IERC20Ext', daiAddress, signer);

  const ONE_MINUTE = 60;
  const NUM_TRADES = 2;
  const tradeAmount = hre.ethers.utils.parseEther('25');
  const totalApprove = tradeAmount.mul(BigNumber.from(NUM_TRADES));
  const tx = await dai.approve(gelatoKrystal.address, totalApprove);
  console.log(tx.hash);

  const order = {
    _inToken: daiAddress,
    _outToken: wethAddress,
    _amountPerTrade: tradeAmount,
    _nTrades: NUM_TRADES,
    _minSlippage: 9900,
    _maxSlippage: 6000,
    _delay: ONE_MINUTE,
    _gasPriceCeil: 0,
  };

  const submitTx = await gelatoKrystal.submitDCAKyber(order);

  console.log(submitTx.hash);
};

(async () => {
  await main();
})();
