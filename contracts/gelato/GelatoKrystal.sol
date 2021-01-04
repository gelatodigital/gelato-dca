// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.6.10;

import {
    GelatoStatefulConditionsStandard
} from "@gelatonetwork/core/contracts/gelato_conditions/GelatoStatefulConditionsStandard.sol";
import {SafeMath} from "@gelatonetwork/core/contracts/external/SafeMath.sol";
import {ISmartWalletSwapImplementation} from "../interfaces/ISmartWalletSwapImplementation.sol";
import {
    IGelatoProviderModule
} from "@gelatonetwork/core/contracts/gelato_provider_modules/IGelatoProviderModule.sol";
import { 
    IGelatoCore, 
    Provider,
    Condition,
    Operation,
    DataFlow,
    Action,
    Task
} from "@gelatonetwork/core/contracts/gelato_core/interfaces/IGelatoCore.sol";
import {IERC20} from "@gelatonetwork/core/contracts/external/IERC20.sol";
import {OracleAggregator} from "./OracleAggregator.sol";

contract GelatoKrystal is GelatoStatefulConditionsStandard, IGelatoProviderModule {

    using SafeMath for uint256;

    // user => taskReceiptId => refTime
    mapping(address => mapping(uint256 => uint256)) public refTime;
    // user => token => totalToSpend
    mapping(address => mapping(address => uint256)) public totalToSpend;

    address internal constant _ETH_ADDRESS = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    OracleAggregator public immutable oracleAggregator;
    ISmartWalletSwapImplementation public immutable smartWalletSwap;
    address public immutable wethAddress;

    constructor(
        IGelatoCore _gelatoCore, 
        OracleAggregator _oracleAggregator, 
        ISmartWalletSwapImplementation _smartWalletSwap, 
        address _wethAddress
    )
        public
        GelatoStatefulConditionsStandard(_gelatoCore)
    {
        oracleAggregator = _oracleAggregator;
        smartWalletSwap = _smartWalletSwap;
        wethAddress = _wethAddress;
    }

    // solhint-disable-next-line function-max-lines
    function submitDCAKyber(
        address _inToken,
        address _outToken,
        uint256 _amountPerTrade,
        uint256 _nTrades,
        uint256 _slippage,
        uint256 _delay,
        uint256 _timeout,
        uint256 _gasLimit,
        uint256 _gasPriceCeil
    ) external payable {
        address memory _user = msg.sender;
        Provider memory provider =
            Provider({addr: address(this), module: address(this)});
        Condition memory condition =
            Condition({
                inst: address(this),
                data: getConditionData(_user, _inToken, _outToken, _amountPerTrade, _slippage)
            });
        Action memory transferFrom =
            Action({
                addr: _inToken,
                data: abi.encodeWithSelector(
                    IERC20(_inToken).transferFrom.selector, 
                    _user, 
                    _amountPerTrade
                ),
                operation: Operation.Call,
                dataFlow: DataFlow.None,
                value: 0,
                termsOkCheck: false
            });
        Action memory approve =
            Action({
                addr: _inToken,
                data: abi.encodeWithSelector(
                    IERC20(_inToken).approve.selector, 
                    address(smartWalletSwap), 
                    _amountPerTrade
                ),
                operation: Operation.Call,
                dataFlow: DataFlow.None,
                value: 0,
                termsOkCheck: false
            });
        Action memory swap =
            Action({
                addr: address(this),
                data: abi.encodeWithSelector(
                    this.doSwapKyberAction.selector, 
                    _inToken, 
                    _outToken, 
                    _amountPerTrade, 
                    _user, 
                    _delay
                ),
                operation: Operation.Call,
                dataFlow: DataFlow.None,
                value: 0,
                termsOkCheck: false
            });

        Action[] memory actions = new Action[](4);
        actions[0] = transferFrom;
        actions[1] = approve;
        actions[2] = swap;
        Condition[] memory conditions = new Condition[](1);
        conditions[0] = condition;

        Task memory task =
            Task({
                conditions: conditions,
                actions: actions,
                selfProviderGasLimit: _gasLimit,
                selfProviderGasPriceCeil: _gasPriceCeil
            });

        Task[] memory tasks = new Task[](1);
        tasks[0] = task;
        refTime[_user][_getIdOfNextTaskInCycle()] = 0; // submit next task asap
        uint256 previousUpcoming = totalToSpend[_user][_inToken];
        totalToSpend[_user][_inToken] = previousUpcoming.add(_amountPerTrade.mul(_nTrades));
        try
            gelatoCore.submitTaskCycle(provider, [task], _timeout, _nTrades)
        {} catch Error(string memory error) {
            revert(
                string(
                    abi.encodePacked(
                        "GelatoKrystal.submitDCAKyber.submitTaskCycle:",
                        error
                    )
                )
            );
        } catch {
            revert("GelatoKrystal.submitDCAKyber.submitTaskCycle:undefined");
        }
    }

    function execPayload(uint256, address, address, Task calldata _task, uint256)
        external
        view
        override
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

    // STANDARD interface
    /// @param _conditionData The encoded data from getConditionData()
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
        if (_refTime <= block.timestamp) {
            address oracleOutputToken = outputToken;
            if (oracleOutputToken == wethAddress) {
                oracleOutputToken = _ETH_ADDRESS;
            }
            (uint256 idealReturn,) = oracleAggregator.getExpectedReturnAmount(
                _amountPerTrade, 
                _inputToken, 
                _outputToken
            );
            uint256 minReturn = idealReturn.mul(_slippage).div(10000);
            (uint256 actualReturn,) = smartWalletSwap.getExpectedReturnKyber(
                inputToken, 
                outputToken, 
                amountPerTrade, 
                8, 
                bytes(0)
            );
            if (minReturn <= actualReturn) {
                return OK;
            } else {
                return "NotOkExpectedReturnTooLow";
            }
        } else {
            return "NotOkTimestampDidNotPass";
        }
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

        return ;
    }

    function multiProvide(
        address _executor,
        IGelatoProviderModule[] memory _modules
    ) external payable {
        try
            IGelatoProviders(gelatoCore).multiProvide{value: msg.value}(
                _executor,
                new TaskSpec[](0),
                _modules
            )
        // solhint-disable-next-line no-empty-blocks
        {} catch Error(string memory error) {
            revert(
                string(
                    abi.encodePacked("GelatoKrystal.multiProvide:", error)
                )
            );
        } catch {
            revert("GelatoKrystal.multiProvide:undefined");
        }
    }

    function provideFunds() public payable {
        try
            IGelatoProviders(gelatoCore).provideFunds{value: msg.value}(
                address(this)
            )
        // solhint-disable-next-line no-empty-blocks
        {} catch Error(string memory error) {
            revert(
                string(
                    abi.encodePacked("GelatoKrystal.provideFunds:", error)
                )
            );
        } catch {
            revert("GelatoKrystal.provideFunds:undefined");
        }
    }

    function doSwapKyberAction(
        address _inToken, 
        address _outToken, 
        uint256 _amountPerTrade, 
        address _user, 
        uint256 _delay
    ) external {
        smartWalletSwap.swapKyber(
            _inToken, 
            _outToken, 
            _amountPerTrade, 
            0, 
            _user, 
            8, 
            _user, 
            bytes(0), 
            false
        );
        uint256 previousUpcoming = totalToSpend[_user][_inToken];
        totalToSpend[_user][_inToken] =  previousUpcoming.sub(_amountPerTrade);
        setRefTime(_delay, _user);
    }

    function setRefTime(uint256 _timeDelta, address _user) external {
        // solhint-disable-next-line not-rely-on-time
        uint256 currentTime = block.timestamp;
        uint256 newRefTime = currentTime + _timeDelta;
        refTime[_user][_getIdOfNextTaskInCycle()] = newRefTime;
    }
}