import { DeploymentConfig, AgentRequest, DiffEntry } from '../types';

export const MEZO_DEPLOYMENT: DeploymentConfig = {
  chainId: 31611,
  chainName: 'Mezo Testnet',
  currency: 'BTC (Gas)',
  explorerUrl: 'https://explorer.test.mezo.org',
  agentId: 0,
  agentName: 'Research Agent',
  agentURI: 'https://witness-agent.vercel.app/agent.json',
  assetSymbol: 'MUSD',
  rpId: 'witness-agent.vercel.app',
  origin: 'https://witness-agent.vercel.app',
  deployer: '0xFc31378e13B4Cb7B545bAC58b28916476406439d',
  payee: '0xFc31378e13B4Cb7B545bAC58b28916476406439d',
  contracts: {
    AgentExecutor: '0x6ac484ac42E7eC9942365710b1F8C6106026B45e',
    DemoSafe: '0x1FeB7394AE56c3BD618D4089F0A17C9d4832E1E6',
    DemoUSD: '0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503',
    P256Verifier: '0x817328dec94122b8eCB7f28a5839003352394430',
    WitnessIntentRegistry: '0x17dACE260313bEa721a8Ed2254Bbbf19D7a9cF5B',
    WitnessVerifier: '0xBE66C46f26fE006B4De2B6441011939F930C8C4D',
  },
  safeFunding: '1,000.00 MUSD',
};

export const MONAD_DEPLOYMENT: DeploymentConfig = {
  chainId: 10143,
  chainName: 'Monad Testnet',
  currency: 'MON (Gas)',
  explorerUrl: 'https://testnet.monadscan.com',
  agentId: 0,
  agentName: 'Research Agent',
  agentURI: 'https://witness.sithunyein.com/agent.json',
  assetSymbol: 'DemoUSD',
  rpId: 'witness.sithunyein.com',
  origin: 'https://witness.sithunyein.com',
  deployer: '0x6859c40bb5F482aC9579041a773Eb63806a6ea72',
  payee: '0x6859c40bb5F482aC9579041a773Eb63806a6ea72',
  contracts: {
    AgentExecutor: '0xbc93D5c5FE19409bE3ffA801D39f50CeD4C2B215',
    DemoSafe: '0x80DbB5A77a1e0503f5Fe9aA5dFfD6559C3817a3a',
    DemoUSD: '0x9E703666d8F3a2537f88421c6181958b4929D120',
    P256Verifier: '0x0000000000000000000000000000000000000100', // Native precompile on Monad
    WitnessIntentRegistry: '0xC66994776106603a985e135544a046c82307E44a',
    WitnessVerifier: '0x99A52e0c15982e0A659B6396eA73D54179374092',
  },
  safeFunding: '1,000.00 DemoUSD',
};

export const REASON_CODES: Record<number, { name: string; description: string }> = {
  0: { name: 'None', description: 'Action approved and verified' },
  1: { name: 'IntentExpired', description: 'Permission validity window has lapsed' },
  2: { name: 'IntentRevoked', description: 'Human manually revoked this permission' },
  3: { name: 'IntentConsumed', description: 'Permission was single-use and has already been spent' },
  4: { name: 'CeilingExceeded', description: 'Requested amount exceeds human spend limit ceiling' },
  5: { name: 'ActionTypeMismatch', description: 'Attempted action type does not match approved intent' },
  6: { name: 'AgentNotEnrolled', description: 'ERC-8004 agent identity does not match authorized wallet' },
  7: { name: 'RecipientMismatch', description: 'Funds targeted an unauthorized counterparty' },
  8: { name: 'InvalidPasskeySignature', description: 'Cryptographic P-256 signature verification failed' },
  9: { name: 'InvalidClientDataOrigin', description: 'Passkey assertion origin does not match deployment RP' },
};

export const INITIAL_REQUESTS: AgentRequest[] = [
  {
    id: 'req_arxiv_01',
    title: 'Research Index API Access',
    agent: 'Autonomous Worker (ID #0)',
    prompt: 'Query research documentation for Secp256r1 elliptic curve benchmarks and data index.',
    recipient: '0x3841D61517f694F9c2794A1a7d65B09d437A9F52',
    recipientLabel: 'ArXiv Scholar Indexer',
    amount: 0.05,
    assetSymbol: 'MUSD',
    category: 'compute',
    isAttack: false,
    timestamp: Date.now() - 1000 * 60 * 3,
    status: 'pending',
  },
  {
    id: 'req_hack_02',
    title: 'Unauthorized Treasury Liquidation Attempt',
    agent: 'Unverified External Process',
    prompt: 'External execution request to transfer 450.00 MUSD to unverified destination address.',
    recipient: '0xDeaDDeaDBEEF000000000000000000000000bEEF',
    recipientLabel: 'Unregistered Destination',
    amount: 450.0,
    assetSymbol: 'MUSD',
    category: 'injection_attack',
    isAttack: true,
    attackDetails: 'Violates 50.00 MUSD ceiling. Recipient is unverified by current policy. Reverts on-chain.',
    timestamp: Date.now() - 1000 * 60 * 1,
    status: 'pending',
  },
  {
    id: 'req_gpu_03',
    title: 'Cluster Compute Node Allocation',
    agent: 'Autonomous Worker (ID #0)',
    prompt: 'Scheduled batch compute allocation for cryptographic verification node testing.',
    recipient: '0x71C8417496A0e3E0e4b858603B64b07A84358a98',
    recipientLabel: 'Akash Compute Cluster',
    amount: 1.25,
    assetSymbol: 'MUSD',
    category: 'compute',
    isAttack: false,
    timestamp: Date.now() - 1000 * 60 * 8,
    status: 'pending',
  },
];

