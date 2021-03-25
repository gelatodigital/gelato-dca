import React, { useMemo, useState, useEffect } from 'react';
import { CardWrapper, Button } from '../components';
import { useTable, useSortBy } from 'react-table';
// Styled components
import styled from 'styled-components';
// Graph QL Query
import { useQuery } from '@apollo/react-hooks';
import GET_GELATO_KRYSTAL_TASK_CYCLES from '../graphql/gelatoKrystal';
import { sleep, decodeWithoutSignature } from '../utils/helpers';
import { utils } from 'ethers';
import { addresses } from '@gelato-krystal/contracts';
const { GELATO_KRYSTAL } = addresses;

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
    GET_GELATO_KRYSTAL_TASK_CYCLES,
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
      cycleId: '',
      user: '',
      totalAmount: '',
      numTrades: '',
      amountPerTrade: '',
      status: '',
      numCompleted: '',
      lastExecDate: '',
      lastExecLink: '',
      amountRemaining: '',
      nextTradeNumber: '',
      nextTradeStatus: '',
      submitLink: '',
      nextExecDate: '',
    },
  ]);

  const columns = useMemo(
    () => [
      {
        Header: 'Cycle Id',
        accessor: 'cycleId', // accessor is the "key" in the data
      },
      {
        Header: 'Task Status',
        accessor: 'status',
      },
      {
        Header: 'Total Amount',
        accessor: 'totalAmount'
      },
      {
        Header: '# of Trades',
        accessor: 'numTrades',
      },
      {
        Header: 'Amount per Trade',
        accessor: 'amountPerTrade',
      },
      {
        Header: '# Complete',
        accessor: 'numCompleted',
      },
      {
        Header: 'Last Exec Date',
        accessor: 'lastExecDate',
      },
      {
        Header: 'Last Exec Link',
        accessor: 'lastExecLink',
      },
      {
        Header: 'Amount Remaining',
        accessor: 'amountRemaining',
      },
      {
        Header: 'Trade #',
        accessor: 'nextTradeNumber',
      },
      { 
        Header: 'Trade Status',
        accessor: 'nextTradeStatus',
      },
      {
        Header: 'Next Exec Date',
        accessor: 'nextExecDate',
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
    for (let wrapper of data.gelatoKrystalTaskCycles) {
      const decodedUserAddress = wrapper.user.id;
      console.log(decodedUserAddress);
      console.log(userAddress);
      if (
        utils.getAddress(userAddress) !== utils.getAddress(decodedUserAddress)
      ) {
        continue;
      }
      let lastCompleteTrade;
      let upcomingTrade;
      let execUrl;
      let submitUrl;
      if (wrapper.completedTrades.length !== 0) {
        lastCompleteTrade = wrapper.completedTrades[wrapper.completedTrades.length-1];
        execUrl = `https://etherscan.io/tx/${lastCompleteTrade.executionHash}`;
      }
      if (wrapper.completedTrades.length !== Number(wrapper.numTrades.toString())) {
        upcomingTrade = wrapper.upcomingTrade;
        submitUrl = `https://etherscan.io/tx/${upcomingTrade.submissionHash}`;
      }
      newRows.push({
        cycleId: wrapper.id.substring(0, 6),
        status: wrapper.status,
        totalAmount: utils.formatEther((wrapper.amountPerTrade * wrapper.numTrades).toString()),
        numTrades: wrapper.numTrades.toString(),
        amountPerTrade: utils.formatEther(wrapper.amountPerTrade),
        numCompleted: wrapper.completedTrades.length.toString(),
        lastExecDate: lastCompleteTrade
          ? new Date(lastCompleteTrade.executionDate * 1000)
            .toLocaleDateString()
            .toString()
          : '',
        lastExecLink:
          lastCompleteTrade ? (
            <a target="_blank" href={execUrl}>
              Link
            </a>
          ) : (
            ''
          ),
        amountRemaining: upcomingTrade ? (Number(utils.formatEther(wrapper.amountPerTrade)) * (Number(upcomingTrade.nTradesLeft)+1)).toString() : '0',
        nextTradeNumber: upcomingTrade ? (wrapper.numTrades-upcomingTrade.nTradesLeft).toString() : '',
        nextTradeStatus: upcomingTrade ? upcomingTrade.status : '',
        nextExecDate: upcomingTrade 
          ? new Date(Number((upcomingTrade.lastExecutionTime+wrapper.delay)))
            .toLocaleDateString()
            .toString()
          : '',
        submitLink: upcomingTrade 
          ? (
            <a target="_blank" href={submitUrl}>
              Link
            </a>
          ) : '',
        cancel:
          wrapper.status === 'awaitingExec' ? (
            <>
              <button
                style={{
                  borderColor: 'white',
                  color: 'white',
                  backgroundColor: '#4299e1',
                }}
                onClick={async () => {
                  console.log('Cancel Feature coming later');
                  // const cancelTaskData = getCancelTaskData(wrapper.taskReceipt);
                  // try {
                  //   await userProxyCast(
                  //     [CONNECT_GELATO_ADDR],
                  //     [cancelTaskData],
                  //     userAccount,
                  //     0,
                  //     300000
                  //   );
                  // } catch (err) {
                  //   console.log(err);
                  // }
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
    return newRows;
  };

  useEffect(() => {
    if (data) {
      const newRows = createRowData(data);
      if (newRows.length > 0) setRowData(newRows);
    }
  }, [data]);

  if (loading) return <p>Loading...</p>;
  if (error)
    return <p>Error fetching Gelato Subgraph, please refresh the page :)</p>;
  return (
    <>
      <CardWrapper style={{ maxWidth: '100%' }}>
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
                cycleId: '',
                user: '',
                totalAmount: '',
                numTrades: '',
                amountPerTrade: '',
                status: '',
                numCompleted: '',
                lastExecDate: '',
                lastExecLink: '',
                amountRemaining: '',
                nextTradeNumber: '',
                nextTradeStatus: '',
                submitLink: '',
                nextExecDate: '',
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
