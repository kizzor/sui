export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from 'next/server'

// Win type payouts (basis points)
const WIN_PAYOUTS: Record<number, number> = {
  0: 500,   // EarlyFive: 5%
  1: 500,   // TopLine: 5%
  2: 500,   // MiddleLine: 5%
  3: 500,   // BottomLine: 5%
  4: 1000,  // FullHouse1: 10%
  5: 1000,  // FullHouse2: 10%
  6: 2000,  // FullHouse3: 20%
}

export async function POST(req: Request) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { wallet, winType } = await req.json()

    // Validate inputs
    if (!wallet || typeof wallet !== 'string') {
      return NextResponse.json({ ok: false, error: 'Invalid wallet' }, { status: 400 })
    }
    if (winType === undefined || typeof winType !== 'number' || winType < 0 || winType > 6) {
      return NextResponse.json({ ok: false, error: 'Invalid win type' }, { status: 400 })
    }

    const {
      Connection, Keypair, PublicKey, Transaction,
      TransactionInstruction, SystemProgram
    } = await import('@solana/web3.js')

    const PROGRAM_ID = new PublicKey('5ZFVc4h5Z6ccuxCRNM1Ubr1LC5cv6bvPugYFMJMgRU31')

    const keyArr = JSON.parse(process.env.AUTHORITY_KEYPAIR || '[]')
    if (!keyArr.length) throw new Error('AUTHORITY_KEYPAIR not set')
    const authority = Keypair.fromSecretKey(Uint8Array.from(keyArr))

    const rpc = process.env.RPC_URL || 'https://api.devnet.solana.com'
    const connection = new Connection(rpc, 'confirmed')

    // Derive session PDA
    const [sessionKey] = PublicKey.findProgramAddressSync(
      [Buffer.from('session'), authority.publicKey.toBuffer()],
      PROGRAM_ID
    )

    // Check session exists and is active
    const sessionInfo = await connection.getAccountInfo(sessionKey)
    if (!sessionInfo) {
      return NextResponse.json({ ok: false, error: 'No session found' }, { status: 404 })
    }

    // Verify win is not already claimed (read from session data)
    const data = sessionInfo.data
    const winsClaimed = Array.from(data.slice(191, 198)).map(b => b === 1)
    if (winsClaimed[winType]) {
      return NextResponse.json({ ok: false, error: 'Win already claimed' }, { status: 400 })
    }

    // Calculate payout
    const vaultTotal = Number(data.readBigUInt64LE(74))
    const payoutBps = WIN_PAYOUTS[winType]
    const payout = Math.floor(vaultTotal * payoutBps / 10_000)

    if (payout <= 0) {
      return NextResponse.json({ ok: false, error: 'Zero payout' }, { status: 400 })
    }

    // Derive vault PDA
    const [vaultKey] = PublicKey.findProgramAddressSync(
      [Buffer.from('vault'), sessionKey.toBuffer()],
      PROGRAM_ID
    )

    // Check vault has enough
    const vaultBalance = await connection.getBalance(vaultKey)
    if (vaultBalance < payout) {
      return NextResponse.json({ ok: false, error: 'Insufficient vault balance' }, { status: 400 })
    }

    // Build claim_win instruction
    // Discriminator for claim_win: [163, 215, 101, 246, 25, 134, 110, 194]
    const disc = Buffer.from([163, 215, 101, 246, 25, 134, 110, 194])
    const winTypeBuf = Buffer.alloc(1)
    winTypeBuf.writeUInt8(winType)

    const winnerPubkey = new PublicKey(wallet)

    const ix = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: winnerPubkey,  isSigner: true,  isWritable: true  },
        { pubkey: sessionKey,    isSigner: false, isWritable: true  },
        { pubkey: vaultKey,      isSigner: false, isWritable: true  },
      ],
      data: Buffer.concat([disc, winTypeBuf]),
    })

    // NOTE: In production, this transaction should be signed by the winner
    // The server builds and simulates, but the user signs from their wallet
    // For now, we return the transaction for the user to sign

    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash('confirmed')

    return NextResponse.json({
      ok: true,
      payout,
      payoutSol: payout / 1e9,
      winType,
      session: sessionKey.toBase58(),
      vault: vaultKey.toBase58(),
      // Return transaction for user to sign
      transaction: {
        instructions: [{
          programId: PROGRAM_ID.toBase58(),
          keys: [
            { pubkey: wallet, isSigner: true, isWritable: true },
            { pubkey: sessionKey.toBase58(), isSigner: false, isWritable: true },
            { pubkey: vaultKey.toBase58(), isSigner: false, isWritable: true },
          ],
          data: Buffer.concat([disc, winTypeBuf]).toString('base64'),
        }],
        blockhash,
        lastValidBlockHeight,
      }
    })

  } catch (e: any) {
    console.error('Claim win error:', e)
    return NextResponse.json({ ok: false, error: 'Claim failed' }, { status: 500 })
  }
}
