// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.0;

interface IBurnGasHelper {
    function getAmountGasTokensToBurn(uint256 gasTotalConsumption)
        external
        view
        returns (uint256 numGas, address gasToken);
}
