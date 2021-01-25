const { ethers } = require('hardhat');

const canExec = async (executor, canExecAddress, canExecPayload) => {
  const tx = {
    to: canExecAddress,
    data: canExecPayload,
  };
  try {
    const resp = await executor.call(tx);
    const decoded = ethers.utils.defaultAbiCoder.decode(['string'], resp);
    return decoded[0];
  } catch (e) {
    return e.message;
  }
};

const exec = async (
  executor,
  execAddress,
  execFunctionAbi,
  encodedParams,
  gasPrice,
) => {
  const truncatedAbi = execFunctionAbi.substring(9, execFunctionAbi.length);
  const execContract = new ethers.Contract(
    execAddress,
    [execFunctionAbi],
    executor,
  );
  const func =
    execContract.interface.functions[
      truncatedAbi.substring(0, truncatedAbi.indexOf(' '))
    ];
  const params = ethers.utils.defaultAbiCoder.decode(
    func.inputs,
    encodedParams,
  );
  try {
    await execContract[func.name](...params, {
      gasLimit: 5000000,
      gasPrice: gasPrice,
    });
    return 'OK';
  } catch (e) {
    return e.message;
  }
};

module.exports.canExec = canExec;
module.exports.exec = exec;
