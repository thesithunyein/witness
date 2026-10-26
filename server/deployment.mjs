/**
 * Public deployment facts, inlined for the serverless function.
 *
 * These are addresses and URLs, not secrets: anyone can read them off the chain.
 * They are copied from contracts/deployments/<chainId>.json because a bundled
 * function cannot be relied on to read a JSON file from the repository at run
 * time, and a relayer that silently lost its addresses would report itself
 * unconfigured. Regenerate this file when a contract is redeployed.
 */

export const DEPLOYMENTS = {
  "10143": {
    "chainName": "Monad Testnet",
    "rpc": "https://testnet-rpc.monad.xyz",
    "explorer": "https://testnet.monadexplorer.com",
    "rpId": "witness.sithunyein.com",
    "origin": "https://witness.sithunyein.com",
    "payee": "0xFc31378e13B4Cb7B545bAC58b28916476406439d",
    "agentId": 2148,
    "contracts": {
      "AgentExecutor": "0x5b451F0700df77293a5A737189BdbA3C37362d23",
      "DemoSafe": "0xcb7187F16c2AE7E8494B82dBc73DDaE18b6e1309",
      "DemoUSD": "0x5Bb70C698F3428802ac3C186EC0Da98a088A6d2c",
      "WitnessIntentRegistry": "0x3518B7A64D7Cc01e33a0F0A3Fa4111ad2Af3e521",
      "WitnessVerifier": "0xced20751479A13E76A67cC33C911e8eF61a81165"
    }
  },
  "31611": {
    "chainName": "Mezo Testnet",
    "rpc": "https://rpc.test.mezo.org",
    "explorer": "https://explorer.test.mezo.org",
    "rpId": "witness-agent.vercel.app",
    "origin": "https://witness-agent.vercel.app",
    "payee": "0xFc31378e13B4Cb7B545bAC58b28916476406439d",
    "agentId": 0,
    "contracts": {
      "AgentExecutor": "0x6ac484ac42E7eC9942365710b1F8C6106026B45e",
      "DemoSafe": "0x1FeB7394AE56c3BD618D4089F0A17C9d4832E1E6",
      "DemoUSD": "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503",
      "P256Verifier": "0x817328dec94122b8eCB7f28a5839003352394430",
      "WitnessIntentRegistry": "0x17dACE260313bEa721a8Ed2254Bbbf19D7a9cF5B",
      "WitnessVerifier": "0xBE66C46f26fE006B4De2B6441011939F930C8C4D"
    }
  }
};

export const DEFAULT_CHAIN_ID = 31611;
