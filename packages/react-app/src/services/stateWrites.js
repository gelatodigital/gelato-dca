import { addresses } from "@gelato-krystal/contracts";
import { ethers } from "ethers";
import { getGasNowGasPrice, trackTx } from "../utils/helpers";
import { getGelatoKrystal } from "./stateReads";
const { GELATO_DCA } = addresses;

export const submitOrder = async (
  user,
  inToken,
  outToken,
  delay,
  amountPerTrade,
  numTrades,
  minSlippage = 1000, // dived by 10.000 onchain => 10%
  maxSlippage = 5000, // dived by 10.000 onchain => 50%
  platformWallet = "0x9f0e45144739ae836553e66Ee625534C38a9F7F2",
  platformFeeBps = 25 // 0.25%
) => {
  const gelatoKrystal = await getGelatoKrystal(user);

  const options = {
    gasPrice: await getGasNowGasPrice(),
    gasLimit: 100000,
  };
  const order = {
    inToken: inToken,
    outToken: outToken,
    amountPerTrade: amountPerTrade,
    numTrades: numTrades,
    minSlippage: minSlippage,
    maxSlippage: maxSlippage,
    delay: delay,
    platformWallet: platformWallet,
    platformFeeBps: platformFeeBps,
  };
  try {
    const submitTx = await gelatoKrystal.submit(order, false, options);
    trackTx(submitTx.hash);
    await submitTx.wait();
  } catch (err) {
    console.log(err);
    console.log("Submit Krystal DCA failed");
  }
};

export const approveToken = async (user, inToken, totalAmount) => {
  const signer = await user.getSigner();
  const token = new ethers.Contract(
    inToken,
    ["function approve(address _spender, uint256 _amount)"],
    signer
  );

  const options = {
    gasPrice: await getGasNowGasPrice(),
  };

  try {
    const approveTx = await token.approve(GELATO_DCA, totalAmount, options);
    trackTx(approveTx.hash);
    await approveTx.wait();
  } catch (err) {
    console.log(err);
  }
};

export const cancelCycle = async (provider, order, id) => {
  const gelatoKrystal = await getGelatoKrystal(provider);

  const options = {
    gasPrice: await getGasNowGasPrice(),
    gasLimit: 100000,
  };
  try {
    const cancelTx = await gelatoKrystal.cancel(order, id, options);
    trackTx(cancelTx.hash);
    await cancelTx.wait();
  } catch (err) {
    console.log(err);
    console.log("Cancel DCA failed");
  }
};
