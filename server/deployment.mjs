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
      "AgentExecutor": "0x7010c0474AA1c8E8039712d314d105D1aDe0a87d",
      "DemoSafe": "0x17fc3f962213bb9156Fd36c856B1FC0B696D9Ac8",
      "DemoUSD": "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503",
      "P256Verifier": "0x7836f1bDDdBF491c23a285B5015441a5A147D096",
      "WitnessIntentRegistry": "0x84502BA6Bf4A565b84E8eC1747568d54610E71E2",
      "WitnessVerifier": "0x6d9e9Bd86Bcd6D5e0E060DFB3186f52091d858f2"
    }
  }
};

export const DEFAULT_CHAIN_ID = 31611;
