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
  nTrades,
  minSlippage = 9001,
  maxSlippage = 9000,
  gasPriceCeil = 0,
) => {
  const gelatoKrystal = await getGelatoKrystal(user);

  const options = {
    gasPrice: ethers.utils.parseUnits('50', 'gwei'),
  };

  try {
    const submitTx = await gelatoKrystal.submitDCAKyber(
      {
        _inToken: inToken,
        _outToken: outToken,
        _amountPerTrade: amountPerTrade,
        _nTrades: nTrades,
        _minSlippage: minSlippage,
        _maxSlippage: maxSlippage,
        _delay: delay,
        _gasPriceCeil: gasPriceCeil,
      },
      options,
    );
    await submitTx.wait();
  } catch (err) {
    console.log(err);
    console.log('Submit DCA Kyber failed');
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
