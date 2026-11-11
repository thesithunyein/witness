/**
 * The vault that owns a Mezo trove. Deployed by scripts/deploy-trove-vault.mjs;
 * the full record is contracts/deployments/31611-trove.json.
 */
export const TROVE_VAULT = {
  safe: '0xd180dd35522d1297b3cbaa5046b34850ae55569d',
  executor: '0x674777ba2c3f4011cffa0fbc34953d1abf3fd213',
  borrowerOperations: '0xCdF7028ceAB81fA0C6971208e83fa7872994beE5',
} as const;
