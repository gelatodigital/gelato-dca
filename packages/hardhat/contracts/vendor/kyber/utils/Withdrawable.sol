// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.0;

import {SafeERC20, IERC20} from "../../openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "./PermissionGroups.sol";

contract Withdrawable is PermissionGroups {
    using SafeERC20 for IERC20;

    event TokenWithdraw(IERC20 token, uint256 amount, address sendTo);
    event EtherWithdraw(uint256 amount, address sendTo);

    // solhint-disable-next-line no-empty-blocks
    constructor(address _admin) PermissionGroups(_admin) {}

    /**
     * @dev Withdraw all IERC20 compatible tokens
     * @param token IERC20 The address of the token contract
     */
    function withdrawToken(
        IERC20 token,
        uint256 amount,
        address sendTo
    ) external onlyAdmin {
        token.safeTransfer(sendTo, amount);
        emit TokenWithdraw(token, amount, sendTo);
    }

    /**
     * @dev Withdraw Ethers
     */
    function withdrawEther(uint256 amount, address payable sendTo) external onlyAdmin {
        (bool success, ) = sendTo.call{value: amount}("");
        require(success, "withdraw failed");
        emit EtherWithdraw(amount, sendTo);
    }
}