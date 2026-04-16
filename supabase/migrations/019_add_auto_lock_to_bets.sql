-- Migration: 019_add_auto_lock_to_bets.sql
-- Description: Adds trigger_type and lock_at to all betting tables and creates the auto-lock RPC.

-- 1. Add columns to bets
ALTER TABLE bets 
ADD COLUMN IF NOT EXISTS trigger_type TEXT DEFAULT 'manual',
ADD COLUMN IF NOT EXISTS lock_at TIMESTAMPTZ;

-- 2. Add columns to p2p_prop_bets
ALTER TABLE p2p_prop_bets 
ADD COLUMN IF NOT EXISTS trigger_type TEXT DEFAULT 'manual',
ADD COLUMN IF NOT EXISTS lock_at TIMESTAMPTZ;

-- 3. Add columns to blind_matchups
ALTER TABLE blind_matchups 
ADD COLUMN IF NOT EXISTS trigger_type TEXT DEFAULT 'manual',
ADD COLUMN IF NOT EXISTS lock_at TIMESTAMPTZ;

-- 4. Ensure Realtime is enabled for these tables
-- (In case they weren't added before, though they should be)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'bets'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE bets;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'p2p_prop_bets'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE p2p_prop_bets;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'blind_matchups'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE blind_matchups;
    END IF;
END $$;

-- 5. Create Auto-Lock RPC
CREATE OR REPLACE FUNCTION lock_expired_auto_bets()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Lock house bets
    UPDATE bets
    SET status = 'locked'
    WHERE status = 'open'
      AND trigger_type = 'auto'
      AND lock_at <= (NOW() + interval '10 seconds');

    -- Lock P2P bets (only if not already matched/locked by users)
    UPDATE p2p_prop_bets
    SET status = 'locked'
    WHERE status = 'open'
      AND trigger_type = 'auto'
      AND lock_at <= (NOW() + interval '10 seconds');

    -- Lock Blind Matchups
    UPDATE blind_matchups
    SET status = 'locked'
    WHERE status = 'open'
      AND trigger_type = 'auto'
      AND lock_at <= (NOW() + interval '10 seconds');
END;
$$;
