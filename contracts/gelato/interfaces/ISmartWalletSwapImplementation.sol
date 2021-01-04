// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.0;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

// Importing here due to compiler issues
interface ISmartWalletSwapImplementation {

    function getExpectedReturnKyber(
    IERC20 src,
    IERC20 dest,
    uint256 srcAmount,
    uint256 platformFeeBps,
    bytes calldata hint
  ) external view returns (uint256 destAmount, uint256 expectedRate);

  function swapKyber(
    IERC20 src,
    IERC20 dest,
    uint256 srcAmount,
    uint256 minConversionRate,
    address payable recipient,
    uint256 platformFeeBps,
    address payable platformWallet,
    bytes calldata hint,
    bool useGasToken
  ) external payable returns (uint256 destAmount);

}