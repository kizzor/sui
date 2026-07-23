/**
 * init-session.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Initializes a new Ransome game session on devnet/mainnet.
 * Run this after rotating secrets to set up a fresh session.
 *
 * Usage:
 *   node init-session.mjs
 *
 * Environment variables required:
 *   - AUTHORITY_KEYPAIR: JSON array of authority secret key bytes
 *   - SESSION_AUTHORITY: Public key of session authority
 *   - RPC_URL: Solana RPC endpoint (defaults to devnet)
 */

import { Connection, Keypair, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

// ─── Configuration ────────────────────────────────────────────────────────────
const RPC_URL = process.env.RPC_URL || 'https://api.devnet.solana.com';
const PROGRAM_ID_STR = '5ZFVc4h5Z6ccuxCRNM1Ubr1LC5cv6bvPugYFMJMgRU31';

// ─── Load Authority Keypair ───────────────────────────────────────────────────
function loadAuthorityKeypair() {
  // Try environment variable first
  if (process.env.AUTHORITY_KEYPAIR) {
    const secretKey = Uint8Array.from(JSON.parse(process.env.AUTHORITY_KEYPAIR));
    return Keypair.fromSecretKey(secretKey);
  }
  
  // Try default keypair location
  const keypairPath = join(homedir(), '.config', 'solana', 'ransome-authority.json');
  try {
    const keypairData = JSON.parse(readFileSync(keypairPath, 'utf-8'));
    return Keypair.fromSecretKey(Uint8Array.from(keypairData));
  } catch (e) {
    console.error('[ERROR] Could not load authority keypair');
    console.error('  Set AUTHORITY_KEYPAIR env var or create ~/.config/solana/ransome-authority.json');
    process.exit(1);
  }
}

// ─── Load Session Authority ───────────────────────────────────────────────────
function loadSessionAuthority() {
  if (process.env.SESSION_AUTHORITY) {
    return new PublicKey(process.env.SESSION_AUTHORITY);
  }
  
  // Use authority's public key as session authority
  const authority = loadAuthorityKeypair();
  return authority.publicKey;
}

// ─── Derive PDAs ──────────────────────────────────────────────────────────────
function getSessionPda(sessionAuth, programId) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('session'), sessionAuth.toBuffer()],
    programId
  )[0];
}

function getVaultPda(sessionKey, programId) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('vault'), sessionKey.toBuffer()],
    programId
  )[0];
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('=' .repeat(60));
  console.log('RANSOME DAPP - Session Initialization');
  console.log('=' .repeat(60));
  console.log();
  
  // Setup
  const connection = new Connection(RPC_URL, 'confirmed');
  const authority = loadAuthorityKeypair();
  const sessionAuth = loadSessionAuthority();
  const programId = new PublicKey(PROGRAM_ID_STR);
  
  console.log('Configuration:');
  console.log(`  RPC URL: ${RPC_URL}`);
  console.log(`  Program ID: ${programId.toBase58()}`);
  console.log(`  Authority: ${authority.publicKey.toBase58()}`);
  console.log(`  Session Auth: ${sessionAuth.toBase58()}`);
  console.log();
  
  // Derive PDAs
  const sessionKey = getSessionPda(sessionAuth, programId);
  const vaultKey = getVaultPda(sessionKey, programId);
  
  console.log('Derived Addresses:');
  console.log(`  Session PDA: ${sessionKey.toBase58()}`);
  console.log(`  Vault PDA: ${vaultKey.toBase58()}`);
  console.log();
  
  // Check if session already exists
  const sessionInfo = await connection.getAccountInfo(sessionKey);
  if (sessionInfo) {
    console.log('[WARNING] Session already exists at this address');
    console.log('  To create a new session, rotate to a new SESSION_AUTHORITY');
    console.log();
  }
  
  // Check authority balance
  const balance = await connection.getBalance(authority.publicKey);
  console.log(`Authority Balance: ${balance / LAMPORTS_PER_SOL} SOL`);
  
  if (balance < 0.1 * LAMPORTS_PER_SOL) {
    console.log('[WARNING] Low balance - you may need to airdrop SOL for testing');
    console.log('  Run: solana airdrop 2 --url devnet');
    console.log();
  }
  
  console.log();
  console.log('Session initialization requires the on-chain program.');
  console.log('This script provides the addresses you need to configure.');
  console.log();
  console.log('Next Steps:');
  console.log('  1. Ensure authority has SOL for transaction fees');
  console.log('  2. Call initialize_session on the Solana program');
  console.log('  3. Update SESSION_AUTHORITY in your .env.local');
  console.log('  4. Redeploy to Vercel');
  console.log();
  
  // Output for easy copy-paste
  console.log('='.repeat(60));
  console.log('COPY THESE VALUES TO YOUR .env.local:');
  console.log('='.repeat(60));
  console.log();
  console.log(`SESSION_AUTHORITY=${sessionAuth.toBase58()}`);
  console.log();
}

main().catch(console.error);
