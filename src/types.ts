export interface DeploymentConfig {
  chainId: number;
  chainName: string;
  currency: string;
  explorerUrl: string;
  agentId: number;
  agentName: string;
  agentURI: string;
  assetSymbol: string;
  rpId: string;
  origin: string;
  deployer: string;
  payee: string;
  contracts: {
    AgentExecutor: string;
    DemoSafe: string;
    DemoUSD: string;
    P256Verifier: string;
    WitnessIntentRegistry: string;
    WitnessVerifier: string;
  };
  safeFunding: string;
}

export interface AgentRequest {
  id: string;
  title: string;
  agent: string;
  prompt: string;
  recipient: string;
  recipientLabel: string;
  amount: number;
  assetSymbol: string;
  category: 'compute' | 'data' | 'injection_attack' | 'unauthorized';
  isAttack: boolean;
  attackDetails?: string;
  timestamp: number;
  status: 'pending' | 'approved' | 'blocked' | 'expired';
  txHash?: string;
  revertReason?: string;
}

export interface PasskeyData {
  credentialId: string;
  qx: string;
  qy: string;
  algorithm: string;
  rpId: string;
  enrolledAt: number;
}

export interface IntentPolicy {
  ceiling: number;
  currentSpent: number;
  windowMinutes: number;
  expiresAt: number;
  singleUse: boolean;
  assetSymbol: string;
}

export interface DiffEntry {
  file: string;
  line: number;
  type: 'comment_format' | 'constant_inline' | 'signature_style' | 'whitespace' | 'multiline_arg';
  description: string;
  originalSnippet: string;
  formattedSnippet: string;
}
