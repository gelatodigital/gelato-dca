import React, { useMemo, useState, useEffect } from 'react';
import { CardWrapper, Button } from '../components';
import { useTable, useSortBy } from 'react-table';
// Styled components
import styled from 'styled-components';
// Graph QL Query
import { useQuery } from '@apollo/react-hooks';
import GET_GELATO_DCA_TASK_CYCLES from '../graphql/gelatoDCA';
import { sleep, getTaskStatus, getTimeAndDate, getPendingApprovalAmount } from '../utils/helpers';
import { utils } from 'ethers';
import {cancelCycle} from '../services/stateWrites'

const pushEmptyRow = (newRows) => {
  return newRows.push({
    id: '',
    status: '',
    amountPerTrade: '',
    received: '',
    txFee: '',
    estimatedExecDate: '',
    actualExecDate: '',
    lastExecLink:'',
    submitLink: '',
    cancel: ''
  });
}

const Styles = styled.div`
  padding: 1rem;
  font-size: 1rem;
  color: black;

  table {
    border-spacing: 0;
    border: 2px solid #4299e1;

    tr {
      :last-child {
        td {
          border-bottom: 0;
        }
      }
    }

    th,
    td {
      text-align: center;
      margin: 0;
      padding: 0.5rem;
      border-bottom: 1px solid #4299e1;
      border-right: 1px solid #4299e1;

      :last-child {
        border-right: 0;
      }
    }
  }
`;

