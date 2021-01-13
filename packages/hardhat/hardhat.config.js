require('@nomiclabs/hardhat-waffle');
require('@nomiclabs/hardhat-ethers');
require('hardhat-deploy');
require('dotenv').config();
const { task } = require('hardhat/config');

const ALCHEMY_ID = process.env.ALCHEMY_ID;
const PRIVATE_KEY = process.env.PRIVATE_KEY;

if (!ALCHEMY_ID) {
  /* eslint-disable no-console */
  console.log(
    '\n !! IMPORTANT !!\n Must set ALCHEMY_ID in .env before running hardhat',
  );
  process.exit(0);
}

const ETH_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const USD_ADDRESS = "0x7354C81fbCb229187480c4f497F945C6A312d5C3";
  
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
  ethAddress: ETH_ADDRESS,
  usdAddress: USD_ADDRESS,
  aaveAddress: "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9",
  adxAddress: "0xADE00C28244d5CE17D72E40330B1c318cD12B7c3",
  batAddress: "0x0D8775F648430679A709E98d2b0Cb6250d2887EF",
  bnbAddress: "0xB8c77482e45F1F44dE1745F52C74426C631bDD52",
  bntAddress: "0x1F573D6Fb3F13d689FF844B4cE37794d79a7FF1C",
  busdAddress: "0x4Fabb145d64652a948d72533023f6E7A623C7C53",
  bzrxAddress: "0x56d811088235F11C8920698a204A5010a788f4b3",
  compAddress: "0xc00e94Cb662C3520282E6f5717214004A7f26888",
  croAddress: "0xA0b73E1Ff0B80914AB6fe0444E65848C4C34450b",
  daiAddress: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
  dmgAddress: "0xEd91879919B71bB6905f23af0A68d231EcF87b14",
  enjAddress: "0x24D9aB51950F3d62E9144fdC2f3135DAA6Ce8D1B",
  kncAddress: "0xdd974D5C2e2928deA5F71b9825b8b646686BD200",
  linkAddress: "0x514910771AF9Ca656af840dff83E8264EcF986CA",
  lrcAddress: "0xBBbbCA6A901c926F240b89EacB641d8Aec7AEafD",
  manaAddress: "0x0F5D2fB29fb7d3CFeE444a200298f468908cC942",
  mkrAddress: "0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2",
  nmrAddress: "0x1776e1F26f98b1A5dF9cD347953a26dd3Cb46671",
  renAddress: "0x408e41876cCCDC0F92210600ef50372656052a38",
  repAddress: "0x221657776846890989a759BA2973e427DfF5C9bB",
  snxAddress: "0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F",
  susdAddress: "0x57Ab1ec28D129707052df4dF418D58a2D46d5f51",
  sxpAddress: "0x8CE9137d39326AD0cD6491fb5CC0CbA0e089b6A9",
  tusdAddress: "0x0000000000085d4780B73119b644AE5ecd22b376",
  uniAddress: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984",
  usdcAddress: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  usdtAddress: "0xdac17f958d2ee523a2206206994597c13d831ec7",
  wethAddress: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
  womAddress: "0xa982B2e19e90b2D9F7948e9C1b65D119F1CE88D6",
  yfiAddress: "0x0bc529c00C6401aEF6D220BE8C6Ea1667F6Ad93e",
  zrxAddress: "0xE41d2489571d322189246DaFA5ebDe1F4699F498",
};

