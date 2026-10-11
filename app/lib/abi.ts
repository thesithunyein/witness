/**
 * Minimal ABI fragments for the Witness stack.
 *
 * The Reason enum order MUST match `contracts/src/interfaces/IWitness.sol`.
 * It is duplicated here rather than generated so the mapping from a blocked
 * action to a human-readable explanation is explicit and reviewable.
 */

import { keccak256, toBytes } from "viem";

export const REASON_NAMES = [
  "Allowed",
  "NoSuchIntent",
  "Revoked",
  "Expired",
  "AlreadyConsumed",
  "WrongAgent",
  "AgentNotRegistered",
  "ActionTypeMismatch",
  "OverLimit",
  "RpIdMismatch",
  "NoUserPresence",
  "NoUserVerification",
  "WrongType",
  "ChallengeMismatch",
  "OriginMismatch",
  "BadSignature",
] as const;

/** Plain-language explanations, because "reason 8" helps nobody. */
export const REASON_MESSAGES: Record<string, string> = {
  Allowed: "The human approved this exact action.",
  NoSuchIntent: "No such permission exists.",
  Revoked: "The human revoked this permission.",
  Expired: "This permission expired.",
  AlreadyConsumed: "This one-time permission was already used.",
  WrongAgent: "A different agent tried to use this approval.",
  AgentNotRegistered: "The agent does not own the ERC-8004 identity it claims.",
  ActionTypeMismatch: "This permission does not cover that kind of action.",
  OverLimit: "The requested amount exceeds what the human approved.",
  RpIdMismatch: "The passkey assertion came from a different relying party.",
  NoUserPresence: "No human was present for the approval.",
  NoUserVerification: "The approval did not include biometric or PIN verification.",
  WrongType: "A passkey registration ceremony cannot authorize an action.",
  ChallengeMismatch: "The human approved a different action.",
  OriginMismatch: "The approval came from a different origin.",
  BadSignature: "The approval signature is not valid for this action.",
};

export const assertionComponents = [
  {
    name: "assertion",
    type: "tuple",
    components: [
      { name: "authenticatorData", type: "bytes" },
      { name: "clientDataJSON", type: "bytes" },
      { name: "r", type: "uint256" },
      { name: "s", type: "uint256" },
    ],
  },
] as const;

export const witnessVerifierAbi = [
  {
    type: "error",
    name: "Unauthorized",
    inputs: [{ name: "reason", type: "uint8" }],
  },
  {
    type: "function",
    name: "check",
    stateMutability: "view",
    inputs: [
      { name: "intentId", type: "uint256" },
      { name: "actionType", type: "bytes32" },
      { name: "actionHash", type: "bytes32" },
      { name: "amount", type: "uint256" },
      { name: "actor", type: "address" },
      ...assertionComponents,
    ],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "intentRegistry",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "rpId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "origin",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
] as const;

export const intentRegistryAbi = [
  {
    type: "function",
    name: "createIntent",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentWallet", type: "address" },
      { name: "agentId", type: "uint256" },
      { name: "actionType", type: "bytes32" },
      { name: "maxAmount", type: "uint256" },
      { name: "expiry", type: "uint64" },
      { name: "policyHash", type: "bytes32" },
      { name: "credentialHash", type: "bytes32" },
      { name: "qx", type: "uint256" },
      { name: "qy", type: "uint256" },
    ],
    outputs: [{ name: "intentId", type: "uint256" }],
  },
  {
    type: "function",
    name: "revokeIntent",
    stateMutability: "nonpayable",
    inputs: [{ name: "intentId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "getIntent",
    stateMutability: "view",
    inputs: [{ name: "intentId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "user", type: "address" },
          { name: "agentWallet", type: "address" },
          { name: "agentId", type: "uint256" },
          { name: "actionType", type: "bytes32" },
          { name: "maxAmount", type: "uint256" },
          { name: "expiry", type: "uint64" },
          { name: "policyHash", type: "bytes32" },
          { name: "credentialHash", type: "bytes32" },
          { name: "qx", type: "uint256" },
          { name: "qy", type: "uint256" },
          { name: "createdAt", type: "uint64" },
          { name: "revoked", type: "bool" },
          { name: "consumed", type: "bool" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "isActive",
    stateMutability: "view",
    inputs: [{ name: "intentId", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "nextIntentId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export const demoSafeAbi = [
  {
    type: "error",
    name: "HashMismatch",
    inputs: [],
  },
  {
    type: "function",
    name: "actionHash",
    stateMutability: "view",
    inputs: [
      { name: "intentId", type: "uint256" },
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    type: "function",
    name: "balance",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export const agentExecutorAbi = [
  {
    type: "function",
    name: "executeTransfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "intentId", type: "uint256" },
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
      ...assertionComponents,
    ],
    outputs: [{ name: "actionHash", type: "bytes32" }],
  },
  {
    type: "function",
    name: "operator",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "event",
    name: "TransferAttempted",
    inputs: [
      { name: "intentId", type: "uint256", indexed: true },
      { name: "operator_", type: "address", indexed: true },
      { name: "actionHash", type: "bytes32", indexed: false },
      { name: "to", type: "address", indexed: false },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
] as const;

export const demoUsdAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
] as const;

/**
 * keccak256("witness.action.transfer") — the transfer domain tag.
 *
 * Derived rather than hardcoded: a literal here could silently drift from the
 * constant in WitnessAction.sol and every check would then fail with
 * ActionTypeMismatch for no visible reason.
 */
export const TRANSFER_ACTION_TYPE = keccak256(toBytes("witness.action.transfer"));
