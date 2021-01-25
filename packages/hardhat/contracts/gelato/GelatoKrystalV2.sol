// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.0;
pragma experimental ABIEncoderV2;

import {
  IERC20,
  SafeERC20,
  SafeMath
} from '@openzeppelin/contracts/token/ERC20/SafeERC20.sol';
import {
  ISmartWalletSwapImplementation
} from './interfaces/ISmartWalletSwapImplementation.sol';
import {IGasPriceOracle} from './interfaces/IGasPriceOracle.sol';
import {IGelatoService} from './interfaces/IGelatoService.sol';
import {IOracleAggregator} from './interfaces/IOracleAggregator.sol';
import {GelatoServiceStandard} from './GelatoServiceStandard.sol';

contract GelatoKrystalV2 is GelatoServiceStandard {
  using SafeERC20 for IERC20;
  using SafeMath for uint256;

  struct Order {
    address user;
    address inToken;
    address outToken;
    uint256 amountPerTrade;
    uint256 nTradesLeft;
    uint256 minSlippage;
    uint256 maxSlippage;
    uint256 delay;
    uint256 gasPriceCeil;
    uint256 lastExecutionTime;
  }

  bytes internal constant _HINT = '';
  uint256 public constant PLATFORM_FEE_BPS = 8;
  uint256 public constant GAS_OVERHEAD = 100000;

  ISmartWalletSwapImplementation public immutable smartWalletSwap;
  address payable public immutable platformWallet;

  constructor(
    address _executorModule,
    IOracleAggregator _oracleAggregator,
    IGasPriceOracle _gasPriceOracle,
    ISmartWalletSwapImplementation _smartWalletSwap,
    address payable _platformWallet
  ) GelatoServiceStandard(_executorModule, _oracleAggregator, _gasPriceOracle) {
    smartWalletSwap = _smartWalletSwap;
    platformWallet = _platformWallet;
  }

  function submit(
    address inToken,
    address outToken,
    uint256 amountPerTrade,
    uint256 nTradesLeft,
    uint256 minSlippage,
    uint256 maxSlippage,
    uint256 delay,
    uint256 gasPriceCeil
  ) external {
    Order memory order =
      Order({
        user: msg.sender,
        inToken: inToken,
        outToken: outToken,
        amountPerTrade: amountPerTrade,
        nTradesLeft: nTradesLeft,
        minSlippage: minSlippage,
        maxSlippage: maxSlippage,
        delay: delay,
        gasPriceCeil: gasPriceCeil,
        lastExecutionTime: block.timestamp
      });

    // @dev To Do: Handle Approval Tracking

    // store order
    _storeOrder(order);
  }

  function exec(Order memory _order, uint256 _id)
    external
    gelatofy(_order.outToken, _order.user, GAS_OVERHEAD)
  {
    // pre exec checks
    preCanExec(_order, _id);

    // action exec
    _action(_order);

    // task cycle logic
    delete taskHash[_id];
    if (_order.nTradesLeft > 0) _updateAndSubmitNextTask(_order, _id);

    // emit event
    emit LogExecSuccess(_id, executorModule);
  }

  // ############# VIEW #############
  function canExec(Order memory _order, uint256 _id)
    public
    view
    returns (string memory)
  {
    // 1. verify task submitted and gas price
    preCanExec(_order, _id);

    // Balance Check
    uint256 balance = IERC20(_order.inToken).balanceOf(_order.user);
    require(
      balance >= _order.amountPerTrade,
      'GelatoKrystsal: Insufficient balance'
    );

    // 2. Approval Check
    uint256 allowance =
      IERC20(_order.inToken).allowance(_order.user, address(this));
    require(
      allowance >= _order.amountPerTrade,
      'GelatoKrystsal: Insufficient allowance'
    );

    // 4. Rate Check
    uint256 minReturn = getMinReturn(_order);
    (uint256 actualReturn, ) =
      smartWalletSwap.getExpectedReturnKyber(
        IERC20(_order.inToken),
        IERC20(_order.outToken),
        _order.amountPerTrade,
        PLATFORM_FEE_BPS,
        _HINT
      );

    require(
      minReturn < actualReturn,
      'GelatoKrystsal: Time passed but expected return too low'
    );

    require(
      executorModule == _msgSender(),
      'GelatoKrystal: Caller is not the executorModule'
    );

    return 'OK';
  }

  function preCanExec(Order memory _order, uint256 _id) public view {
    // Check whether order is valid
    bytes32 execTaskHash = hashTask(_order, _id);
    require(verifyTask(execTaskHash, _id), 'GelatoKrystal: invalid task');
  }

  function getMinReturn(Order memory _order)
    public
    view
    returns (uint256 minReturn)
  {
    // 4. Rate Check
    (uint256 idealReturn, ) =
      oracleAggregator.getExpectedReturnAmount(
        _order.amountPerTrade,
        _order.inToken,
        _order.outToken
      );

    // check time (reverts if block.timestamp is below execTime)
    // solhint-disable-next-line not-rely-on-time
    uint256 timeSinceCanExec =
      block.timestamp.sub(_order.lastExecutionTime.add(_order.delay));

    uint256 slippage;
    if (_order.minSlippage > timeSinceCanExec) {
      slippage = _order.minSlippage.sub(timeSinceCanExec);
    }

    if (_order.maxSlippage > slippage) {
      slippage = _order.maxSlippage;
    }

    minReturn = idealReturn.sub(idealReturn.mul(slippage).div(10000));
  }

  function hashTask(Order memory _order, uint256 _taskId)
    public
    pure
    returns (bytes32)
  {
    return keccak256(abi.encode(_order, _taskId));
  }

  // ############# PRIVATE #############
  function _action(Order memory _order) private {
    IERC20(_order.inToken).safeTransferFrom(
      _order.user,
      address(this),
      _order.amountPerTrade
    );
    IERC20(_order.inToken).safeApprove(
      address(smartWalletSwap),
      _order.amountPerTrade
    );

    uint256 minReturn = getMinReturn(_order);

    smartWalletSwap.swapKyber(
      IERC20(_order.inToken),
      IERC20(_order.outToken),
      _order.amountPerTrade,
      minReturn,
      address(this),
      PLATFORM_FEE_BPS,
      platformWallet,
      _HINT,
      false
    );
  }

  function _updateAndSubmitNextTask(Order memory _order, uint256 _id) private {
    // update next order
    _order.nTradesLeft = _order.nTradesLeft.sub(1);
    _order.lastExecutionTime = block.timestamp;

    // store order
    _storeOrder(_order);
  }

  function _storeOrder(Order memory _order) private {
    taskId = taskId.add(1);

    // submit task
    bytes32 hashed = hashTask(_order, taskId);
    taskHash[taskId] = hashed;

    emit LogTaskSubmitted(
      taskId,
      _encodeCanExec(_order, taskId),
      address(this),
      'function exec((address,address,address,uint256,uint256,uint256,uint256,uint256,uint256,uint256),uint256) external',
      _encodeExecParams(_order, taskId),
      address(this)
    );
  }

  function _encodeCanExec(Order memory _order, uint256 _id)
    private
    pure
    returns (bytes memory)
  {
    return abi.encodeWithSelector(this.canExec.selector, _order, _id);
  }

  function _encodeExecParams(Order memory _order, uint256 _id)
    private
    pure
    returns (bytes memory)
  {
    return abi.encode(_order, _id);
  }

  // ############# Fallback #############
  // solhint-disable-next-line no-empty-blocks
  receive() external payable {}
}