let mainnetOracles = {};
mainnetOracles[mainnetAddresses.usdAddress] = {
  "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE":
    "0x986b5E1e1755e3C2440e960477f25201B0a8bbD4",
};
mainnetOracles[mainnetAddresses.ethAddress] = {
  "0x7354C81fbCb229187480c4f497F945C6A312d5C3":
    "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
};
mainnetOracles[mainnetAddresses.aaveAddress] = {
  "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE":
    "0x6Df09E975c830ECae5bd4eD9d90f3A95a4f88012",
};
mainnetOracles[mainnetAddresses.adxAddress] = {
  "0x7354C81fbCb229187480c4f497F945C6A312d5C3":
    "0x231e764B44b2C1b7Ca171fa8021A24ed520Cde10",
};
mainnetOracles[mainnetAddresses.batAddress] = {
  "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE":
    "0x0d16d4528239e9ee52fa531af613AcdB23D88c94",
};
mainnetOracles[mainnetAddresses.bnbAddress] = {
  "0x7354C81fbCb229187480c4f497F945C6A312d5C3":
    "0x14e613AC84a31f709eadbdF89C6CC390fDc9540A",
};
mainnetOracles[mainnetAddresses.bntAddress] = {
  "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE":
    "0xCf61d1841B178fe82C8895fe60c2EDDa08314416",
};
mainnetOracles[mainnetAddresses.bzrxAddress] = {
  "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE":
    "0x8f7C7181Ed1a2BA41cfC3f5d064eF91b67daef66",
};
mainnetOracles[mainnetAddresses.compAddress] = {
  "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE":
    "0x1B39Ee86Ec5979ba5C322b826B3ECb8C79991699",
  "0x7354C81fbCb229187480c4f497F945C6A312d5C3":
    "0xdbd020CAeF83eFd542f4De03e3cF0C28A4428bd5",
};
mainnetOracles[mainnetAddresses.croAddress] = {
  "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE":
    "0xcA696a9Eb93b81ADFE6435759A29aB4cf2991A96",
};
mainnetOracles[mainnetAddresses.dmgAddress] = {
  "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE":
    "0xD010e899f7ab723AC93f825cDC5Aa057669557c2",
};
mainnetOracles[mainnetAddresses.enjAddress] = {
  "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE":
    "0x24D9aB51950F3d62E9144fdC2f3135DAA6Ce8D1B",
};
mainnetOracles[mainnetAddresses.kncAddress] = {
  "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE":
    "0x656c0544eF4C98A6a98491833A89204Abb045d6b",
  "0x7354C81fbCb229187480c4f497F945C6A312d5C3":
    "0xf8fF43E991A81e6eC886a3D281A2C6cC19aE70Fc",
};
mainnetOracles[mainnetAddresses.linkAddress] = {
  "0x7354C81fbCb229187480c4f497F945C6A312d5C3":
    "0x2c1d072e956AFFC0D435Cb7AC38EF18d24d9127c",
  "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE":
    "0xDC530D9457755926550b59e8ECcdaE7624181557",
};
mainnetOracles[mainnetAddresses.lrcAddress] = {
  "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE":
    "0x160AC928A16C93eD4895C2De6f81ECcE9a7eB7b4",
  "0x7354C81fbCb229187480c4f497F945C6A312d5C3":
    "0x231e764B44b2C1b7Ca171fa8021A24ed520Cde10",
};
mainnetOracles[mainnetAddresses.manaAddress] = {
  "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE":
    "0x82A44D92D6c329826dc557c5E1Be6ebeC5D5FeB9",
};
mainnetOracles[mainnetAddresses.mkrAddress] = {
  "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE":
    "0x24551a8Fb2A7211A25a17B1481f043A8a8adC7f2",
};
mainnetOracles[mainnetAddresses.nmrAddress] = {
  "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE":
    "0x9cB2A01A7E64992d32A34db7cEea4c919C391f6A",
};
mainnetOracles[mainnetAddresses.renAddress] = {
  "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE":
    "0x3147D7203354Dc06D9fd350c7a2437bcA92387a4",
  "0x7354C81fbCb229187480c4f497F945C6A312d5C3":
    "0x0f59666EDE214281e956cb3b2D0d69415AfF4A01",
};

mainnetOracles[mainnetAddresses.repAddress] = {
  "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE":
    "0xD4CE430C3b67b3E2F7026D86E7128588629e2455",
};
mainnetOracles[mainnetAddresses.snxAddress] = {
  "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE":
    "0x79291A9d692Df95334B1a0B3B4AE6bC606782f8c",
  "0x7354C81fbCb229187480c4f497F945C6A312d5C3":
    "0xDC3EA94CD0AC27d9A86C180091e7f78C683d3699",
};
mainnetOracles[mainnetAddresses.sxpAddress] = {
  "0x7354C81fbCb229187480c4f497F945C6A312d5C3":
    "0xFb0CfD6c19e25DB4a08D8a204a387cEa48Cc138f",
};
mainnetOracles[mainnetAddresses.uniAddress] = {
  "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE":
    "0xD6aA3D25116d8dA79Ea0246c4826EB951872e02e",
};
mainnetOracles[mainnetAddresses.womAddress] = {
  "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE":
    "0xcEBD2026d3C99F2a7CE028acf372C154aB4638a9",
};
mainnetOracles[mainnetAddresses.yfiAddress] = {
  "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE":
    "0x7c5d4F8345e66f68099581Db340cd65B078C41f4",
};
mainnetOracles[mainnetAddresses.zrxAddress] = {
  "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE":
    "0x2Da4983a622a8498bb1a21FaE9D8F6C664939962",
};

const mainnetAddressBook = {
  addresses: mainnetAddresses,
  oracles: mainnetOracles,
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

let ropstenOracles = {};
ropstenOracles[ropstenAddresses.ethAddress] = {
  '0x7354C81fbCb229187480c4f497F945C6A312d5C3':
    '0xCd8936C823c851Df31F64085E257A183029198E0',
}; // deploy mock ETH/USD
ropstenOracles[ropstenAddresses.usdAddress] = {
  '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE':
    '0xa14D96dcCA45b1003291bE3D2814CBAc44d332D6',
} // deploy mock USD/ETH

const ropstenAddressBook = {
  addresses: ropstenAddresses,
  oracles: ropstenOracles,
};

module.exports = {
  defaultNetwork: 'hardhat',
  namedAccounts: {
    deployer: {
      default: 0,
      ropsten: '0xAabB54394E8dd61Dd70897E9c80be8de7C64A895', // address corresponding to ropsten Private Key
    },
  },
  networks: {
    hardhat: {
      forking: {
        url: `https://eth-mainnet.alchemyapi.io/v2/${ALCHEMY_ID}`,
        blockNumber: 11451429,
      },
      ...mainnetAddressBook,
    },
    ropsten: {
      url: `https://eth-ropsten.alchemyapi.io/v2/${ALCHEMY_ID}`,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      ...ropstenAddressBook,
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
