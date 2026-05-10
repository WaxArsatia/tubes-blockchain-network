require("@nomicfoundation/hardhat-toolbox");

module.exports = {
  solidity: {
    version: "0.8.27",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    'besu-private': {
      url: 'https://blockscout.denis.my.id:443/api/eth-rpc'
    },
  },
  etherscan: {
    apiKey: {
      'besu-private': 'empty'
    },
    customChains: [
      {
        network: "besu-private",
        chainId: 1337,
        urls: {
          apiURL: "https://blockscout.denis.my.id:443/api",
          browserURL: "https://blockscout.denis.my.id:443"
        }
      }
    ]
  }
};
