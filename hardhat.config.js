require('@nomiclabs/hardhat-waffle');
require('@nomiclabs/hardhat-ethers');
require('dotenv').config();

const ALCHEMY_ID = process.env.ALCHEMY_ID;
const PRIVATE_KEY_RINKEBY = process.env.PRIVATE_KEY_RINKEBY;
// const PRIVATE_KEY_MAINNET = process.env.PRIVATE_KEY_MAINNET;

if (!ALCHEMY_ID) {
  /* eslint-disable no-console */
  console.log(
    '\n !! IMPORTANT !!\n Must set ALCHEMY_ID in .env before running hardhat',
  );
  process.exit(0);
}

const addressList = {
  kyberProxy: '0x9AAb3f75489902f3a48495025729a0AF77d4b11e',
  wethAddress: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
  uniswapRouter: '0x7a250d5630b4cf539739df2c5dacb4c659f2488d',
  sushiswapRouter: '0xd9e1ce17f2641f24ae83637ab66a2cca9c378b9f',
  usdtAddress: '0xdac17f958d2ee523a2206206994597c13d831ec7',
  usdcAddress: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  daiAddress: '0x6b175474e89094c44da98b954eedeac495271d0f',
  gasTokenAddress: '0x0000000000b3F879cb30FE243b4Dfee438691c04',
  masterCopy111Address: '0x34CfAC646f301356fAa8B21e94227e3583Fe3F5F',
  cpkFactoryAddress: '0x0fB4340432e56c014fa96286de17222822a9281b',
  multiSendAddress: '0xB522a9f781924eD250A11C54105E51840B138AdD',
  fallbackHandlerAddress: '0x40A930851BD2e590Bd5A5C981b436de25742E980',
  gelatoCoreAddress: '0x025030bdaa159f281cae63873e68313a703725a5',
  externalProviderAddress: '0x3d9A46b5D421bb097AC28B4f70a4A1441A12920C',
  gnosisSafeProviderModuleAddress: '0x2E87AD9BBdaa9113cd5cA1920c624E2749D7086B',
  ethAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
};

module.exports = {
  defaultNetwork: 'hardhat',
  networks: {
    hardhat: {
      forking: {
        url: `https://eth-mainnet.alchemyapi.io/v2/${ALCHEMY_ID}`,
        blockNumber: 11451429,
      },
      ...addressList,
    },
    rinkeby: {
      // Standard
      accounts: PRIVATE_KEY_RINKEBY ? [PRIVATE_KEY_RINKEBY] : [],
      chainId: 4,
      // gas: 4000000,  // 4 million
      // gasPrice: "auto",
      url: `https://eth-rinkeby.alchemyapi.io/v2/${ALCHEMY_ID}`,
      // Custom
      // Rinkeby: addressBook
      addressBook: {
        // Rinkeby: erc20s
        erc20: {
          DAI: '0x5592EC0cfb4dbc12D3aB100b257153436a1f0FEa',
          '0x5592EC0cfb4dbc12D3aB100b257153436a1f0FEa': 'DAI',
          WETH: '0xc778417e063141139fce010982780140aa0cd5ab',
          '0xc778417e063141139fce010982780140aa0cd5ab': 'WETH',
          USDC: '0x4DBCdF9B62e891a7cec5A2568C3F4FAF9E8Abe2b',
          '0x4DBCdF9B62e891a7cec5A2568C3F4FAF9E8Abe2b': 'USDC',
        },

        uniswapV2: {
          router2: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
          factory: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f',
        },

        oracles: {
          DaiEth: '0x74825DbC8BF76CC4e9494d0ecB210f676Efa001D',
          UsdcEth: '0xdCA36F27cbC4E38aE16C4E9f99D39b42337F6dcf',
        },
      },

      // Rinkeby: Filters
      filters: {
        defaultFromBlock: 6699941,
        defaultToBlock: 'latest',
      },
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
