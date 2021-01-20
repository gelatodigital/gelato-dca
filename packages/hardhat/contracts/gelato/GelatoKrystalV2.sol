// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.0;
pragma experimental ABIEncoderV2;

import {
  IERC20,
  SafeERC20,
  SafeMath
} from '@openzeppelin/contracts/token/ERC20/SafeERC20.sol';
import {Ownable} from '@openzeppelin/contracts/access/Ownable.sol';
import {IOracleAggregator} from './interfaces/IOracleAggregator.sol';
import {IGasPriceOracle} from './interfaces/IGasPriceOracle.sol';
import {
  ISmartWalletSwapImplementation
} from './interfaces/ISmartWalletSwapImplementation.sol';

contract GelatoKrystalV2 is Ownable {
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

  event LogTaskSubmitted(uint256 indexed id, address indexed user, Order order);

  event LogExecSuccess(uint256 indexed taskId, address indexed executor);

  // user => taskId => taskHash
  mapping(uint256 => bytes32) public taskHash;
  // user => token => totalToSpend
  mapping(address => mapping(address => uint256)) public totalToSpend;

  address internal constant _ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
  bytes internal constant _HINT = '';
  uint256 public constant PLATFORM_FEE_BPS = 8;
  uint256 public constant GAS_OVERHEAD = 100000; // TODO: get more accurate overhead estimate
  uint256 public taskId;

  IOracleAggregator public immutable oracleAggregator;
  ISmartWalletSwapImplementation public immutable smartWalletSwap;
  IGasPriceOracle public immutable gasPriceOracle;
  address payable public immutable platformWallet;
  address public immutable executorModule;

  constructor(
    IOracleAggregator _oracleAggregator,
    ISmartWalletSwapImplementation _smartWalletSwap,
    address payable _platformWallet,
    address _executorModule,
    IGasPriceOracle _gasPriceOracle
  ) {
    oracleAggregator = _oracleAggregator;
    smartWalletSwap = _smartWalletSwap;
    platformWallet = _platformWallet;
    executorModule = _executorModule;
    gasPriceOracle = _gasPriceOracle;
  }

  modifier gelatofy(address _outToken, address _user) {
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
    _handlePayments(received, _outToken, gasStart, _user);
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

    // œdev To Do: Approval Implementation

    // uint256 upcomingSpend = totalToSpend[msg.sender][order.inToken];
    // totalToSpend[msg.sender][order.inToken] =
    //     upcomingSpend.add(order.amountPerTrade.mul(order.nTradesLeft));

    // store order
    _storeOrder(order);
  }

  function exec(Order memory _order, uint256 _id)
    external
    gelatofy(_order.outToken, _order.user)
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
    bytes32 taskHashStor = taskHash[_id];
    require(taskHashStor != bytes32(0), 'GelatoKrystal: invalid task');

    // Check whether passed calldata is correct
    require(
      hashTask(_order, _id) == taskHashStor,
      'GelatoKrystal: incorrect task parameters'
    );
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

  function getGelatoFee(
    uint256 _gasStart,
    address _outToken,
    uint256 _received
  ) private view returns (uint256 gelatoFee) {
    uint256 gasFeeEth =
      _gasStart.sub(gasleft()).add(GAS_OVERHEAD).mul(getGasPrice());

    // returns purely the ethereum tx fee
    (uint256 ethTxFee, ) =
      oracleAggregator.getExpectedReturnAmount(gasFeeEth, _ETH, _outToken);

    // add 7% bps on top of Ethereum tx fee
    gelatoFee = ethTxFee.add(_received.mul(7).div(10000));
  }

  function getGasPrice() private view returns (uint256) {
    uint256 oracleGasPrice = uint256(gasPriceOracle.latestAnswer());

    // Use tx.gasprice capped by 1.3x Chainlink Oracle
    return
      tx.gasprice < oracleGasPrice.mul(130).div(100)
        ? tx.gasprice
        : oracleGasPrice.mul(130).div(100);
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
    // update remaining allowance needed
    // uint256 prevTotal = totalToSpend[_order.user][_order.inToken];
    // totalToSpend[_order.user][_order.inToken] = prevTotal.sub(_order.amountPerTrade);

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

    emit LogTaskSubmitted(taskId, _order.user, _order);
  }

  function _handlePayments(
    uint256 _received,
    address _outToken,
    uint256 _gasStart,
    address _user
  ) private {
    // Get fee payable to Gelato
    uint256 txFee = getGelatoFee(_gasStart, _outToken, _received);

    // Pay Gelato
    IERC20(_outToken).safeTransfer(executorModule, txFee);

    // Send remaining tokens to user
    IERC20(_outToken).safeTransfer(_user, _received.sub(txFee));
  }

  // ############# Fallback #############
  // solhint-disable-next-line no-empty-blocks
  receive() external payable {}

  // function allowanceDelta(address _user, IERC20 _token)
  //     public
  //     view
  //     returns(uint256 delta, bool isLiquid)
  // {
  //     uint256 upcoming = totalToSpend[_user][address(_token)];
  //     uint256 allowance = _token.allowance(_user, address(this));
  //     if (allowance >= upcoming) {
  //         isLiquid = true;
  //         delta = allowance.sub(upcoming);
  //     } else {
  //         delta = upcoming.sub(allowance);
  //     }
  // }
}
