import React, { useMemo, useState, useEffect } from 'react';
import { CardWrapper, Button } from '../components';
import { useTable, useSortBy } from 'react-table';
// Styled components
import styled from 'styled-components';
// Graph QL Query
import { useQuery } from '@apollo/react-hooks';
import GET_GELATO_KRYSTAL_TASKS from '../graphql/gelatoKrystal';
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
    GET_GELATO_KRYSTAL_TASKS,
    {
      variables: {
        skip: 0,
        userAddress: userAddress.toLowerCase(),
      },
    },
  );
  console.log(data);

  const [rowData, setRowData] = useState([
    {
      id: '',
      user: '',
      status: '',
      submitDate: '',
      amount: '',
      execDate: '',
      execLink: '',
    },
  ]);

  const columns = useMemo(
    () => [
      {
        Header: '#',
        accessor: 'id', // accessor is the "key" in the data
      },

      {
        Header: 'Task Status',
        accessor: 'status',
      },
      {
        Header: 'Submit Link',
        accessor: 'submitDate',
      },
      {
        Header: 'Amount to be sold',
        accessor: 'amount',
      },
      {
        Header: 'Exec Date',
        accessor: 'execDate',
      },
      {
        Header: 'Exec Link',
        accessor: 'execLink',
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
    for (let wrapper of data.gelatoKrystalTasks) {
      const decodedUserAddress = wrapper.user.id;
      console.log(decodedUserAddress);
      console.log(userAddress);
      if (
        utils.getAddress(userAddress) !== utils.getAddress(decodedUserAddress)
      ) {
        continue;
      }

      const execUrl = `https://ropsten.etherscan.io/tx/${wrapper.executionHash}`;
      const submitUrl = `https://ropsten.etherscan.io/tx/${wrapper.submissionHash}`;
      newRows.push({
        id: parseInt(wrapper.id),
        status: wrapper.status,
        submitDate: (
          <a target="_blank" href={submitUrl}>
            Link
          </a>
        ),
        amount: utils.formatUnits(
            wrapper.amountPerTrade,
            '18',
        ),
        execDate:
          wrapper.executionDate !== null
            ? new Date(wrapper.executionDate * 1000)
                .toLocaleDateString()
                .toString()
            : '',
        execLink:
          wrapper.status !== 'awaitingExec' ? (
            <a target="_blank" href={execUrl}>
              Link
            </a>
          ) : (
            ''
          ),
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
                id: '',
                status: '',
                submitDate: '',
                limit: '',
                feeratio: '',
                execDate: '',
                execLink: '',
                cancel: '',
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
