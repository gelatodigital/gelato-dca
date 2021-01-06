// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.6.10;

import {Ownable} from "@gelatonetwork/core/contracts/external/Ownable.sol";
import {SafeMath} from "@gelatonetwork/core/contracts/external/SafeMath.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IGasPriceOracle} from "./interfaces/IGasPriceOracle.sol";

// solhint-disable max-states-count
contract OracleAggregator is Ownable {
    using SafeMath for uint256;
    // solhint-disable var-name-mixedcase
    address private constant _ETH_ADDRESS = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
    // solhint-disable var-name-mixedcase
    address private constant _USD_ADDRESS = 0x7354C81fbCb229187480c4f497F945C6A312d5C3;

    address public immutable wethAddress;

    mapping(address => mapping(address => address)) private _tokenPairAddress;
    mapping(address => uint256) private _nrOfDecimalsUSD;

    // solhint-disable function-max-lines
    constructor(
        address _weth,
        address[] memory _tokensA, 
        address[] memory _tokensB, 
        address[] memory _oracles, 
        address[] memory _stablecoins, 
        uint256[] memory _decimals
    ) public {
        wethAddress = _weth;
        addTokens(_tokensA, _tokensB, _oracles);
        addStablecoins(_stablecoins, _decimals);
    }

    function addTokens (
        address[] memory _tokensA,
        address[] memory _tokensB,
        address[] memory _oracles
    ) public onlyOwner {
        require(_tokensA.length == _tokensB.length && _tokensA.length == _oracles.length);
        for (uint256 i = 0; i < _tokensA.length; i++) {
            _tokenPairAddress[_tokensA[i]][_tokensB[i]] = _oracles[i];
        }
    }

    function addStablecoins (
        address[] memory _stablecoins,
        uint256[] memory _decimals
    ) public onlyOwner {
        require(_stablecoins.length == _decimals.length);
        for (uint256 i = 0; i < _stablecoins.length; i++) {
            _nrOfDecimalsUSD[_stablecoins[i]] = _decimals[i];
        }
    }

    // solhint-disable function-max-lines
    // solhint-disable code-complexity
    /// @dev Get expected return amount for tokenA / tokenB
    function getExpectedReturnAmount(
        uint256 amount,
        address tokenAddressA,
        address tokenAddressB
    ) public view returns (uint256 returnAmount, uint256 decimals) {
        require(amount > 0, "OracleAggregator: Amount is Zero");
        require(
            tokenAddressA != address(0),
            "OracleAggregator: tokenAddressA is Zero"
        );
        require(
            tokenAddressB != address(0),
            "OracleAggregator: tokenAddressB is Zero"
        );
        if (tokenAddressA == wethAddress) {
            tokenAddressA = _ETH_ADDRESS;
        }
        if (tokenAddressB == wethAddress) {
            tokenAddressB = _ETH_ADDRESS;
        }

        uint256 nrOfDecimalsIn;
        if (tokenAddressA != _ETH_ADDRESS && tokenAddressA != _USD_ADDRESS) {
            try ERC20(tokenAddressA).decimals() returns (uint8 _inputDecimals) {
                nrOfDecimalsIn = uint256(_inputDecimals);
            } catch {
                revert("OracleAggregator: ERC20.decimals() revert");
            }
        } else {
            if (tokenAddressA != _ETH_ADDRESS) {
                nrOfDecimalsIn = _nrOfDecimalsUSD[_USD_ADDRESS];
            } else {
                nrOfDecimalsIn = 18;
            }
        }

        address stableCoinAddress =
            _nrOfDecimalsUSD[tokenAddressB] > 0 ? tokenAddressB : address(0);

        (tokenAddressA, tokenAddressB) = _convertUSD(
            tokenAddressA,
            tokenAddressB
        );

        // when token_b is ETH or USD
        if (tokenAddressB == _ETH_ADDRESS || tokenAddressB == _USD_ADDRESS) {
            // oracle of token_a / token_b exists
            // e.g. calculating KNC/ETH
            // KNC/ETH oracle available
            if (_tokenPairAddress[tokenAddressA][tokenAddressB] != address(0)) {
                (uint256 returnRateA, uint256 nrOfDecimals) =
                    _getRate(tokenAddressA, tokenAddressB);

                returnAmount = stableCoinAddress != address(0)
                    ? _matchStableCoinDecimal(
                        stableCoinAddress,
                        amount,
                        nrOfDecimals,
                        0,
                        returnRateA,
                        1
                    )
                    : amount.mul(returnRateA);

                return (returnAmount.div(10**nrOfDecimalsIn), nrOfDecimalsIn);
            } else {
                // oracle of token_a / token_b does not exist
                // e.g. calculating UNI/USD
                // UNI/ETH and USD/ETH oracles available
                (address pairA, address pairB) =
                    _checkAvailablePair(tokenAddressA, tokenAddressB);
                if (pairA == address(0) && pairB == address(0)) return (0, 0);

                (uint256 returnRateA, ) = _getRate(tokenAddressA, pairA);

                (uint256 returnRateB, uint256 nrOfDecimals) =
                    _getRate(tokenAddressB, pairB);

                nrOfDecimals = stableCoinAddress != address(0)
                    ? _nrOfDecimalsUSD[stableCoinAddress]
                    : nrOfDecimals;

                returnAmount = amount
                    .mul(returnRateA.mul(10**nrOfDecimals))
                    .div(returnRateB);
                if (tokenAddressB != _ETH_ADDRESS) {
                    return (
                        returnAmount.div(10**nrOfDecimalsIn),
                        nrOfDecimalsIn
                    );
                } else {
                    return (
                        returnAmount.div(10**_nrOfDecimalsUSD[_USD_ADDRESS]),
                        nrOfDecimalsIn
                    );
                }
            }
        } else {
            // when token_b is not ETH or USD
            (address pairA, address pairB) =
                _checkAvailablePair(tokenAddressA, tokenAddressB);

            if (pairA == address(0) && pairB == address(0)) return (0, 0);
            // oracle of token_a/ETH, token_b/ETH || token_a/USD, token_b/USD exists
            // e.g. calculating KNC/UNI where
            // KNC/ETH and UNI/ETH oracles available
            if (pairA == pairB) {
                (uint256 returnRateA, uint256 nrOfDecimals) =
                    _getRate(tokenAddressA, pairA);

                (uint256 returnRateB, ) = _getRate(tokenAddressB, pairB);

                returnAmount = amount
                    .mul(returnRateA.mul(10**nrOfDecimals))
                    .div(returnRateB);
                if (pairA == _ETH_ADDRESS) {
                    return (
                        returnAmount.div(10**nrOfDecimalsIn),
                        nrOfDecimalsIn
                    );
                } else {
                    return (
                        returnAmount.div(10**_nrOfDecimalsUSD[_USD_ADDRESS]),
                        nrOfDecimalsIn
                    );
                }
            } else if (pairA == _ETH_ADDRESS && pairB == _USD_ADDRESS) {
                // oracle of token_a/ETH and token_b/USD exists
                // e.g. calculating UNI/SXP where
                // UNI/ETH and SXP/USD oracles available
                {
                    (uint256 returnRateA, ) = _getRate(tokenAddressA, pairA);
                    (uint256 returnRate_ETHUSD, ) =
                        _getRate(_ETH_ADDRESS, _USD_ADDRESS);
                    (uint256 returnRateB, ) = _getRate(tokenAddressB, pairB);

                    returnAmount = amount
                        .mul(returnRateA.mul(returnRate_ETHUSD))
                        .div(returnRateB);
                }
                return (returnAmount.div(10**nrOfDecimalsIn), nrOfDecimalsIn);
            } else if (pairA == _USD_ADDRESS && pairB == _ETH_ADDRESS) {
                // oracle of token_a/USD and token_b/ETH exists
                // e.g. calculating SXP/UNI where
                // SXP/USD and UNI/ETH oracles available
                uint256 numerator;
                {
                    (uint256 returnRateA, uint256 nrOfDecimals) =
                        _getRate(tokenAddressA, pairA);

                    (uint256 returnRate_USDETH, uint256 nrOfDecimals_USDETH) =
                        _getRate(_USD_ADDRESS, _ETH_ADDRESS);

                    numerator = returnRate_USDETH
                        .mul(10**(nrOfDecimals_USDETH.sub(nrOfDecimals)))
                        .mul(returnRateA)
                        .div(10**nrOfDecimals_USDETH);
                }
                (uint256 returnRateB, ) = _getRate(tokenAddressB, pairB);
                returnAmount = amount.mul(numerator).div(returnRateB);
                return (returnAmount, nrOfDecimalsIn);
            }
        }
    }

    /// @dev check the available oracles for token a & b
    /// and choose which oracles to use
    function _checkAvailablePair(address tokenAddressA, address tokenAddressB)
        private
        view
        returns (address, address)
    {
        if (
            _tokenPairAddress[tokenAddressA][_USD_ADDRESS] != address(0) &&
            _tokenPairAddress[tokenAddressB][_USD_ADDRESS] != address(0)
        ) {
            return (_USD_ADDRESS, _USD_ADDRESS);
        } else if (
            _tokenPairAddress[tokenAddressA][_ETH_ADDRESS] != address(0) &&
            _tokenPairAddress[tokenAddressB][_ETH_ADDRESS] != address(0)
        ) {
            return (_ETH_ADDRESS, _ETH_ADDRESS);
        } else if (
            _tokenPairAddress[tokenAddressA][_ETH_ADDRESS] != address(0) &&
            _tokenPairAddress[tokenAddressB][_USD_ADDRESS] != address(0)
        ) {
            return (_ETH_ADDRESS, _USD_ADDRESS);
        } else if (
            _tokenPairAddress[tokenAddressA][_USD_ADDRESS] != address(0) &&
            _tokenPairAddress[tokenAddressB][_ETH_ADDRESS] != address(0)
        ) {
            return (_USD_ADDRESS, _ETH_ADDRESS);
        } else {
            return (address(0), address(0));
        }
    }

    function _getRate(address tokenAddressA, address tokenAddressB)
        private
        view
        returns (uint256 tokenPrice, uint256 nrOfDecimals)
    {
        if (tokenAddressA == tokenAddressB) {
            return (1, 0);
        } else {
            IGasPriceOracle priceFeed =
                IGasPriceOracle(
                    _tokenPairAddress[tokenAddressA][tokenAddressB]
                );
            tokenPrice = uint256(priceFeed.latestAnswer());
            nrOfDecimals = priceFeed.decimals();
        }
    }

    /// @dev converting all usd pegged stablecoins to single USD address
    function _convertUSD(address tokenAddressA, address tokenAddressB)
        private
        view
        returns (address, address)
    {
        if (
            _nrOfDecimalsUSD[tokenAddressA] > 0 &&
            _nrOfDecimalsUSD[tokenAddressB] > 0
        ) {
            return (_USD_ADDRESS, _USD_ADDRESS);
        } else if (_nrOfDecimalsUSD[tokenAddressA] > 0) {
            return (_USD_ADDRESS, tokenAddressB);
        } else if (_nrOfDecimalsUSD[tokenAddressB] > 0) {
            return (tokenAddressA, _USD_ADDRESS);
        } else {
            return (tokenAddressA, tokenAddressB);
        }
    }

    /// @dev modify nrOfDecimlas and amount to follow stableCoin's nrOfDecimals
    function _matchStableCoinDecimal(
        address stableCoinAddress,
        uint256 amount,
        uint256 nrOfDecimals,
        uint256 padding,
        uint256 returnRateA,
        uint256 returnRateB
    ) private view returns (uint256 returnAmount) {
        uint256 div =
            _nrOfDecimalsUSD[stableCoinAddress] > nrOfDecimals
                ? 10**(_nrOfDecimalsUSD[stableCoinAddress] - nrOfDecimals)
                : 10**(nrOfDecimals - _nrOfDecimalsUSD[stableCoinAddress]);
        returnAmount = _nrOfDecimalsUSD[stableCoinAddress] > nrOfDecimals
            ? amount.mul(returnRateA.mul(10**padding)).div(returnRateB).mul(div)
            : amount.mul(returnRateA.mul(10**padding)).div(returnRateB).div(
                div
            );
    }
}