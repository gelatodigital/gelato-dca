// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.0;

import {
    ISmartWalletSwapImplementation
} from "./interfaces/krystal/ISmartWalletSwapImplementation.sol";
import {wdiv} from "./vendor/DSMath.sol";
import {
    IERC20,
    SafeERC20
} from "./vendor/openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import {
    ReentrancyGuard
} from "./vendor/openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Utils} from "./vendor/kyber/utils/Utils.sol";
import {IKyberProxy} from "./vendor/kyber/utils/IKyberProxy.sol";
import {
    IChainlinkOracle
} from "./interfaces/chainlink/IChainlinkOracle.sol";
import {IOracleAggregator} from "./interfaces/gelato/IOracleAggregator.sol";
import {ITaskStorage} from "./interfaces/gelato/ITaskStorage.sol";
import {
    IUniswapV2Router02
} from "./interfaces/uniswap/IUniswapV2Router02.sol";
import {_to18Decimals} from "./gelato/functions/FToken.sol";
import {SimpleServiceStandard} from "./gelato/standards/SimpleServiceStandard.sol";
import {_transferEthOrToken} from "./gelato/functions/FPayment.sol";
import {ETH} from "./gelato/constants/CTokens.sol";
import {Fee} from "./gelato/structs/SGelato.sol";
import {IGelato} from "./interfaces/gelato/IGelato.sol";

