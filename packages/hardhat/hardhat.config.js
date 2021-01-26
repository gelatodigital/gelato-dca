require('@nomiclabs/hardhat-waffle');
require('@nomiclabs/hardhat-ethers');
require('hardhat-deploy');
require('hardhat-gas-reporter');
require('dotenv').config();
const { task } = require('hardhat/config');
const { GelatoCore } = require('@gelatonetwork/core');

const ALCHEMY_ID = process.env.ALCHEMY_ID;
const PRIVATE_KEY = process.env.PRIVATE_KEY;

if (!ALCHEMY_ID) {
  /* eslint-disable no-console */
  console.log(
    '\n !! IMPORTANT !!\n Must set ALCHEMY_ID in .env before running hardhat',
  );
  process.exit(0);
}

const ETH_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
const USD_ADDRESS = '0x7354C81fbCb229187480c4f497F945C6A312d5C3';

const mainnetAddresses = {
  kyberProxy: '0x9AAb3f75489902f3a48495025729a0AF77d4b11e',
  uniswapRouter: '0x7a250d5630b4cf539739df2c5dacb4c659f2488d',
  sushiswapRouter: '0xd9e1ce17f2641f24ae83637ab66a2cca9c378b9f',
  gasTokenAddress: '0x0000000000b3F879cb30FE243b4Dfee438691c04',
  masterCopy111Address: '0x34CfAC646f301356fAa8B21e94227e3583Fe3F5F',
  cpkFactoryAddress: '0x0fB4340432e56c014fa96286de17222822a9281b',
  multiSendAddress: '0xB522a9f781924eD250A11C54105E51840B138AdD',
  fallbackHandlerAddress: '0x40A930851BD2e590Bd5A5C981b436de25742E980',
  gelatoCoreAddress: '0x025030bdaa159f281cae63873e68313a703725a5',
  externalProviderAddress: '0x3d9A46b5D421bb097AC28B4f70a4A1441A12920C',
  gnosisSafeProviderModuleAddress: '0x2E87AD9BBdaa9113cd5cA1920c624E2749D7086B',
  gasPriceOracleAddress: '0x169E633A2D1E6c10dD91238Ba11c4A708dfEF37C',
  oracleAggregatorAddress: '0x64f31D46C52bBDe223D863B11dAb9327aB1414E9',
  ethAddress: ETH_ADDRESS,
  usdAddress: USD_ADDRESS,
  daiAddress: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
  usdcAddress: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  usdtAddress: '0xdac17f958d2ee523a2206206994597c13d831ec7',
  wethAddress: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
};

const ropstenAddresses = {
  swapProxyAddress: '0x4A0C59CcCae7B4F0732a4A1b9A7BDA49cc1d88F9',
  swapImplementationAddress: '0x0E84f320F5763Bcc27C033367a45F0D339427e35',
  lendingAddress: '0xdEbF71D29524447D7A29CDf29Ba09fc6acb017a6',
  burnGasHelperAddress: '0x5758BD3DC2552e9072d5Ff6c0312816f541A0213',
  platformWalletAddress: '0x3fFFF2F4f6C0831FAC59534694ACd14AC2Ea501b',
  gelatoCoreAddress: '0xb916929A3cD2862835Ca59118Cc584355928d341',
  executorAddress: '0xBa16b28675378Bf62156aA9Bb430177Eb02c0E99',
  daiAddress: '0xaD6D458402F60fD3Bd25163575031ACDce07538D',
  usdcAddress: '0x07865c6E87B9F70255377e024ace6630C1Eaa37F',
  ethAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
  usdAddress: '0x7354C81fbCb229187480c4f497F945C6A312d5C3',
  kncAddress: '0x7b2810576aa1cce68f2b118cef1f36467c648f92',
  wethAddress: '0xbCA556c912754Bc8E7D4Aad20Ad69a1B1444F42d',
  oracleAggregatorAddress: '0x0c685e0414F6651fCa613f16B24FCF5dcEDd3338',
  kyberProxy: '0xd719c34261e099Fdb33030ac8909d5788D3039C4',
  uniswapRouter: '0x7a250d5630b4cf539739df2c5dacb4c659f2488d',
  gelatoKrystalAddress: '0xE5599dd8DA37D59257098BE5BfF0bB3e7735e154',
};

module.exports = {
  defaultNetwork: 'hardhat',
  namedAccounts: {
    deployer: {
      default: 0,
      ropsten: '0xAabB54394E8dd61Dd70897E9c80be8de7C64A895', // address corresponding to ropsten Private Key
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS ? true : false,
    maxMethodDiff: 25,
    coinmarketcap: process.env.COINMARKETCAP_API_KEY,
    remoteContracts: [
      {
        name: 'GelatoCore',
        abi: GelatoCore.abi,
        address: mainnetAddresses.gelatoCoreAddress,
      },
    ],
  },
  networks: {
    hardhat: {
      forking: {
        url: `https://eth-mainnet.alchemyapi.io/v2/${ALCHEMY_ID}`,
        blockNumber: 11731980,
      },
      addresses: mainnetAddresses,
    },
    ropsten: {
      url: `https://eth-ropsten.alchemyapi.io/v2/${ALCHEMY_ID}`,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      addresses: ropstenAddresses,
    },
  },
  solidity: {
    compilers: [
      // Gelato contracts
      {
        version: '0.7.0',
        settings: {
          optimizer: require('./solcOptimiserSettings.js'),
        },
      },
      // Krystal contracts
      {
        version: '0.6.6',
        settings: {
          optimizer: require('./solcOptimiserSettings.js'),
        },
      },
      {
        version: '0.6.10',
        settings: {
          optimizer: require('./solcOptimiserSettings.js'),
        },
      },
    ],
  },

  paths: {
    sources: './contracts',
    tests: './test/',
  },

  mocha: {
    timeout: 0,
  },
};

task('iswhitelisted', 'determines gnosis safe proxy extcodehash')
  .addFlag('log', 'Logs return values to stdout')
  .setAction(async ({}, hre) => {
    console.log(hre.network.config.addresses.swapProxyAddress);
    console.log(hre.network.config.addresses.platformWalletAddress);
    const smartWalletProxyStorage = await hre.ethers.getContractAt(
      'SmartWalletSwapStorage',
      hre.network.config.addresses.swapProxyAddress,
    );

    const isPlatformWallet = await smartWalletProxyStorage.supportedPlatformWallets(
      hre.network.config.addresses.platformWalletAddress,
    );
    console.log(`Is PlatformWallet whitelisted? ${isPlatformWallet}`);
  });
