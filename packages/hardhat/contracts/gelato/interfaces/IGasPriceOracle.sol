// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.6.10;

interface IGasPriceOracle {
  function latestAnswer() external view returns (uint256);

  function decimals() external view returns (uint256);
}
