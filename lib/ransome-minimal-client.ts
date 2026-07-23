/**
 * ransome-minimal-client.ts
 * Minimal client for the RANSOME DAPP
 * Only handles: deposit, claim_win
 * Everything else is off-chain
 */

import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";

// ─── Constants ───────────────────────────────────────────────────────────────

export const PROGRAM_ID = new PublicKey(
  "5ZFVc4h5Z6ccuxCRNM1Ubr1LC5cv6bvPugYFMJMgRU31"
);

// Fixed price: $0.50 USD (0.00333 SOL at $150/SOL)
export const DEVICE_PRICE_LAMPORTS = 3_330_000;
export const DEVICE_PRICE_SOL = DEVICE_PRICE_LAMPORTS / LAMPORTS_PER_SOL;

// Max devices per wallet
export const MAX_DEVICES_PER_WALLET = 20;

// Win type payouts (basis points)
export const WIN_PAYOUTS = {
  EARLY_FIVE: 1000,   // 10%
  TOP_LINE: 1000,     // 10%
  MIDDLE_LINE: 1000,  // 10%
  BOTTOM_LINE: 1000,  // 10%
  FULL_HOUSE_1: 1500, // 15%
  FULL_HOUSE_2: 1500, // 15%
  FULL_HOUSE_3: 3000, // 30%
} as const;

// ─── PDA Derivation ─────────────────────────────────────────────────────────

export function getSessionPda(authority: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("session"), authority.toBuffer()],
    PROGRAM_ID
  );
}

export function getVaultPda(sessionKey: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), sessionKey.toBuffer()],
    PROGRAM_ID
  );
}

// ─── Client Class ────────────────────────────────────────────────────────────

export class RansomeMinimalClient {
  private connection: Connection;
  private wallet: { publicKey: PublicKey; sendTransaction: Function };

  constructor(
    connection: Connection,
    wallet: { publicKey: PublicKey; sendTransaction: Function }
  ) {
    this.connection = connection;
    this.wallet = wallet;
  }

  /**
   * Deposit SOL to vault (mint device)
   * @param deviceCount - Number of devices (1-20)
   * @returns Transaction signature
   */
  async deposit(deviceCount: number): Promise<string> {
    if (deviceCount < 1 || deviceCount > MAX_DEVICES_PER_WALLET) {
      throw new Error(`Device count must be 1-${MAX_DEVICES_PER_WALLET}`);
    }

    const [sessionKey] = getSessionPda(this.wallet.publicKey);
    const [vaultKey] = getVaultPda(sessionKey);

    const totalAmount = DEVICE_PRICE_LAMPORTS * deviceCount;

    // Build deposit instruction
    const instruction = {
      keys: [
        { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: sessionKey, isSigner: false, isWritable: true },
        { pubkey: vaultKey, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: PROGRAM_ID,
      data: Buffer.from([
        // Instruction discriminator for 'deposit' (first 8 bytes of sha256("global:deposit"))
        // You'll need to compute this from the actual Anchor IDL
        0, 0, 0, 0, 0, 0, 0, 0,
        // Amount as u64 LE
        ...new Uint8Array(new BigInt(totalAmount).toString(16).padStart(16, '0').match(/.{2}/g)!.reverse().map(b => parseInt(b, 16)))
      ]),
    };

    const tx = new Transaction().add(instruction);
    tx.feePayer = this.wallet.publicKey;
    tx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;

    const sig = await this.wallet.sendTransaction(tx, this.connection);
    return sig;
  }

  /**
   * Claim win (called by server after validation)
   * @param winType - 0-6 for different win types
   * @returns Transaction signature
   */
  async claimWin(winType: number): Promise<string> {
    if (winType < 0 || winType > 6) {
      throw new Error("Invalid win type");
    }

    const [sessionKey] = getSessionPda(this.wallet.publicKey);
    const [vaultKey] = getVaultPda(sessionKey);

    // Build claim_win instruction
    const instruction = {
      keys: [
        { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: sessionKey, isSigner: false, isWritable: true },
        { pubkey: vaultKey, isSigner: false, isWritable: true },
      ],
      programId: PROGRAM_ID,
      data: Buffer.from([
        // Instruction discriminator for 'claim_win'
        0, 0, 0, 0, 0, 0, 0, 0,
        // Win type as u8
        winType,
      ]),
    };

    const tx = new Transaction().add(instruction);
    tx.feePayer = this.wallet.publicKey;
    tx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;

    const sig = await this.wallet.sendTransaction(tx, this.connection);
    return sig;
  }

  /**
   * Get vault balance
   */
  async getVaultBalance(sessionAuthority: PublicKey): Promise<number> {
    const [sessionKey] = getSessionPda(sessionAuthority);
    const [vaultKey] = getVaultPda(sessionKey);
    return this.connection.getBalance(vaultKey);
  }

  /**
   * Check how many devices a wallet has minted
   * (Read from off-chain database, not on-chain)
   */
  async getDeviceCount(walletAddress: PublicKey): Promise<number> {
    // This would call your API endpoint
    const response = await fetch(`/api/device-count?wallet=${walletAddress.toBase58()}`);
    const data = await response.json();
    return data.count || 0;
  }
}

// ─── Helper Functions ────────────────────────────────────────────────────────

export function calculatePayout(vaultTotal: number, winType: number): number {
  const bps = Object.values(WIN_PAYOUTS)[winType] || 0;
  return Math.floor(vaultTotal * bps / 10_000);
}

export function canMint(currentCount: number, additional: number): boolean {
  return currentCount + additional <= MAX_DEVICES_PER_WALLET;
}

export function getPriceForDevices(count: number): number {
  return DEVICE_PRICE_LAMPORTS * count;
}
