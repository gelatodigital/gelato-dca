import { gql } from 'apollo-boost';

const GET_GELATO_DCA_TASK_CYCLES = gql`
  query gelatoDCATasks($skip: Int, $userAddress: String!) {
    gelatoDCATaskCycles(
      where: { user: $userAddress }
      first: 100
      skip: $skip
      orderBy: id
      orderDirection: desc
    ) {
      id
      status
      user {
        id
        address
      }
      inToken
      outToken
      amountPerTrade
      numTrades
      minSlippage
      maxSlippage
      delay
      platformWallet
      platformFeeBps
      startDate
      currentTrade {
        id
        cycleId
        status
        nTradesLeft
        lastExecutionTime
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
        lastExecutionTime
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
    }
  }
`;

export default GET_GELATO_DCA_TASK_CYCLES;