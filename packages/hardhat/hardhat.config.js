require('@nomiclabs/hardhat-waffle');
require('@nomiclabs/hardhat-ethers');
require('hardhat-deploy');
require('hardhat-gas-reporter');
require('dotenv').config();
const { task } = require('hardhat/config');

const ALCHEMY_ID = process.env.ALCHEMY_ID;
const PRIVATE_KEY_TEST = process.env.PRIVATE_KEY_TEST;
const PRIVATE_KEY_MAINNET = process.env.PRIVATE_KEY_MAINNET;

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
  Gelato: '0x3CACa7b48D0573D793d3b0279b5F0029180E83b6',
  KyberProxy: '0x9AAb3f75489902f3a48495025729a0AF77d4b11e',
  UniswapRouter: '0x7a250d5630b4cf539739df2c5dacb4c659f2488d',
  SushiswapRouter: '0xd9e1ce17f2641f24ae83637ab66a2cca9c378b9f',
  SwapProxy: '0x365e17e1b8F5D44547c1837e20b63b3d24BE2BD2',
  GelatoGasPriceOracle: '0x169E633A2D1E6c10dD91238Ba11c4A708dfEF37C',
  OracleAggregator: '0x64f31D46C52bBDe223D863B11dAb9327aB1414E9',
  ETH: ETH_ADDRESS,
  USD: USD_ADDRESS,
  DAI: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
  USDC: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  USDT: '0xdac17f958d2ee523a2206206994597c13d831ec7',
  WETH: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
  GelatoExecutor: '0x3b110ce530bfc5ce5a966fe7fe13f0ea7d56b734',
  KrystalPlatformWallet: '0x3ffff2f4f6c0831fac59534694acd14ac2ea501b'
};

const ropstenAddresses = {};

module.exports = {
  defaultNetwork: 'hardhat',
  namedAccounts: {
    deployer: {
      default: 0,
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS ? true : false,
    maxMethodDiff: 25,
    coinmarketcap: process.env.COINMARKETCAP_API_KEY,
  },
  networks: {
    hardhat: {
      forking: {
        url: `https://eth-mainnet.alchemyapi.io/v2/${ALCHEMY_ID}`,
        blockNumber: 12115900,
      },
      ...mainnetAddresses,
    },
    ropsten: {
      url: `https://eth-ropsten.alchemyapi.io/v2/${ALCHEMY_ID}`,
      accounts: PRIVATE_KEY_TEST ? [PRIVATE_KEY_TEST] : [],
      ...ropstenAddresses,
    },
    mainnet: {
      url: `https://eth-mainnet.alchemyapi.io/v2/${ALCHEMY_ID}`,
      accounts: PRIVATE_KEY_MAINNET ? [PRIVATE_KEY_MAINNET] : [],
      ...mainnetAddresses,
    },
  },
  solidity: {
    compilers: [
      // Gelato contracts
      {
        version: '0.8.0',
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
