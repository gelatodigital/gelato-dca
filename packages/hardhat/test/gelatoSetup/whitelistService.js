module.exports = async function (
  serviceRegistry,
  userWallet,
  executorWallet,
  serviceAddress
) {
  //#region Whitelist service

  // Request Service
  await serviceRegistry.connect(userWallet).request(serviceAddress);

  // Approve service
  await serviceRegistry.connect(executorWallet).accept(serviceAddress);

  return serviceRegistry;
  //#endregion
};
