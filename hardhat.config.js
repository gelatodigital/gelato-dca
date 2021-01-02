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

module.exports = {
  defaultNetwork: 'hardhat',
  networks: {
    hardhat: {
      forking: {
        url: `https://eth-mainnet.alchemyapi.io/v2/${ALCHEMY_ID}`,
        blockNumber: 11451429,
      },
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
