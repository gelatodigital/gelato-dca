import { ethers } from 'ethers';
import { getGelatoKrystal } from './stateReads';
import { addresses } from '@gelato-krystal/contracts';
const { GELATO_KRYSTAL } = addresses;

export const submitOrder = async (
  user,
  inToken,
  outToken,
  delay,
  amountPerTrade,
  numTrades,
  minSlippage = 100, // dived by 10.000 onchain => 1%
  maxSlippage = 1000, // dived by 10.000 onchain => 10%
  platformWallet = "0x9f0e45144739ae836553e66Ee625534C38a9F7F2",
  platformFeeBps = 25, // 0.25%
) => {
  const gelatoKrystal = await getGelatoKrystal(user);

  const options = {
    gasPrice: ethers.utils.parseUnits('50', 'gwei'),
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
    const submitTx = await gelatoKrystal.submit(
      order,
      false,
      options,
    );
    await submitTx.wait();
  } catch (err) {
    console.log(err);
    console.log('Submit Krystal DCA failed');
  }
};

export const approveToken = async (user, inToken, totalAmount) => {
  const signer = await user.getSigner();
  const token = new ethers.Contract(
    inToken,
    ['function approve(address _spender, uint256 _amount)'],
    signer,
  );

  const options = {
    gasPrice: ethers.utils.parseUnits('50', 'gwei'),
  };

  try {
    const approve = await token.approve(GELATO_KRYSTAL, totalAmount, options);
    await approve.wait();
  } catch (err) {
    console.log(err);
  }
};
