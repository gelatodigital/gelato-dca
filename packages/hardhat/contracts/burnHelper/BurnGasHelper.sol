// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.0;

import "./IBurnGasHelper.sol";
import {Utils} from "../vendor/kyber/utils/Utils.sol";
import {Withdrawable} from "../vendor/kyber/utils/Withdrawable.sol";

contract BurnGasHelper is IBurnGasHelper, Utils, Withdrawable {
    address public gasTokenAddr;

    constructor(address _admin, address _gasToken) Withdrawable(_admin) {
        gasTokenAddr = _gasToken;
    }

    function updateGasToken(address _gasToken) external onlyAdmin {
        gasTokenAddr = _gasToken;
    }

    function getAmountGasTokensToBurn(uint256 gasTotalConsumption)
        external
        view
        override
        returns (uint256 numGas, address gasToken)
    {
        gasToken = gasTokenAddr;
        uint256 gas = gasleft();
        uint256 safeNumTokens = 0;
        if (gas >= 27710) {
            safeNumTokens = (gas - 27710) / 7020; // (1148 + 5722 + 150);
        }

        uint256 gasSpent = 21000 + 16 * gasTotalConsumption;
        numGas = (gasSpent + 14154) / 41947;

        numGas = minOf(safeNumTokens, numGas);
    }
}
