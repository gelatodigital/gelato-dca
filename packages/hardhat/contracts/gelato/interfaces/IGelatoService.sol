// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.0;
pragma experimental ABIEncoderV2;

interface IGelatoService {
  event LogTaskSubmitted(
    uint256 indexed taskId,
    bytes canExecPayload,
    address canExecAddress,
    string execFunctionAbi,
    bytes execParams,
    address execAddress
  );

  event LogExecSuccess(uint256 indexed taskId, address indexed executor);

  function verifyTask(bytes32, uint256) external view returns (bool);

  function currentTaskId() external view returns (uint256);

  function getGasPrice() external view returns (uint256);
}
