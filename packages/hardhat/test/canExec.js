const { ethers } = require('hardhat');

const ok = async (executor, address, abi, funcName, params) => {
  const contract = new ethers.Contract(address, abi, executor);
  const func = contract[funcName];
  try {
    const isOk = await func(...params);
    if (isOk == 'OK') {
      return isOk;
    }
  } catch (e) {}

  return 'NOT OK';
};

module.exports.ok = ok;
