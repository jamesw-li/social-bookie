-- =====================================================================
-- 013: Fix bets schema alignment
-- Add missing created_at and campaign_id to the 'bets' table.
-- =====================================================================

-- 1. Add created_at if missing
ALTER TABLE bets ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- 2. Add campaign_id if missing (to match specialty bets)
ALTER TABLE bets ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id);

-- 3. Backfill campaign_id from events
-- This connects the bet to the campaign via its linked event.
UPDATE bets b
SET campaign_id = e.campaign_id
FROM events e
WHERE b.event_id = e.id
AND b.campaign_id IS NULL;

-- 4. Clean up any orphaned bets (optional, safety first)
-- If a bet has no event_id and no campaign_id, we can't easily auto-fix it.
-- But since hosts usually create bets within a campaign session, it's rare.
