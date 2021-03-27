import { gql } from 'apollo-boost';

const GET_GELATO_DCA_TASK_CYCLES = gql`
  query gelatoDCATasks($skip: Int, $userAddress: String!) {
    cycleWrappers(
      where: { user: $userAddress }
      first: 100
      skip: $skip
      orderBy: id
      orderDirection: desc
    ) {
      id
      status
      startDate
      numTrades
      currentTrade {
        id
        cycleId
        status
        nTradesLeft
        submissionDate
        submissionHash
        executionDate
        executionHash
        executor {
          id
          addr
        }
        executorFee
        feeToken
      }
      completedTrades (
        orderBy: submissionHash
        orderDirection: desc) 
      {
        id
        cycleId
        status
        nTradesLeft
        submissionDate
        submissionHash
        executionDate
        executionHash
        executor {
          id
          addr
        }
        executorFee
        feeToken
        amountReceived
      }
      cycle {
        user
        inToken
        outToken
        amountPerTrade
        nTradesLeft
        minSlippage
        maxSlippage
        delay
        lastExecutionTime
        platformWallet
        platformFeeBps
      }
    }
  }
`;

export default GET_GELATO_DCA_TASK_CYCLES;