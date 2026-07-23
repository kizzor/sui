// ransome-minimal.rs
// Minimal Solana program for RANSOME DAPP
// Only 3 instructions: init_session, deposit, claim_win

use anchor_lang::prelude::*;

declare_id!("5ZFVc4h5Z6ccuxCRNM1Ubr1LC5cv6bvPugYFMJMgRU31");

#[program]
pub mod ransome_minimal {
    use super::*;

    // ─── 1. Initialize Session ─────────────────────────────────────────────
    // Creates vault PDA to hold player deposits
    // Cost: ~0.05 SOL (one-time per session)
    pub fn initialize_session(ctx: Context<InitializeSession>) -> Result<()> {
        let session = &mut ctx.accounts.session;
        session.authority = ctx.accounts.authority.key();
        session.vault_bump = ctx.bumps.vault;
        session.active = true;
        session.started_at = Clock::get()?.unix_timestamp;
        session.draw_count = 0;
        session.last_number = 0;
        session.bankrupt_count = 0;
        session.wins_claimed = [false; 7];
        Ok(())
    }

    // ─── 2. Deposit (Player Mints Device) ──────────────────────────────────
    // Player sends SOL to vault
    // Price: 0.00333 SOL ($0.50 at $150/SOL)
    // Max: 20 devices per wallet
    // Cost to player: ~0.000005 SOL tx fee only
    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        let session = &mut ctx.accounts.session;
        require!(session.active, RansomeError::SessionInactive);
        
        // Fixed price: 0.00333 SOL ($0.50)
        let price = 3_330_000; // lamports
        require!(amount >= price, RansomeError::InsufficientPayment);
        
        // Transfer SOL to vault
        let ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.player.key(),
            &ctx.accounts.vault.key(),
            amount,
        );
        anchor_lang::solana_program::program::invoke(
            &ix,
            &[
                ctx.accounts.player.to_account_info(),
                ctx.accounts.vault.to_account_info(),
            ],
        )?;
        
        // Track deposit
        session.vault_total += amount;
        Ok(())
    }

    // ─── 3. Claim Win ──────────────────────────────────────────────────────
    // Validates win and pays from vault
    // Server submits this after validating off-chain
    // Cost: ~0.00001 SOL (tx fee)
    pub fn claim_win(ctx: Context<ClaimWin>, win_type: u8) -> Result<()> {
        let session = &mut ctx.accounts.session;
        require!(session.active, RansomeError::SessionInactive);
        require!(!session.wins_claimed[win_type as usize], RansomeError::AlreadyClaimed);
        
        // Calculate payout based on win type
        let payout_bps = match win_type {
            0 => 1000,  // EarlyFive: 10%
            1 => 1000,  // TopLine: 10%
            2 => 1000,  // MiddleLine: 10%
            3 => 1000,  // BottomLine: 10%
            4 => 1500,  // FullHouse1: 15%
            5 => 1500,  // FullHouse2: 15%
            6 => 3000,  // FullHouse3: 30%
            _ => return Err(RansomeError::InvalidWinType.into()),
        };
        
        let payout = session.vault_total * payout_bps / 10_000;
        require!(payout > 0, RansomeError::ZeroPayout);
        require!(
            ctx.accounts.vault.lamports() >= payout,
            RansomeError::InsufficientVault
        );
        
        // Transfer from vault to winner
        **ctx.accounts.vault.try_borrow_mut_lamports()? -= payout;
        **ctx.accounts.winner.try_borrow_mut_lamports()? += payout;
        
        // Mark win as claimed
        session.wins_claimed[win_type as usize] = true;
        session.vault_paid += payout;
        
        Ok(())
    }
}

// ─── Accounts ────────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct InitializeSession<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        init,
        payer = authority,
        space = 8 + Session::INIT_SPACE,
        seeds = [b"session", authority.key().as_ref()],
        bump,
    )]
    pub session: Account<'info, Session>,
    
    /// CHECK: Vault PDA
    #[account(
        mut,
        seeds = [b"vault", session.key().as_ref()],
        bump,
    )]
    pub vault: SystemAccount<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub player: Signer<'info>,
    
    #[account(mut)]
    pub session: Account<'info, Session>,
    
    /// CHECK: Vault PDA
    #[account(
        mut,
        seeds = [b"vault", session.key().as_ref()],
        bump = session.vault_bump,
    )]
    pub vault: SystemAccount<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimWin<'info> {
    #[account(mut)]
    pub winner: Signer<'info>,
    
    #[account(mut)]
    pub session: Account<'info, Session>,
    
    /// CHECK: Vault PDA
    #[account(
        mut,
        seeds = [b"vault", session.key().as_ref()],
        bump = session.vault_bump,
    )]
    pub vault: SystemAccount<'info>,
}

// ─── State ───────────────────────────────────────────────────────────────────

#[account]
#[derive(InitSpace)]
pub struct Session {
    pub authority: Pubkey,      // 32
    pub vault_bump: u8,         // 1
    pub active: bool,           // 1
    pub started_at: i64,        // 8
    pub draw_count: u8,         // 1
    pub last_number: u8,        // 1
    pub bankrupt_count: u8,     // 1
    pub wins_claimed: [bool; 7],// 7
    pub vault_total: u64,       // 8
    pub vault_paid: u64,        // 8
    // Total: ~68 bytes + 8 discriminator = 76 bytes
}

// ─── Errors ──────────────────────────────────────────────────────────────────

#[error_code]
pub enum RansomeError {
    #[msg("Session is not active")]
    SessionInactive,
    #[msg("Insufficient payment")]
    InsufficientPayment,
    #[msg("Win already claimed")]
    AlreadyClaimed,
    #[msg("Invalid win type")]
    InvalidWinType,
    #[msg("Zero payout")]
    ZeroPayout,
    #[msg("Insufficient vault balance")]
    InsufficientVault,
}