contract GelatoKrystal is SimpleServiceStandard, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct SubmitOrder {
        address inToken;
        address outToken;
        uint256 amountPerTrade;
        uint256 numTrades;
        uint256 minSlippage;
        uint256 maxSlippage;
        uint256 delay;
        address platformWallet;
        uint256 platformFeeBps;
    }

    struct ExecOrder {
        address user;
        address inToken;
        address outToken;
        uint256 amountPerTrade;
        uint256 nTradesLeft;
        uint256 minSlippage;
        uint256 maxSlippage;
        uint256 delay;
        uint256 lastExecutionTime;
        address platformWallet;
        uint256 platformFeeBps;
    }

    enum Dex {KYBER, UNISWAP, SUSHISWAP}

    bytes public constant HINT = "";
    uint256 public constant TOTAL_BPS = 10000;

    ISmartWalletSwapImplementation public immutable smartWalletSwap;
    IUniswapV2Router02 public immutable uniRouterV2;
    IUniswapV2Router02 public immutable sushiRouterV2;

    event LogTaskSubmitted(uint256 indexed id, ExecOrder order);
    event LogTaskCancelled(uint256 indexed id, ExecOrder order);
    event LogTaskUpdated(uint256 indexed id, ExecOrder order);
    event LogKrystalTrade(
        uint256 indexed id,
        ExecOrder order,
        uint256 amountOut
    );

    constructor(
        ISmartWalletSwapImplementation _smartWalletSwap,
        IUniswapV2Router02 _uniRouterV2,
        IUniswapV2Router02 _sushiRouterV2,
        address _gelato
    ) SimpleServiceStandard(_gelato) {
        smartWalletSwap = _smartWalletSwap;
        uniRouterV2 = _uniRouterV2;
        sushiRouterV2 = _sushiRouterV2;
    }

    function submit(SubmitOrder memory _order, bool isSubmitAndExec)
        public
        payable
    {
        if (_order.inToken == ETH) {
            uint256 value =
                isSubmitAndExec
                    ? _order.amountPerTrade * (_order.numTrades + 1)
                    : _order.amountPerTrade * _order.numTrades;
            require(
                msg.value == value,
                "GelatoDCA.submit: mismatching amount of ETH deposited"
            );
        }
        ExecOrder memory order =
            ExecOrder({
                user: msg.sender,
                inToken: _order.inToken,
                outToken: _order.outToken,
                amountPerTrade: _order.amountPerTrade,
                nTradesLeft: _order.numTrades,
                minSlippage: _order.minSlippage,
                maxSlippage: _order.maxSlippage,
                delay: _order.delay, // solhint-disable-next-line not-rely-on-time
                lastExecutionTime: block.timestamp,
                platformWallet: _order.platformWallet,
                platformFeeBps: _order.platformFeeBps
            });

        // store order
        _storeOrder(order);
    }

    // solhint-disable-next-line function-max-lines
    function submitAndExec(
        SubmitOrder memory _order,
        Dex _protocol,
        uint256 _minReturnOrRate,
        address[] calldata _tradePath
    ) external payable {
        require(
            _order.numTrades > 1,
            "GelatoDCA.submitAndExec: cycle must have 2 or more trades"
        );

        // 1. Submit future orders
        _order.numTrades = _order.numTrades - 1;
        submit(_order, true);

        // 2. Exec 1st Trade now
        uint256 ethToSend;
        if (_order.inToken == ETH) {
            ethToSend = _order.amountPerTrade;
        } else {
            IERC20(_order.inToken).safeTransferFrom(
                msg.sender,
                address(this),
                _order.amountPerTrade
            );
            IERC20(_order.inToken).safeIncreaseAllowance(
                address(smartWalletSwap),
                _order.amountPerTrade
            );
        }

        if (_protocol == Dex.KYBER) {
            _doKyberTrade(
                _order.inToken,
                _order.outToken,
                _order.amountPerTrade,
                _minReturnOrRate,
                payable(msg.sender),
                ethToSend,
                _order.platformWallet,
                _order.platformFeeBps
            );
        } else {
            _doUniTrade(
                _protocol == Dex.UNISWAP ? uniRouterV2 : sushiRouterV2,
                _tradePath,
                _order.amountPerTrade,
                _minReturnOrRate,
                payable(msg.sender),
                ethToSend,
                _order.platformWallet,
                _order.platformFeeBps
            );
        }
    }

    function cancel(ExecOrder calldata _order, uint256 _id)
        external
        nonReentrant
    {
        _removeTask(abi.encode(_order), _id, msg.sender);
        if (_order.inToken == ETH) {
            uint256 refundAmount = _order.amountPerTrade * _order.nTradesLeft;
            (bool success, ) = _order.user.call{value: refundAmount}("");
            require(success, "GelatoKrystal.cancel: refund reverted");
        }

        emit LogTaskCancelled(_id, _order);
    }

    // solhint-disable-next-line function-max-lines
    function editNumTrades(
        ExecOrder calldata _order,
        uint256 _id,
        uint256 _newNumTradesLeft
    ) external payable nonReentrant {
        require(
            _order.nTradesLeft != _newNumTradesLeft,
            "GelatoKrystal.editNumTrades: order does not need update"
        );
        require(_newNumTradesLeft > 0, "GelatoDCA.editNumTrades: cannot be 0");
        ExecOrder memory newOrder =
            ExecOrder({
                user: _order.user,
                inToken: _order.inToken,
                outToken: _order.outToken,
                amountPerTrade: _order.amountPerTrade,
                nTradesLeft: _newNumTradesLeft, // the only updateable field for now
                minSlippage: _order.minSlippage,
                maxSlippage: _order.maxSlippage,
                delay: _order.delay,
                lastExecutionTime: _order.lastExecutionTime,
                platformWallet: _order.platformWallet,
                platformFeeBps: _order.platformFeeBps
            });
        _updateTask(abi.encode(_order), abi.encode(newOrder), _id, msg.sender);
        if (_order.inToken == ETH) {
            if (_order.nTradesLeft > _newNumTradesLeft) {
                uint256 refundAmount =
                    _order.amountPerTrade *
                        (_order.nTradesLeft - _newNumTradesLeft);

                (bool success, ) = _order.user.call{value: refundAmount}("");
                require(
                    success,
                    "GelatoKrystal.editNumTrades: revert on transfer"
                );
            } else {
                uint256 topUpAmount =
                    _order.amountPerTrade *
                        (_newNumTradesLeft - _order.nTradesLeft);

                require(
                    topUpAmount == msg.value,
                    "GelatoKrystal.editNumTrades: mismatching amount of ETH deposited"
                );
            }
        }

        emit LogTaskUpdated(_id, newOrder);
    }

    // solhint-disable-next-line function-max-lines
    function exec(
        ExecOrder calldata _order,
        uint256 _id,
        Dex _protocol,
        Fee memory _fee,
        address[] calldata _tradePath
    )
        external
        gelatofy(
            _fee.isOutToken ? _order.outToken : _order.inToken,
            _order.user,
            abi.encode(_order),
            _id,
            _fee.amount,
            _fee.swapRate
        )
    {
        // task cycle logic
        if (_order.nTradesLeft > 1) {
            _updateAndSubmitNextTask(_order, _id);
        } else {
            _removeTask(abi.encode(_order), _id, _order.user);
        }

        // action exec
        uint256 amountOut;
        if (_protocol == Dex.KYBER) {
            amountOut = _actionKyber(_order, _fee.amount, _fee.isOutToken);
        } else {
            amountOut = _actionUniOrSushi(
                _order,
                _protocol,
                _tradePath,
                _fee.amount,
                _fee.isOutToken
            );
        }

        if (_fee.isOutToken) {
            _transferEthOrToken(
                payable(_order.user),
                _order.outToken,
                amountOut
            );
        }

        emit LogKrystalTrade(_id, _order, amountOut);
    }

    function isTaskSubmitted(ExecOrder calldata _order, uint256 _id)
        external
        view
        returns (bool)
    {
        return verifyTask(abi.encode(_order), _id, _order.user);
    }

    function getMinReturn(ExecOrder memory _order)
        public
        view
        returns (uint256 minReturn)
    {
        // Rate Check
        (uint256 idealReturn, ) =
            IOracleAggregator(IGelato(gelato).getOracleAggregator())
                .getExpectedReturnAmount(
                _order.amountPerTrade,
                _order.inToken,
                _order.outToken
            );

        require(
            idealReturn > 0,
            "GelatoKrystal.getMinReturn: idealReturn cannot be 0"
        );

        // check time (reverts if block.timestamp is below execTime)
        uint256 timeSinceCanExec =
            // solhint-disable-next-line not-rely-on-time
            block.timestamp - (_order.lastExecutionTime + _order.delay);

        uint256 minSlippageFactor = TOTAL_BPS - _order.minSlippage;
        uint256 maxSlippageFactor = TOTAL_BPS - _order.maxSlippage;
        uint256 slippage;
        if (minSlippageFactor > timeSinceCanExec) {
            slippage = minSlippageFactor - timeSinceCanExec;
        }

        if (maxSlippageFactor > slippage) {
            slippage = maxSlippageFactor;
        }

        minReturn = (idealReturn * slippage) / TOTAL_BPS;
    }

    function isSwapPossible(address _inToken, address _outToken)
        external
        view
        returns (bool isPossible)
    {
        (uint256 idealReturn, ) =
            IOracleAggregator(IGelato(gelato).getOracleAggregator())
                .getExpectedReturnAmount(1e18, _inToken, _outToken);
        isPossible = idealReturn == 0 ? false : true;
    }

    // ############# PRIVATE #############
    function _actionKyber(
        ExecOrder memory _order,
        uint256 _fee,
        bool _outTokenFee
    ) private returns (uint256 received) {
        (
            uint256 ethToSend,
            uint256 sellAmount,
            uint256 minReturn,
            address payable receiver
        ) = _preExec(_order, _fee, _outTokenFee);

        received = _doKyberTrade(
            _order.inToken,
            _order.outToken,
            sellAmount,
            _getKyberRate(
                sellAmount,
                minReturn,
                _order.inToken,
                _order.outToken
            ),
            receiver,
            ethToSend,
            _order.platformWallet,
            _order.platformFeeBps
        );

        if (_outTokenFee) {
            received = received - _fee;
        }
    }

    function _doKyberTrade(
        address inToken,
        address outToken,
        uint256 sellAmount,
        uint256 minRate,
        address payable receiver,
        uint256 ethToSend,
        address _platformWallet,
        uint256 _platformFeeBps
    ) private returns (uint256 received) {
        received = smartWalletSwap.swapKyber{value: ethToSend}(
            IERC20(inToken),
            IERC20(outToken),
            sellAmount,
            minRate,
            receiver,
            _platformFeeBps,
            payable(_platformWallet),
            HINT,
            false
        );
    }

    function _actionUniOrSushi(
        ExecOrder memory _order,
        Dex _protocol,
        address[] memory _tradePath,
        uint256 _fee,
        bool _outTokenFee
    ) private returns (uint256 received) {
        (
            uint256 ethToSend,
            uint256 sellAmount,
            uint256 minReturn,
            address payable receiver
        ) = _preExec(_order, _fee, _outTokenFee);

        require(
            _order.inToken == _tradePath[0] &&
                _order.outToken == _tradePath[_tradePath.length - 1],
            "GelatoDCA.action: trade path does not match order."
        );

        received = _doUniTrade(
            _order,
            _protocol,
            _tradePath,
            sellAmount,
            minReturn,
            receiver,
            ethToSend
        );

        if (_outTokenFee) {
            received = received - _fee;
        }
    }

    function _doUniTrade(
        ExecOrder memory _order,
        Dex _protocol,
        address[] memory _tradePath,
        uint256 sellAmount,
        uint256 minReturn,
        address payable receiver,
        uint256 ethToSend
    ) private returns (uint256 received) {
        received = _doUniTrade(
            _protocol == Dex.UNISWAP ? uniRouterV2 : sushiRouterV2,
            _tradePath,
            sellAmount,
            minReturn,
            receiver,
            ethToSend,
            _order.platformWallet,
            _order.platformFeeBps
        );
    }

    function _doUniTrade(
        IUniswapV2Router02 router,
        address[] memory tradePath,
        uint256 sellAmount,
        uint256 minReturn,
        address payable receiver,
        uint256 ethToSend,
        address _platformWallet,
        uint256 _platformFeeBps
    ) private returns (uint256 received) {
        received = smartWalletSwap.swapUniswap{value: ethToSend}(
            router,
            sellAmount,
            minReturn,
            tradePath,
            receiver,
            _platformFeeBps,
            payable(_platformWallet),
            false,
            false
        );
    }

    function _preExec(
        ExecOrder memory _order,
        uint256 _fee,
        bool _outTokenFee
    )
        private
        returns (
            uint256 ethToSend,
            uint256 sellAmount,
            uint256 minReturn,
            address payable receiver
        )
    {
        if (_outTokenFee) {
            receiver = payable(this);
            minReturn = getMinReturn(_order) + _fee;
            sellAmount = _order.amountPerTrade;
        } else {
            receiver = payable(_order.user);
            minReturn = getMinReturn(_order);
            sellAmount = _order.amountPerTrade - _fee;
        }

        if (_order.inToken != ETH) {
            IERC20(_order.inToken).safeTransferFrom(
                _order.user,
                address(this),
                _order.amountPerTrade
            );
            IERC20(_order.inToken).safeIncreaseAllowance(
                address(smartWalletSwap),
                sellAmount
            );
        } else {
            ethToSend = sellAmount;
        }
    }

    function _updateAndSubmitNextTask(ExecOrder memory _order, uint256 _id)
        private
    {
        bytes memory lastOrder = abi.encode(_order);
        // update next order
        _order.nTradesLeft = _order.nTradesLeft - 1;
        // solhint-disable-next-line not-rely-on-time
        _order.lastExecutionTime = block.timestamp;

        _updateTask(lastOrder, abi.encode(_order), _id, _order.user);
        emit LogTaskSubmitted(_id, _order);
    }

    function _storeOrder(ExecOrder memory _order) private {
        uint256 id = _storeTask(abi.encode(_order), _order.user);
        emit LogTaskSubmitted(id, _order);
    }

    function _getKyberRate(
        uint256 _amountIn,
        uint256 _minReturn,
        address _inToken,
        address _outToken
    ) private view returns (uint256) {
        uint256 newAmountIn =
            _to18Decimals(
                _inToken,
                _amountIn,
                "GelatoKrystal:_getKyberRate: newAmountIn revert"
            );
        uint256 newMinReturn =
            _to18Decimals(
                _outToken,
                _minReturn,
                "GelatoKrystal:_getKyberRate: newMinReturn revert"
            );
        return wdiv(newMinReturn, newAmountIn);
    }
}
