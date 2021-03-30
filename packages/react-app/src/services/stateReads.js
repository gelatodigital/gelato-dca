import { abis, addresses } from "@gelato-krystal/contracts";
import { ethers } from "ethers";
import { getMiniAddress } from "../utils/helpers";

const { GELATO_GAS_PRICE_ORACLE, GELATO_DCA } = addresses;
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
  let gelatoKrystalContract;
  try {
    gelatoKrystalContract = new ethers.Contract(
      GELATO_DCA,
      GelatoKrystalAbi,
      signer
    );
  } catch (err) {
    console.log(err);
    throw Error("Cannot instantiate GelatoKrystal");
  }
  return gelatoKrystalContract;
};

export const getGelatoGasPrice = async (user) => {
  const signer = await user.getSigner();
  const gelatoGasPriceOracle = new ethers.Contract(
    GELATO_GAS_PRICE_ORACLE,
    ["function latestAnswer() view returns (int256)"],
    signer
  );

  // latestAnswer is used by GelatoGasPriceOracle as well as the Chainlink Oracle
  return await gelatoGasPriceOracle.latestAnswer();
};

export const getTokenAllowance = async (user, token) => {
  const signer = await user.getSigner();
  const userAddr = await signer.getAddress();

  const tokenContract = new ethers.Contract(
    token,
    ["function allowance(address,address) view returns (uint256)"],
    signer
  );
  const userBalance = await tokenContract.allowance(userAddr, GELATO_DCA);
  return userBalance;
};

export const getTokenBalance = async (user, token) => {
  const signer = await user.getSigner();
  const userAddr = await signer.getAddress();

  const tokenContract = new ethers.Contract(
    token,
    ["function balanceOf(address) view returns (uint256)"],
    signer
  );
  const userBalance = await tokenContract.balanceOf(userAddr);
  return userBalance;
};

export const getTokenBalanceString = async (
  userAccount,
  token,
  tokenSymbol,
  decimals
) => {
  const userBalance = await getTokenBalance(userAccount, token);
  const userBalanceHumanReadable = ethers.utils.formatUnits(
    userBalance,
    decimals
  );
  return `${parseFloat(userBalanceHumanReadable).toFixed(8)} ${tokenSymbol}`;
};
