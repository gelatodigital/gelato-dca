import { gql } from 'apollo-boost';

const GET_GELATO_KRYSTAL_TASK_CYCLES = gql`
  query gelatoDCATasks($skip: Int, $userAddress: String!) {
    gelatoKrystalTaskCycles(
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
      upcomingTrade {
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
      completedTrades {
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
    }
  }
`;

export default GET_GELATO_KRYSTAL_TASK_CYCLES;