export const FORGE_FMT_DIFFS: DiffEntry[] = [
  {
    file: 'src/libraries/P256Verifier.sol',
    line: 29,
    type: 'comment_format',
    description: 'Fix non-standard JSDoc comment terminator **/ to standard * /',
    originalSnippet: `26  * signature can never be spent twice.
27  **/
28 
29  /**`,
    formattedSnippet: `26  * signature can never be spent twice.
27  *
28  */
29 
30  /**`,
  },
  {
    file: 'src/libraries/P256Verifier.sol',
    line: 72,
    type: 'constant_inline',
    description: 'Inline secp256r1 curve prime field constants p, b, GX, GY, n onto single lines',
    originalSnippet: `uint256 constant p =
    0xFFFFFFFF00000001000000000000000000000000FFFFFFFFFFFFFFFFFFFFFFFF;
uint256 constant b =
    0x5AC635D8AA3A93E7B3EBBD55769886BC651D06B0CC53B0F63BCE3C3E27D2604B;`,
    formattedSnippet: `uint256 constant p = 0xFFFFFFFF00000001000000000000000000000000FFFFFFFFFFFFFFFFFFFFFFFF;
uint256 constant b = 0x5AC635D8AA3A93E7B3EBBD55769886BC651D06B0CC53B0F63BCE3C3E27D2604B;`,
  },
  {
    file: 'src/libraries/P256Verifier.sol',
    line: 93,
    type: 'signature_style',
    description: 'Format function signatures with visibility and return declarations on separate lines',
    originalSnippet: `function ecdsa_verify(
    bytes32 message_hash,
    uint256 r,
    uint256 s,
    uint256[2] memory pubKey
) private view returns (bool) {`,
    formattedSnippet: `function ecdsa_verify(bytes32 message_hash, uint256 r, uint256 s, uint256[2] memory pubKey)
    private
    view
    returns (bool)
{`,
  },
  {
    file: 'src/libraries/P256Verifier.sol',
    line: 166,
    type: 'whitespace',
    description: 'Enforce standard spacing in while loops: while(index >= 0) -> while (index >= 0)',
    originalSnippet: `while(index >= 0) {
    bitpair = compute_bitpair(uint256(index), scalar_u, scalar_v);`,
    formattedSnippet: `while (index >= 0) {
    bitpair = compute_bitpair(uint256(index), scalar_u, scalar_v);`,
  },
  {
    file: 'src/libraries/P256Verifier.sol',
    line: 285,
    type: 'comment_format',
    description: 'Place inline comments inside branch blocks on new indented lines',
    originalSnippet: `if (ecAff_IsInf(x2, y2)) { // (X2, Y2) is point at infinity
    if (ecZZ_IsInf(zz1, zzz1)) return ecZZ_PointAtInf();
    return (x1, y1, zz1, zzz1);
} else if (ecZZ_IsInf(zz1, zzz1)) { // (X1, Y1) is point at infinity`,
    formattedSnippet: `if (ecAff_IsInf(x2, y2)) {
    // (X2, Y2) is point at infinity
    if (ecZZ_IsInf(zz1, zzz1)) return ecZZ_PointAtInf();
    return (x1, y1, zz1, zzz1);
} else if (ecZZ_IsInf(zz1, zzz1)) {
    // (X1, Y1) is point at infinity`,
  },
  {
    file: 'src/libraries/P256Verifier.sol',
    line: 335,
    type: 'signature_style',
    description: 'Format ecZZ_double_zz and ecZZ_double_affine function parameter wrappers',
    originalSnippet: `function ecZZ_double_zz(uint256 x1,
    uint256 y1, uint256 zz1, uint256 zzz1) internal pure returns (uint256 x3, uint256 y3, uint256 zz3, uint256 zzz3) {`,
    formattedSnippet: `function ecZZ_double_zz(uint256 x1, uint256 y1, uint256 zz1, uint256 zzz1)
    internal
    pure
    returns (uint256 x3, uint256 y3, uint256 zz3, uint256 zzz3)
{`,
  },
  {
    file: 'script/Deploy.s.sol',
    line: 100,
    type: 'multiline_arg',
    description: 'Format assetSymbol envOr ternary call cleanly across two lines',
    originalSnippet: `c.assetSymbol = vm.envOr(
    "ASSET_SYMBOL", c.asset == address(0) ? string("DemoUSD") : string("MUSD")
);`,
    formattedSnippet: `c.assetSymbol =
    vm.envOr("ASSET_SYMBOL", c.asset == address(0) ? string("DemoUSD") : string("MUSD"));`,
  },
];
