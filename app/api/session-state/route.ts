export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const { Connection, PublicKey } = await import('@solana/web3.js')
    const authStr = process.env.SESSION_AUTHORITY || 'jwuKUJaDZDP1zPqrYhTshc5kQswoRNK2YMZw5cokcAR'
    if (!authStr || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(authStr)) {
      return NextResponse.json({ ok: false, msg: 'No valid session authority configured' })
    }
    const PROGRAM_ID = new PublicKey('5ZFVc4h5Z6ccuxCRNM1Ubr1LC5cv6bvPugYFMJMgRU31')
    const SESSION_AUTH = new PublicKey(authStr)
    const [sessionKey] = PublicKey.findProgramAddressSync(
      [Buffer.from('session'), SESSION_AUTH.toBuffer()], PROGRAM_ID
    )
    const connection = new Connection(process.env.RPC_URL || 'https://api.devnet.solana.com', 'confirmed')
    const info = await connection.getAccountInfo(sessionKey)
    if (!info) return NextResponse.json({ ok: false, msg: 'No session' })

    const data = info.data
    const vaultTotal    = Number(data.readBigUInt64LE(74))
    const vaultPaid     = Number(data.readBigUInt64LE(82))
    const drawCount     = data[181]
    const lastNumber    = data[182]
    const startedAt     = Number(data.readBigInt64LE(183))
    const winsClaimed   = Array.from(data.slice(191, 198)).map(b => b === 1)
    const active        = data[198] === 1
    const bankruptCount = data[199]
    const drawn         = Array.from(data.slice(91, 181)).filter(n => n > 0)

    return NextResponse.json({
      ok: true, session: sessionKey.toBase58(),
      active, drawCount, lastNumber, drawn, startedAt,
      vaultTotal, vaultPaid, bankruptCount, winsClaimed,
      ts: Date.now()
    })
  } catch (e: any) {
    console.error('Session state error:', e.message)
    return NextResponse.json({ ok: false, error: 'Session unavailable' }, { status: 500 })
  }
}