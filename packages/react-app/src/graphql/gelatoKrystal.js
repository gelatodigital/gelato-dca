import { gql } from 'apollo-boost';

const GET_GELATO_KRYSTAL_TASKS = gql`
  query gelatoKrystalTasks($skip: Int, $userAddress: String!) {
    gelatoKrystalTasks(
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
      nTradesLeft
      minSlippage
      maxSlippage
      lastExecutionTime
      delay
      gasPriceCeil
      submissionDate
      submissionHash
      executionDate
      executionHash
      executor {
        id
        addr
      }
    }
  }
`;

export default GET_GELATO_KRYSTAL_TASKS;