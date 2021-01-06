const hre = require('hardhat');

const main = async () => {
  const gelatoKrystalAddr = hre.network.config.addresses.gelatoKrystalAddress;
  const [signer] = await hre.ethers.getSigners();
  const gelatoKrystal = await hre.ethers.getContractAt(
    'GelatoKrystal',
    gelatoKrystalAddr,
    signer,
  );
  const tx = await gelatoKrystal.provideFunds({
    value: hre.ethers.utils.parseEther('3.5'),
  });

  console.log(tx.hash);
};

(async () => {
  await main();
})();
