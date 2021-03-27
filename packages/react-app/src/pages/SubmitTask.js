import React, { useState, useEffect } from 'react';
import { ethers, BigNumber } from 'ethers';
import { ViewCard, CardWrapper, Button } from '../components';
import { submitOrder, approveToken } from '../services/stateWrites';
import { addresses } from '@gelato-krystal/contracts';
const { DAI, WETH } = addresses;

const SubmitTask = ({ userAccount }) => {
  const [loading, setLoading] = useState(false);
  const [totalAmount, setTotalAmount] = useState(30);
  const [intervalSeconds, setIntervalSeconds] = useState(120);
  const [tradeNum, setTradeNum] = useState(3);
  const [notApproved, setNotApproved] = useState(true);

  const handleTotalAmountChange = async (event) => {
    const newValue = event.target.value;
    setTotalAmount(newValue);
  };

  const handleIntervalSecondsChange = async (event) => {
    const newValue = event.target.value;
    setIntervalSeconds(newValue);
  };

  const handleTradeNumChange = async (event) => {
    const newValue = event.target.value;
    setTradeNum(newValue);
  };

  const submit = async () => {
    if (totalAmount === 0) {
      console.log('Insufficient total amount');
      return;
    }

    if (intervalSeconds === 0) {
      console.log('0 Interval seconds not allowed');
      return;
    }
    if (parseInt(tradeNum) > 10) {
      console.log('Max Trade Number is 10');
      return;
    }

    await submitOrder(
      userAccount,
      DAI,
      WETH,
      intervalSeconds,
      ethers.utils.parseUnits(totalAmount, '18').div(BigNumber.from(tradeNum)),
      tradeNum,
    );
  };

  const approve = async () => {
    if (totalAmount === 0) {
      console.log('Insufficient total amount');
      return;
    }

    await approveToken(
      userAccount,
      DAI,
      ethers.utils.parseUnits(totalAmount, '18'),
    );
  };

  // useEffect(() => {
  //   inputsUpdates();
  // });

  return (
    <>
      <CardWrapper>
        <ViewCard>
          <label style={{ margin: '10px' }}>
            Total Amount of DAI to sell for WETH
          </label>

          <input
            style={{ maxWidth: '80%' }}
            type="number"
            value={totalAmount}
            onChange={handleTotalAmountChange}
            defaultValue={100}
          />
        </ViewCard>

        <ViewCard>
          <label style={{ margin: '10px' }}>
            Interval between each trade (in seconds)
          </label>

          <input
            style={{ maxWidth: '80%' }}
            type="number"
            value={intervalSeconds}
            onChange={handleIntervalSecondsChange}
            defaultValue={240}
          />
        </ViewCard>

        <ViewCard>
          <label style={{ margin: '10px' }}>
            Number of trades to split the total amount up
          </label>

          <input
            style={{ maxWidth: '80%' }}
            type="number"
            value={tradeNum}
            onChange={handleTradeNumChange}
            defaultValue={3}
          />
        </ViewCard>
      </CardWrapper>
      <CardWrapper>
        <ViewCard>
          <label style={{ margin: '10px' }}>
            {`Approve ${parseFloat(totalAmount).toFixed(3)} DAI`}
          </label>
          {!loading && notApproved && (
            <>
              <Button
                onClick={async () => {
                  setLoading(true);
                  try {
                    await approve();
                    setNotApproved(false);
                    setLoading(false);
                  } catch {
                    setLoading(false);
                  }
                }}
              >
                {`Approve`}
              </Button>
            </>
          )}
          {loading && <p>waiting...</p>}
        </ViewCard>
        <ViewCard>
          <label style={{ margin: '10px' }}>
            {`Execute ${tradeNum} trades, each worth ${parseFloat(
              totalAmount / tradeNum,
            ).toFixed(3)} DAI`}
          </label>
          {!loading && !notApproved && (
            <Button
              disabled={notApproved}
              onClick={async () => {
                setLoading(true);
                try {
                  await submit();
                  setLoading(false);
                } catch {
                  setLoading(false);
                }
              }}
            >
              {`Submit Task`}
            </Button>
          )}
          {loading && <p>waiting...</p>}
        </ViewCard>
      </CardWrapper>
    </>
  );
};

export default SubmitTask;
