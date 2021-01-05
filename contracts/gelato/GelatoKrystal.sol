// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.0;
pragma experimental ABIEncoderV2;

import {
    GelatoStatefulConditionsStandard
} from "./GelatoStatefulConditionsStandard.sol";
import {
    IGelatoCore,
    Provider,
    Condition,
    Operation,
    DataFlow,
    Action,
    Task,
    TaskSpec
} from "./interfaces/IGelatoCore.sol";
import {IERC20, SafeERC20, SafeMath} from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IOracleAggregator} from "./interfaces/IOracleAggregator.sol";
import {ISmartWalletSwapImplementation} from "./interfaces/ISmartWalletSwapImplementation.sol";

import "hardhat/console.sol";


contract GelatoKrystal is GelatoStatefulConditionsStandard, Ownable {

    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    // user => taskReceiptId => refTime
    mapping(address => mapping(uint256 => uint256)) public refTime;
    // user => token => totalToSpend
    mapping(address => mapping(address => uint256)) public totalToSpend;

    address internal constant _ETH_ADDRESS = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
    bytes internal constant _HINT = "";

    uint256 public constant PLATFORM_FEE_BPS = 8;

    IOracleAggregator public immutable oracleAggregator;
    ISmartWalletSwapImplementation public immutable smartWalletSwap;
    address public immutable wethAddress;
    address payable public platformWallet;

    struct OrderInputs {
        address _inToken;
        address _outToken;
        uint256 _amountPerTrade;
        uint256 _nTrades;
        uint256 _slippage;
        uint256 _delay;
        uint256 _gasPriceCeil;
    }

    constructor(
        IGelatoCore _gelatoCore,
        IOracleAggregator _oracleAggregator,
        ISmartWalletSwapImplementation _smartWalletSwap,
        address _wethAddress,
        address _executor,
        address payable _platformWallet
    )
        GelatoStatefulConditionsStandard(_gelatoCore)
        payable
    {
        oracleAggregator = _oracleAggregator;
        smartWalletSwap = _smartWalletSwap;
        wethAddress = _wethAddress;
        platformWallet = _platformWallet;

        // One time Gelato Setup
        IGelatoCore(_gelatoCore).providerAssignsExecutor(_executor);
        address[] memory providerModules = new address[](1);
        providerModules[0] = address(this);
        IGelatoCore(_gelatoCore).addProviderModules(providerModules);
        IGelatoCore(_gelatoCore).provideFunds{value: msg.value}(address(this));
    }

    function submitDCAKyber(
        OrderInputs calldata _orderInputs
    )
        external
        payable
    {

        // Update State Vars
        _setRefTime(_orderInputs._delay, msg.sender);

        uint256 previousUpcoming = totalToSpend[msg.sender][_orderInputs._inToken];

        totalToSpend[msg.sender][_orderInputs._inToken] =
            previousUpcoming.add(_orderInputs._amountPerTrade).mul(_orderInputs._nTrades);

        // Submit Task Cycle to Gelato
        Provider memory provider =
            Provider({addr: address(this), module: address(this)});

        Task[] memory tasks = _getGelatoTasks(
            _orderInputs._inToken,
            _orderInputs._outToken,
            _orderInputs._amountPerTrade,
            _orderInputs._slippage,
            _orderInputs._delay,
            _orderInputs._gasPriceCeil
        );

        gelatoCore.submitTaskCycle(provider, tasks, 0, _orderInputs._nTrades);

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

    function doSwapKyberAction(
        address _inToken,
        address _outToken,
        uint256 _amountPerTrade,
        address payable _user,
        uint256 _delay
    ) external {
        // Update Condition
        _setRefTime(_delay, _user);

        IERC20(_inToken).safeTransferFrom(_user, address(this), _amountPerTrade);
        IERC20(_inToken).safeApprove(address(smartWalletSwap), _amountPerTrade);
        smartWalletSwap.swapKyber(
            IERC20(_inToken),
            IERC20(_outToken),
            _amountPerTrade,
            0,
            _user,
            PLATFORM_FEE_BPS,
            platformWallet,
            _HINT,
            false
        );
        uint256 previousUpcoming = totalToSpend[_user][_inToken];
        totalToSpend[_user][_inToken] =  previousUpcoming.sub(_amountPerTrade);
    }

    // ############# View Methods #############

    // STANDARD interface
    /// @param _conditionData The encoded data from getConditionData()
    /// @dev Called by GelatoCore at execution time
    function ok(uint256 _taskReceiptId, bytes calldata _conditionData, uint256)
        public
        view
        virtual
        override
        returns(string memory)
    {
        (
            address user,
            address inputToken,
            address outputToken,
            uint256 amountPerTrade,
            uint256 slippage
        ) = abi.decode(_conditionData[36:], (address, address, address, uint256, uint256));
        return checkTimeAndReturn(
            _taskReceiptId,
            user,
            inputToken,
            outputToken,
            amountPerTrade,
            slippage
        );
    }

    /// @dev Called by GelatoCore at execution time
    function execPayload(uint256, address, address, Task calldata _task, uint256)
        external
        pure
        returns(bytes memory payload, bool)
    {
        return (_task.actions[0].data, false);
    }

    /// @dev use this function to encode the data off-chain for the condition data field
    function getConditionData(
        address _user,
        address _inputToken,
        address _outputToken,
        uint256 _amountPerTrade,
        uint256 _slippage
    )
        public
        pure
        virtual
        returns(bytes memory)
    {
        return abi.encodeWithSelector(
            this.checkTimeAndReturn.selector,
            uint256(0),
            _user,
            _inputToken,
            _outputToken,
            _amountPerTrade,
            _slippage
        );
    }

    // solhint-disable-next-line function-max-lines
    function _getGelatoTasks(
        address _inToken,
        address _outToken,
        uint256 _amountPerTrade,
        uint256 _slippage,
        uint256 _delay,
        uint256 _gasPriceCeil
    )
        private
        view
        returns(Task[] memory tasks)
    {
        Condition memory condition =
            Condition({
                inst: address(this),
                data: getConditionData(msg.sender, _inToken, _outToken, _amountPerTrade, _slippage)
            });
        Condition[] memory conditions = new Condition[](1);
        conditions[0] = condition;

        Action memory swap =
            Action({
                addr: address(this),
                data: abi.encodeWithSelector(
                    this.doSwapKyberAction.selector,
                    _inToken,
                    _outToken,
                    _amountPerTrade,
                    msg.sender,
                    _delay
                ),
                operation: Operation.Call,
                dataFlow: DataFlow.None,
                value: 0,
                termsOkCheck: false
            });
        Action[] memory actions = new Action[](1);
        actions[0] = swap;

        Task memory task =
            Task({
                conditions: conditions,
                actions: actions,
                selfProviderGasLimit: 3000000, // allowing all actions to consume 3M gas
                selfProviderGasPriceCeil: _gasPriceCeil
            });
        tasks = new Task[](1);
        tasks[0] = task;
    }

    // Specific Implementation
    /// @dev Abi encode these parameter inputs. Use a placeholder for _taskReceiptId.
    /// @param _taskReceiptId Will be stripped from encoded data and replaced by
    ///  the value passed in from GelatoCore.
    function checkTimeAndReturn(
        uint256 _taskReceiptId,
        address _user,
        address _inputToken,
        address _outputToken,
        uint256 _amountPerTrade,
        uint256 _slippage
    )
        public
        view
        virtual
        returns(string memory)
    {
        uint256 _refTime = refTime[_user][_taskReceiptId];
        // solhint-disable-next-line not-rely-on-time
        if (_refTime <= block.timestamp) {
            address oracleOutputToken = _outputToken;
            if (oracleOutputToken == wethAddress) {
                oracleOutputToken = _ETH_ADDRESS;
            }
            (uint256 idealReturn,) = oracleAggregator.getExpectedReturnAmount(
                _amountPerTrade,
                _inputToken,
                _outputToken
            );
            uint256 minReturn = idealReturn.sub(idealReturn.mul(_slippage).div(10000));
            (uint256 actualReturn,) = smartWalletSwap.getExpectedReturnKyber(
                IERC20(_inputToken),
                IERC20(_outputToken),
                _amountPerTrade,
                PLATFORM_FEE_BPS,
                _HINT
            );
            if (minReturn <= actualReturn) {
                return OK;
            } else {
                return "TimePassedButExpectedReturnTooLow";
            }
        } else {
            return "NotOkTimestampDidNotPass";
        }
    }

    // ############# Private Methods #############

    function _setRefTime(uint256 _timeDelta, address _user) private {
        // solhint-disable-next-line not-rely-on-time
        uint256 currentTime = block.timestamp;
        uint256 newRefTime = currentTime.add(_timeDelta);
        refTime[_user][_getIdOfNextTaskInCycle()] = newRefTime;
    }


    // ############# Mgt Methods #############

    function reAssignExecutor(
        address _executor
    ) external payable onlyOwner {
        IGelatoCore(gelatoCore).providerAssignsExecutor(_executor);
    }

    // Everyone can add funds
    function provideFunds() public payable {
        IGelatoCore(gelatoCore).provideFunds{value: msg.value}(address(this));
    }

    function unprovideFunds(uint256 _amount, address _dest) public payable onlyOwner {
        uint256 amount = IGelatoCore(gelatoCore).unprovideFunds(_amount);
        (bool success, ) = _dest.call{value: amount}("");
        require(success, "unprovideFunds:: Reverted");
    }

    function reAssignPlatforWallet (
        address payable _platformWallet
    ) external payable onlyOwner {
        platformWallet = _platformWallet;
    }

    // ############# Fallback #############
    receive() external payable {}
}