const TaskOverview = ({ userAddress, userAccount }) => {
  const { loading, error, data, refetch, fetchMore } = useQuery(
    GET_GELATO_DCA_TASK_CYCLES,
    {
      variables: {
        skip: 0,
        userAddress: userAddress.toLowerCase(),
      },
    },
  );
  console.log(loading, data, error);

  const [rowData, setRowData] = useState([
    {
      id: '',
      user: '',
      amountPerTrade: '',
      received: '',
      txFee: '',
      status: '',
      estimatedExecDate: '',
      actualExecDate: '',
      lastExecLink: '',
      submitLink: '',
    },
  ]);

  const columns = useMemo(
    () => [
      {
        Header: '#',
        accessor: 'id', // accessor is the "key" in the data
      },
      {
        Header: 'Trade Status',
        accessor: 'status',
      },
      {
        Header: 'Sell Amount',
        accessor: 'amountPerTrade',
      },
      {
        Header: 'Received',
        accessor: 'received',
      },
      {
        Header: 'Tx fee',
        accessor: 'txFee',
      },
      {
        Header: 'Estimated Exec Date',
        accessor: 'estimatedExecDate',
      },
      {
        Header: 'Actual Exec Date',
        accessor: 'actualExecDate',
      },
      {
        Header: 'Exec Link',
        accessor: 'lastExecLink',
      },
      {
        Header: 'Submit Link',
        accessor: 'submitLink',
      },
      {
        Header: 'Cancel Task',
        accessor: 'cancel',
      },
    ],
    [],
  );

  const {
    getTableProps,
    getTableBodyProps,
    headerGroups,
    rows,
    prepareRow,
  } = useTable({ columns, data: rowData }, useSortBy);

  const createRowData = (data) => {
    const newRows = [];
    // Filter all tasks by known Tash Hashes
    let id = 0;
    for (let wrapper of data.cycleWrappers) {
      pushEmptyRow(newRows)
      const fetchtedUserAddress = wrapper.cycle.user
      if (
        utils.getAddress(userAddress) !== utils.getAddress(fetchtedUserAddress)
      ) {
        continue;
      }
      for(let i = 0; i < wrapper.numTrades; i++) {
        id = id + 1;
        const pastTrades = wrapper.completedTrades
        if(pastTrades) {
          pastTrades.sort((a,b)  => {
            return a.submissionDate - b.submissionDate
          })
        }
        const trade = pastTrades && pastTrades[i] ? pastTrades[i] : i === 0 ? wrapper.currentTrade : undefined
        const estimatedExecTime = parseInt(wrapper.startDate) + ((1 + i) * parseInt(wrapper.cycle.delay))
        const estimatedExecDate = getTimeAndDate(estimatedExecTime)
        const actualExecDate = trade && trade.executionDate ? getTimeAndDate(trade.executionDate) : ''
        // let upcomingTrade;
        // let execUrl;
        // let submitUrl;
        const execUrl = trade  && trade.executionDate ? (
          <a target="_blank" href={`https://etherscan.io/tx/${trade.executionHash}`}>
            Link
          </a>
        ) : '';
        const submitUrl = trade ? (<a target="_blank" href={`https://etherscan.io/tx/${trade.submissionHash}` }>
        Link
        </a>
         ): '';
        const status = trade ? getTaskStatus(trade.status)  : wrapper.status === "cancelled" ? 'cancelled' : 'pending'
        console.log(trade)
        const received = trade && trade.amountReceived ? `${parseFloat(utils.formatEther(trade.amountReceived)).toFixed(4)} WETH` : ''
        const txFee = trade && trade.executorFee ? `${parseFloat(utils.formatEther(trade.executorFee)).toFixed(4)} ETH` : ''

        newRows.push({
          id: id,
          status: status,
          amountPerTrade: `${parseFloat(utils.formatEther(wrapper.cycle.amountPerTrade)).toFixed(4)} DAI`,
          received: received,
          txFee: txFee,
          estimatedExecDate: estimatedExecDate,
          actualExecDate: actualExecDate,
          lastExecLink: execUrl,
          submitLink: submitUrl,
          cancel:
            trade && trade.status === 'awaitingExec' ? (
              <>
                <button
                  style={{
                    borderColor: 'white',
                    color: 'white',
                    backgroundColor: '#4299e1',
                  }}
                  onClick={async () => {
                    try {
                      await cancelCycle(
                        userAccount,
                        wrapper.cycle,
                        wrapper.id
                      );
                    } catch (err) {
                      console.log(err);
                    }
                  }}
                >
                  Cancel
                </button>
              </>
            ) : (
              ''
            ),
        });
      }
      
    }
    return newRows;
  };

  useEffect(() => {
    if (data) {
      const newRows = createRowData(data);
      getPendingApprovalAmount(data.gelatoDCATaskCycles)
      if (newRows.length > 0) setRowData(newRows);
    }
  }, [data]);

  if (loading) return <p>Loading...</p>;
  if (error)
    return <p>Error fetching Gelato Subgraph, please refresh the page :)</p>;
  return (
    <>
      <CardWrapper style={{ maxWidth: '100%', marginTop: '80px' }}>
        <Styles>
          <table {...getTableProps()}>
            <thead>
              {
                // Loop over the header rows
                headerGroups.map((headerGroup) => (
                  // Apply the header row props
                  <tr {...headerGroup.getHeaderGroupProps()}>
                    {
                      // Loop over the headers in each row
                      headerGroup.headers.map((column) => (
                        // Apply the header cell props
                        <th
                          {...column.getHeaderProps(
                            column.getSortByToggleProps(),
                          )}
                        >
                          {
                            // Render the header
                            column.render('Header')
                          }
                          <span>
                            {column.isSorted
                              ? column.isSortedDesc
                                ? ' 🔽'
                                : ' 🔼'
                              : ''}
                          </span>
                        </th>
                      ))
                    }
                  </tr>
                ))
              }
            </thead>
            {/* Apply the table body props */}
            <tbody {...getTableBodyProps()}>
              {
                // Loop over the table rows
                rows.map((row) => {
                  // Prepare the row for display
                  prepareRow(row);
                  return (
                    // Apply the row props
                    <tr {...row.getRowProps()}>
                      {
                        // Loop over the rows cells
                        row.cells.map((cell) => {
                          // Apply the cell props
                          return (
                            <td {...cell.getCellProps()}>
                              {
                                // Render the cell contents
                                cell.render('Cell')
                              }
                            </td>
                          );
                        })
                      }
                    </tr>
                  );
                })
              }
            </tbody>
          </table>
        </Styles>
        <Button
          background="#4299e1"
          onClick={async () => {
            refetch();
            setRowData([
              {
                id: '',
                user: '',
                amountPerTrade: '',
                received: '',
                txFee: '',
                status: '',
                estimatedExecDate: '',
                actualExecDate: '',
                lastExecLink: '',
                submitLink: '',
                
              },
            ]);
            await sleep(1000);
            setRowData(createRowData(data));
          }}
        >
          Refresh
        </Button>
      </CardWrapper>
    </>
  );
};

export default TaskOverview;
