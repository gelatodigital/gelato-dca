const hre = require("hardhat");
const { ethers, network } = hre;

// @dev Returns Gelato Diamond
module.exports = async function (admin) {
  const gelatoDiamond = await ethers.getContractAt(
    "IGelato",
    network.config.Gelato
  );

  await admin.sendTransaction({
    to: gelatoDiamond.address,
    value: ethers.utils.parseEther("10"),
  });

  return gelatoDiamond;
};
