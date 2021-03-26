// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.0;

import "../burnHelper/IBurnGasHelper.sol";
import "../interfaces/krystal/IKyberProxy.sol";
import "../interfaces/krystal/IGasToken.sol";
import "../interfaces/krystal/ISmartWalletLending.sol";
import {
    IERC20
} from "../vendor/openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Utils} from "../vendor/kyber/utils/Utils.sol";
import {Withdrawable} from "../vendor/kyber/utils/Withdrawable.sol";
import {
    ReentrancyGuard
} from "../vendor/openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {
    IUniswapV2Router02
} from "../interfaces/uniswap/IUniswapV2Router02.sol";

// solhint-disable max-states-count
// solhint-disable private-vars-leading-underscore
contract SmartWalletSwapStorage is Utils, Withdrawable, ReentrancyGuard {
    uint256 internal constant MAX_AMOUNT = type(uint256).max;

    mapping(address => mapping(IERC20 => uint256)) public platformWalletFees;
    // Proxy and routers will be set only once in constructor
    IKyberProxy public kyberProxy;
    // check if a router (Uniswap or its clones) is supported
    mapping(IUniswapV2Router02 => bool) public isRouterSupported;

    IBurnGasHelper public burnGasHelper;
    mapping(address => bool) public supportedPlatformWallets;

    struct TradeInput {
        uint256 srcAmount;
        uint256 minData; // min rate if Kyber, min return if Uni-pools
        address payable recipient;
        uint256 platformFeeBps;
        address payable platformWallet;
        bytes hint;
    }

    ISmartWalletLending public lendingImpl;

    // bytes32(uint256(keccak256("SmartWalletSwapImplementation")) - 1)
    // solhint-disable max-line-length
    bytes32 internal constant IMPLEMENTATION =
        0x6a7efb0627ddb0e69b773958c7c9c3c9c3dc049819cdf56a8ee84c3074b2a5d7;

    // solhint-disable no-empty-blocks
    constructor(address _admin) Withdrawable(_admin) {}
}
