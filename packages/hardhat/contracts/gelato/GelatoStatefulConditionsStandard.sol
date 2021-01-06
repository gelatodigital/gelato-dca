// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.0;

import "./GelatoConditionsStandard.sol";
import {IGelatoCore} from "./interfaces/IGelatoCore.sol";

abstract contract GelatoStatefulConditionsStandard is GelatoConditionsStandard {
    IGelatoCore public immutable gelatoCore;

    constructor(IGelatoCore _gelatoCore) { gelatoCore = _gelatoCore; }

    function _getIdOfNextTaskInCycle() internal view returns(uint256 nextTaskReceiptId) {
        try gelatoCore.currentTaskReceiptId() returns(uint256 currentId) {
            nextTaskReceiptId = currentId + 1;
        } catch Error(string memory _err) {
            revert(
                string(abi.encodePacked(
                    "GelatoStatefulConditionsStandard._getIdOfNextTaskInCycle", _err
                ))
            );
        } catch {
            revert("GelatoStatefulConditionsStandard._getIdOfNextTaskInCycle:undefined");
        }
    }
}