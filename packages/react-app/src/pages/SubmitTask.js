import { useQuery } from '@apollo/react-hooks';
import { addresses } from '@gelato-krystal/contracts';
import { BigNumber, ethers } from 'ethers';
import React, { useEffect, useState } from 'react';
import { Button, CardWrapper, ViewCard } from '../components';
import GET_GELATO_DCA_TASK_CYCLES from '../graphql/gelatoDCA';
import { getTokenAllowance } from '../services/stateReads';
import { approveToken, submitOrder } from '../services/stateWrites';
import { getPendingApprovalAmount } from '../utils/helpers';
const { DAI, WETH } = addresses;


const SubmitTask = ({ userAccount, userAddress }) => {
  // get data from subgraph
  const { loading, data,  } = useQuery(
    GET_GELATO_DCA_TASK_CYCLES,
    {
      variables: {
        skip: 0,
        userAddress: userAddress.toLowerCase(),
      },
    },
  );

  // internal state
  const [pendingApproval, setPendingApproval] = useState(ethers.constants.Zero);
  const [txLoading, setTxLoading] = useState(false);
  const [totalAmount, setTotalAmount] = useState(30);
  const [intervalSeconds, setIntervalSeconds] = useState(120);
  const [tradeNum, setTradeNum] = useState(3);
  const [needsApproval, setNeedsApproval] = useState(true);

  const handleTotalAmountChange = async (event) => {
    const newValue = event.target.value;
    if (newValue=== '') setTotalAmount(0);
    else
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

  const checkIfApprovalRequired = async() => {
    const currentApproval = await getTokenAllowance(userAccount, DAI)
    const totalAmountBn = ethers.utils.parseUnits(totalAmount.toString(), '18')
    
    // If currentApproval are greater than pendingApprovals plus totalamountBn, then no need to approva again
    console.log(`Current Approvals: ${currentApproval.toString()}`)
    console.log(`Pending Approvals: ${pendingApproval.toString()}`)
    console.log(`Total amount: ${totalAmountBn.toString()}`)
    if(currentApproval.gte(totalAmountBn.add(pendingApproval))) {
      setNeedsApproval(false)
    } else {
      setNeedsApproval(true)
    }
  }
  
  /* eslint-disable react-hooks/exhaustive-deps */ 
  useEffect(() => {
    if (data) {
      const newPendingApproval = getPendingApprovalAmount(data.cycleWrappers)
      const newPendingApprovalBn = ethers.BigNumber.from(newPendingApproval.toString())
      if(!newPendingApprovalBn.eq(pendingApproval)) setPendingApproval(newPendingApprovalBn)
    }
      
  }, [loading, pendingApproval, totalAmount])
  
  useEffect(() => {
    checkIfApprovalRequired()
  }, [pendingApproval, totalAmount])

  return (
    <>
      <CardWrapper>
        <ViewCard>
          <label style={{ margin: '10px' }}>
            Total Amount of DAI to sell for WETH 
          </label>
          <label style={{ marginBottom: '8px', fontSize: '10px' }}>
          (min. 300 DAI, more is better)
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
          {!txLoading && needsApproval && (
            <>
              <Button
                onClick={async () => {
                  setTxLoading(true);
                  try {
                    await approve();
                    setNeedsApproval(false);
                    setTxLoading(false);
                  } catch {
                    setTxLoading(false);
                  }
                }}
              >
                {`Approve`}
              </Button>
            </>
          )}
          { !needsApproval && (
            `✅`
          )}
          {txLoading && <p>waiting...</p>}
        </ViewCard>
        <ViewCard>
          <label style={{ margin: '10px' }}>
            {`Execute ${tradeNum} trades, each worth ${parseFloat(
              totalAmount / tradeNum,
            ).toFixed(3)} DAI`}
          </label>
          {!txLoading && !needsApproval && (
            <Button
              disabled={needsApproval}
              onClick={async () => {
                setTxLoading(true);
                try {
                  await submit();
                  setTxLoading(false);
                } catch {
                  setTxLoading(false);
                }
              }}
            >
              {`Submit Task`}
            </Button>
          )}
          {txLoading && <p>waiting...</p>}
        </ViewCard>
      </CardWrapper>
    </>
  );
};

export default SubmitTask;
