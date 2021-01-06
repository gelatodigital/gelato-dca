// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.6.10;
import {IGasPriceOracle} from "../gelato/interfaces/IGasPriceOracle.sol";

contract MockOracle is IGasPriceOracle {
  uint256 public immutable constantDecimals;
  uint256 public immutable constantAnswer;

  // solhint-disable-next-line no-empty-blocks
  constructor (uint256 _answer, uint256 _decimals) public {
    constantAnswer = _answer;
    constantDecimals = _decimals;
  }

  function latestAnswer() external view override returns (uint256) {
    return constantAnswer;
  }

  function decimals() external view override returns (uint256) {
    return constantDecimals;
  }
}
