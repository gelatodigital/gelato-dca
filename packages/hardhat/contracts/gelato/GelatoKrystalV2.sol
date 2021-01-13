// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.0;
pragma experimental ABIEncoderV2;

import {IERC20, SafeERC20, SafeMath} from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IOracleAggregator} from "./interfaces/IOracleAggregator.sol";
import {IGasPriceOracle} from "./interfaces/IGasPriceOracle.sol";
import {ISmartWalletSwapImplementation} from "./interfaces/ISmartWalletSwapImplementation.sol";

contract GelatoKrystalV2 is Ownable {

    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    struct Order {
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

    event LogTaskSubmitted (
        uint256 indexed id,
        address indexed user,
        Order order
    );

    event LogExecSuccess(
        uint256 indexed taskId,
        address indexed executor
    );

    // user => taskId => taskHash
    mapping(address => mapping(uint256 => bytes32)) public taskHash;
    // user => token => totalToSpend
    mapping(address => mapping(address => uint256)) public totalToSpend;

    address internal constant _ETH_ADDRESS = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
    bytes internal constant _HINT = "";
    uint256 public constant PLATFORM_FEE_BPS = 8;
    bytes32 internal constant EXECUTED = 0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff; 
    uint256 public constant GAS_OVERHEAD = 100000; // TODO: get more accurate overhead estimate
    uint256 public taskId;

    IOracleAggregator public immutable oracleAggregator;
    ISmartWalletSwapImplementation public immutable smartWalletSwap;
    IGasPriceOracle public immutable gasPriceOracle;

    address payable public platformWallet;
    address public executorModule;

    constructor(
        IOracleAggregator _oracleAggregator,
        ISmartWalletSwapImplementation _smartWalletSwap,
        address payable _platformWallet,
        address _executorModule,
        IGasPriceOracle _gasPriceOracle
    )
    {
        oracleAggregator = _oracleAggregator;
        smartWalletSwap = _smartWalletSwap;
        platformWallet = _platformWallet;
        executorModule = _executorModule;
        gasPriceOracle = _gasPriceOracle;
    }

    modifier onlyExecModule() {
        require(executorModule == _msgSender(), "GelatoKrystal: Caller is not the executorModule");
        _;
    }

    function submit(
        Order memory _order
    )
        external
    {
        if (_order.lastExecutionTime == 0) {
            _order.lastExecutionTime = block.timestamp;
        }
        taskId = taskId.add(1);

        bytes32 hashed = hashTask(_order, msg.sender, taskId);
        require(taskHash[msg.sender][taskId] == bytes32(0), "GelatoKrystal: task already exists");
        taskHash[msg.sender][taskId] = hashed;

        uint256 upcomingSpend = totalToSpend[msg.sender][_order.inToken];
        totalToSpend[msg.sender][_order.inToken] =
            upcomingSpend.add(_order.amountPerTrade.mul(_order.nTradesLeft));

        emit LogTaskSubmitted(taskId, msg.sender, _order);
    }

    function exec(
        Order memory _order,
        address _user,
        uint256 _id
    ) 
        external 
        onlyExecModule 
    {
        // gas measurement
        uint256 gasStart = gasleft();

        // verify task submitted and gas price
        _canExec(_order, _user, _id);

        IERC20(_order.inToken).safeTransferFrom(_user, address(this), _order.amountPerTrade);
        IERC20(_order.inToken).safeApprove(address(smartWalletSwap), _order.amountPerTrade);

        // 4. Rate Check
        (uint256 idealReturn,) = oracleAggregator.getExpectedReturnAmount(
            _order.amountPerTrade,
            _order.inToken,
            _order.outToken
        );

        // check time (reverts if block.timestamp is below execTime)
        // solhint-disable-next-line not-rely-on-time
        uint256 timeSinceCanExec = block.timestamp.sub(_order.lastExecutionTime.add(_order.delay));
        uint256 slippage;
        if (_order.minSlippage > timeSinceCanExec) {
            slippage = _order.minSlippage.sub(timeSinceCanExec);
        }

        if (_order.maxSlippage > slippage) {
            slippage = _order.maxSlippage;
        }

        uint256 minReturn = idealReturn.sub(idealReturn.mul(slippage).div(10000));

        uint256 received = smartWalletSwap.swapKyber(
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
        if (_order.nTradesLeft > 0) {
            _updateAndSubmitTask(_order, _user, _id);
        }
        emit LogExecSuccess(_id, executorModule);
        uint256 gasFeeEth = gasStart.sub(gasleft()).add(GAS_OVERHEAD).mul(fetchCurrentGasPrice()); // TODO: Add gelato profit / more overhead for gas bump ??
        (uint256 gasFeeToken,) = oracleAggregator.getExpectedReturnAmount(
            gasFeeEth,
            _ETH_ADDRESS,
            _order.outToken
        );
        IERC20(_order.outToken).safeTransfer(executorModule, gasFeeToken);
        IERC20(_order.outToken).safeTransfer(_user, received.sub(gasFeeToken));
    }

    function canExec(
        Order memory _order,
        address _user,
        uint256 _id
    )
        public
        view
        returns(string memory)
    {
        // verify task submitted and gas price
        _canExec(_order, _user, _id);

        // 1. Balance Check
        uint256 balance = IERC20(_order.inToken).balanceOf(_user);
        require(balance >= _order.amountPerTrade, "GelatoKrystsal: Insufficient balance");

        // 2. Approval Check
        uint256 allowance = IERC20(_order.inToken).allowance(_user, address(this));
        require(allowance >= _order.amountPerTrade, "GelatoKrystsal: Insufficient allowance");

        // 4. Rate Check
        (uint256 idealReturn,) = oracleAggregator.getExpectedReturnAmount(
            _order.amountPerTrade,
            _order.inToken,
            _order.outToken
        );

        // check time (reverts if block.timestamp is below execTime)
        // solhint-disable-next-line not-rely-on-time
        uint256 timeSinceCanExec = block.timestamp.sub(_order.lastExecutionTime.add(_order.delay));
        uint256 slippage;
        if (_order.minSlippage > timeSinceCanExec) {
            slippage = _order.minSlippage.sub(timeSinceCanExec);
        }

        if (_order.maxSlippage > slippage) {
            slippage = _order.maxSlippage;
        }

        uint256 minReturn = idealReturn.sub(idealReturn.mul(slippage).div(10000));
        (uint256 actualReturn,) = smartWalletSwap.getExpectedReturnKyber(
            IERC20(_order.inToken),
            IERC20(_order.outToken),
            _order.amountPerTrade,
            PLATFORM_FEE_BPS,
            _HINT
        );

        require(minReturn < actualReturn, "GelatoKrystsal: Time passed but expected return too low");

        require(executorModule == _msgSender(), "GelatoKrystal: Caller is not the executorModule");

        return "OK";
    }

    function _canExec(
        Order memory _order,
        address _user,
        uint256 _id
    )
        private
        view
    {
        require(taskHash[_user][_id] != bytes32(0), "GelatoKrystal: task not submitted");
        require(taskHash[_user][_id] != EXECUTED, "GelatoKrystal: task already executed");
        bytes32 hashed = hashTask(_order, _user, _id);
        require(isTaskSubmitted(hashed, _user, _id), "GelatoKrystal: incorrect task parameters");
        require(_order.gasPriceCeil == 0 || _order.gasPriceCeil >= fetchCurrentGasPrice(), "GelatoKrystal: gas price too high");
    }

    function _updateAndSubmitTask(
        Order memory _order,
        address _user,
        uint256 _id        
    ) 
        private
    {
        // update remaining allowance needed
        uint256 prevTotal = totalToSpend[_user][_order.inToken];
        totalToSpend[_user][_order.inToken] = prevTotal.sub(_order.amountPerTrade);

        // update task to executed
        taskHash[_user][_id] = EXECUTED;

        // update next order
        _order.nTradesLeft = _order.nTradesLeft.sub(1);
        _order.lastExecutionTime = block.timestamp;
        taskId = taskId.add(1);

        // submit task
        bytes32 hashed = hashTask(_order, _user, taskId);
        require(taskHash[_user][taskId] == bytes32(0));
        taskHash[_user][taskId] = hashed;

        emit LogTaskSubmitted(taskId, _user, _order);
    }

    function isTaskSubmitted(
        bytes32 _taskHash,
        address _user,
        uint256 _id
    )
        public
        view
        returns(bool)
    {
        return (taskHash[_user][_id] == _taskHash);
    }

    function hashTask(Order memory _order, address _sender, uint256 _taskId) public pure returns(bytes32) {
        return keccak256(abi.encode(_order, _sender, _taskId));
    }

    function currentTaskId() public view returns (uint256) {
        return taskId;
    }

    function fetchCurrentGasPrice() public view returns (uint256) {
        return uint256(gasPriceOracle.latestAnswer());
    }

    function allowanceDelta(address _user, IERC20 _token)
        public
        view
        returns(uint256 delta, bool isLiquid)
    {
        uint256 upcoming = totalToSpend[_user][address(_token)];
        uint256 allowance = _token.allowance(_user, address(this));
        if (allowance >= upcoming) {
            isLiquid = true;
            delta = allowance.sub(upcoming);
        } else {
            delta = upcoming.sub(allowance);
        }
    }

    // ############# Mgmt #############
    function reAssignExecutorModule(
        address _executorModule
    ) external onlyOwner {
        executorModule = _executorModule;
    }

    function reAssignPlatforWallet (
        address payable _platformWallet
    ) external payable onlyOwner {
        platformWallet = _platformWallet;
    }

    // ############# Fallback #############
    // solhint-disable-next-line no-empty-blocks
    receive() external payable {}
}