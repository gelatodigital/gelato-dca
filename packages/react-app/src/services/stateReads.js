import { ethers } from 'ethers';
import { getMiniAddress } from '../utils/helpers';
import { addresses, abis } from '@gelato-krystal/contracts';
import { GelatoCore } from '@gelatonetwork/core';

const { GELATO_CORE, GELATO_KRYSTAL } = addresses;
const { GelatoKrystalAbi } = abis;

export const getUserAddress = async (provider) => {
  const signer = await provider.getSigner();
  return await signer.getAddress();
};

export const getMiniUserAddress = async (provider) => {
  return getMiniAddress(await getUserAddress(provider));
};

export const getGelatoKrystal = async (user) => {
  const signer = await user.getSigner();
  return new ethers.Contract(GELATO_KRYSTAL, GelatoKrystalAbi, signer);
};

export const getGelatoGasPrice = async (user) => {
  const signer = await user.getSigner();
  const gelatoCoreContract = new ethers.Contract(
    GELATO_CORE,
    GelatoCore.abi,
    signer,
  );

  const oracleAbi = ['function latestAnswer() view returns (int256)'];

  const gelatoGasPriceOracleAddress = await gelatoCoreContract.gelatoGasPriceOracle();

  // Get gelatoGasPriceOracleAddress
  const gelatoGasPriceOracle = new ethers.Contract(
    gelatoGasPriceOracleAddress,
    oracleAbi,
    signer,
  );

  // lastAnswer is used by GelatoGasPriceOracle as well as the Chainlink Oracle
  return await gelatoGasPriceOracle.latestAnswer();
};

export const getTokenBalance = async (user, token) => {
  const signer = await user.getSigner();
  const userAddr = await signer.getAddress();

  const tokenContract = new ethers.Contract(
    token,
    ['function balanceOf(address) view returns (uint256)'],
    signer,
  );
  const userBalance = await tokenContract.balanceOf(userAddr);
  return userBalance;
};

export const getTokenBalanceString = async (
  userAccount,
  token,
  tokenSymbol,
  decimals,
) => {
  const userBalance = await getTokenBalance(userAccount, token);
  const userBalanceHumanReadable = ethers.utils.formatUnits(
    userBalance,
    decimals,
  );
  return `${parseFloat(userBalanceHumanReadable).toFixed(8)} ${tokenSymbol}`;
};

export const getCanExecStatus = async (user, taskReceipt) => {
  const signer = await user.getSigner();

  const gelatoCore = new ethers.Contract(GELATO_CORE, GelatoCore.abi, signer);
  const canExecStatus = await gelatoCore.canExec(
    taskReceipt,
    5000000,
    ethers.utils.parseUnits('40', 'gwei'),
  );
  console.log(taskReceipt.id.toString());
  console.log(canExecStatus);
};
