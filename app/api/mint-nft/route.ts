export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from 'next/server'

// USDC on Solana Mainnet
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const USDC_DECIMALS = 6
const DEVICE_PRICE_USDC = 500_000 // $0.50 = 500,000 USDC lamports

export async function POST(req: Request) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { wallet, deviceCount } = await req.json()

    // Validate inputs
    if (!wallet || typeof wallet !== 'string') {
      return NextResponse.json({ ok: false, error: 'Invalid wallet' }, { status: 400 })
    }
    if (!deviceCount || deviceCount < 1 || deviceCount > 20) {
      return NextResponse.json({ ok: false, error: 'Device count must be 1-20' }, { status: 400 })
    }

    const {
      Connection, PublicKey, Transaction, TransactionInstruction,
      SYSVAR_RENT_PUBKEY, SystemProgram
    } = await import('@solana/web3.js')
    const { Token, TOKEN_PROGRAM_ID } = await import('@solana/spl-token')

    const PROGRAM_ID = new PublicKey('5ZFVc4h5Z6ccuxCRNM1Ubr1LC5cv6bvPugYFMJMgRU31')
    const rpc = process.env.RPC_URL || 'https://api.devnet.solana.com'
    const connection = new Connection(rpc, 'confirmed')

    const playerPubkey = new PublicKey(wallet)

    // Derive session and vault PDAs
    const SESSION_AUTH = new PublicKey(process.env.SESSION_AUTHORITY || wallet)
    const [sessionKey] = PublicKey.findProgramAddressSync(
      [Buffer.from('session'), SESSION_AUTH.toBuffer()],
      PROGRAM_ID
    )
    const [vaultKey] = PublicKey.findProgramAddressSync(
      [Buffer.from('vault'), sessionKey.toBuffer()],
      PROGRAM_ID
    )

    // Check session is active
    const sessionInfo = await connection.getAccountInfo(sessionKey)
    if (!sessionInfo) {
      return NextResponse.json({ ok: false, error: 'No session found' }, { status: 404 })
    }

    // Calculate total cost
    const totalCost = DEVICE_PRICE_USDC * deviceCount

    // Build USDC transfer instruction
    const usdcMint = new PublicKey(USDC_MINT)

    // Get or create player's USDC token account
    const playerUsdcAccount = await Token.getAssociatedTokenAddress(
      new PublicKey(USDC_MINT),
      playerPubkey
    )

    // Get or create vault's USDC token account
    const vaultUsdcAccount = await Token.getAssociatedTokenAddress(
      new PublicKey(USDC_MINT),
      vaultKey,
      true // allowOwnerOffCurve for PDA
    )

    // Build mint_nft instruction with USDC payment
    // Discriminator for mint_nft: [221, 153, 233, 246, 235, 174, 224, 11]
    const disc = Buffer.from([221, 153, 233, 246, 235, 174, 224, 11])
    const amountBuf = Buffer.alloc(8)
    amountBuf.writeBigUInt64LE(BigInt(totalCost))

    const ix = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: playerPubkey,      isSigner: true,  isWritable: true  },
        { pubkey: sessionKey,        isSigner: false, isWritable: true  },
        { pubkey: vaultKey,          isSigner: false, isWritable: true  },
        { pubkey: playerUsdcAccount, isSigner: false, isWritable: true  },
        { pubkey: vaultUsdcAccount,  isSigner: false, isWritable: true  },
        { pubkey: usdcMint,          isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID,  isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: Buffer.concat([disc, amountBuf]),
    })

    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash('confirmed')

    return NextResponse.json({
      ok: true,
      deviceCount,
      totalCostUSDC: totalCost / Math.pow(10, USDC_DECIMALS),
      totalCostRaw: totalCost,
      usdcMint: USDC_MINT,
      session: sessionKey.toBase58(),
      vault: vaultKey.toBase58(),
      // Return transaction for user to sign
      transaction: {
        instructions: [{
          programId: PROGRAM_ID.toBase58(),
          keys: ix.keys.map(k => ({
            pubkey: k.pubkey.toBase58(),
            isSigner: k.isSigner,
            isWritable: k.isWritable,
          })),
          data: ix.data.toString('base64'),
        }],
        blockhash,
        lastValidBlockHeight,
      }
    })

  } catch (e: any) {
    console.error('Mint error:', e)
    return NextResponse.json({ ok: false, error: 'Mint failed' }, { status: 500 })
  }
}
