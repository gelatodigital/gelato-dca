// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.0;

import "./ICompErc20.sol";

interface IComptroller {
    function claimComp(
        address[] calldata holders,
        ICompErc20[] calldata cTokens,
        bool borrowers,
        bool suppliers
    ) external;

    function getAllMarkets() external view returns (ICompErc20[] memory);

    function getCompAddress() external view returns (address);
}
