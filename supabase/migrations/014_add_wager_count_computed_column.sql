-- =====================================================================
-- 014: Add wager_count computed column to bets
-- This allows fetching the count of active (non-canceled) wagers
-- directly on the bet object using Supabase's computed column feature.
-- =====================================================================

CREATE OR REPLACE FUNCTION wager_count(bet_row bets)
RETURNS bigint AS $$
BEGIN
    RETURN (
        SELECT count(*)
        FROM wagers
        WHERE bet_id = bet_row.id
          AND status != 'canceled'
    );
END;
$$ LANGUAGE plpgsql STABLE;
