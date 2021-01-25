// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.0;
pragma experimental ABIEncoderV2;

import {
  IERC20,
  SafeERC20,
  SafeMath
} from '@openzeppelin/contracts/token/ERC20/SafeERC20.sol';
import {Ownable} from '@openzeppelin/contracts/access/Ownable.sol';
import {IGasPriceOracle} from './interfaces/IGasPriceOracle.sol';
import {IGelatoService} from './interfaces/IGelatoService.sol';
import {IOracleAggregator} from './interfaces/IOracleAggregator.sol';

contract GelatoServiceStandard is IGelatoService, Ownable {
  using SafeERC20 for IERC20;
  using SafeMath for uint256;

  address internal constant _ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

  mapping(uint256 => bytes32) public taskHash;
  uint256 public taskId;

  address public immutable executorModule;
  IOracleAggregator public immutable oracleAggregator;
  IGasPriceOracle public immutable gasPriceOracle;

  constructor(
    address _executorModule,
    IOracleAggregator _oracleAggregator,
    IGasPriceOracle _gasPriceOracle
  ) {
    oracleAggregator = _oracleAggregator;
    gasPriceOracle = _gasPriceOracle;
    executorModule = _executorModule;
  }

  modifier gelatofy(
    address _outToken,
    address _user,
    uint256 _gasOverhead
  ) {
    // start gas measurement and check if msg.sender is Gelato
    uint256 gasStart = gasleft();
    require(
      executorModule == _msgSender(),
      'GelatoKrystal: Caller is not the executorModule'
    );
    uint256 preBalance = IERC20(_outToken).balanceOf(address(this));

    // Execute Logic
    _;

    // handle payment
    uint256 received =
      IERC20(_outToken).balanceOf(address(this)).sub(preBalance);
    _handlePayments(received, _outToken, gasStart, _gasOverhead, _user);
  }

  function verifyTask(bytes32 _taskHash, uint256 _id)
    public
    view
    virtual
    override
    returns (bool)
  {
    return (taskHash[_id] == _taskHash);
  }

  function currentTaskId() public view virtual override returns (uint256) {
    return taskId;
  }

  function getGasPrice() public view virtual override returns (uint256) {
    uint256 oracleGasPrice = uint256(gasPriceOracle.latestAnswer());

    // Use tx.gasprice capped by 1.3x Chainlink Oracle
    return
      tx.gasprice <= oracleGasPrice.mul(130).div(100)
        ? tx.gasprice
        : oracleGasPrice.mul(130).div(100);
  }

  function getGelatoFee(
    uint256 _gasStart,
    uint256 _gasOverhead,
    address _outToken,
    uint256 _received
  ) private view returns (uint256 gelatoFee) {
    uint256 gasFeeEth =
      _gasStart.sub(gasleft()).add(_gasOverhead).mul(getGasPrice());

    // returns purely the ethereum tx fee
    (uint256 ethTxFee, ) =
      oracleAggregator.getExpectedReturnAmount(gasFeeEth, _ETH, _outToken);

    // add 7% bps on top of Ethereum tx fee
    gelatoFee = ethTxFee.add(_received.mul(7).div(10000));
  }

  function _handlePayments(
    uint256 _received,
    address _outToken,
    uint256 _gasStart,
    uint256 _gasOverhead,
    address _user
  ) private {
    // Get fee payable to Gelato
    uint256 txFee = getGelatoFee(_gasStart, _gasOverhead, _outToken, _received);

    // Pay Gelato
    IERC20(_outToken).safeTransfer(executorModule, txFee);

    // Send remaining tokens to user
    IERC20(_outToken).safeTransfer(_user, _received.sub(txFee));
  }
}
