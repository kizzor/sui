export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const {
      Connection, Keypair, PublicKey, Transaction,
      TransactionInstruction, SYSVAR_SLOT_HASHES_PUBKEY
    } = await import('@solana/web3.js')

    const PROGRAM_ID = new PublicKey('5ZFVc4h5Z6ccuxCRNM1Ubr1LC5cv6bvPugYFMJMgRU31')

    const keyArr = JSON.parse(process.env.AUTHORITY_KEYPAIR || '[]')
    if (!keyArr.length) throw new Error('AUTHORITY_KEYPAIR not set')
    const authority = Keypair.fromSecretKey(Uint8Array.from(keyArr))

    const rpc = process.env.RPC_URL || 'https://api.devnet.solana.com'
    const connection = new Connection(rpc, 'confirmed')

    const [sessionKey] = PublicKey.findProgramAddressSync(
      [Buffer.from('session'), authority.publicKey.toBuffer()],
      PROGRAM_ID
    )

    const sessionInfo = await connection.getAccountInfo(sessionKey)
    if (!sessionInfo) {
      return NextResponse.json({ ok: false, msg: 'No session found — initialize first' })
    }

    const data = sessionInfo.data
    const active = data[437] === 1
    if (!active) {
      return NextResponse.json({ ok: false, msg: 'Session not active' })
    }

    // Correct discriminator for draw_number instruction
    const disc = Buffer.from([144, 134, 159, 234, 135, 217, 134, 239])

    const ix = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: authority.publicKey,       isSigner: true,  isWritable: false },
        { pubkey: sessionKey,                isSigner: false, isWritable: true  },
        { pubkey: SYSVAR_SLOT_HASHES_PUBKEY, isSigner: false, isWritable: false },
      ],
      data: disc,
    })

    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash('confirmed')
    const tx = new Transaction({ blockhash, lastValidBlockHeight, feePayer: authority.publicKey })
    tx.add(ix)
    tx.sign(authority)

    const sig = await connection.sendRawTransaction(tx.serialize())
    await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed')

    const updated = await connection.getAccountInfo(sessionKey)
    const drawCount = updated?.data[181] ?? 0
    const lastNum   = updated?.data[182] ?? 0

    return NextResponse.json({ ok: true, sig: sig.slice(0,16)+'...', number: lastNum, drawCount, ts: Date.now() })

  } catch (e: any) {
    // Sanitize error - don't leak internal details
    console.error('Draw error:', e)
    return NextResponse.json({ ok: false, error: 'Draw failed' }, { status: 500 })
  }
}
