-- =====================================================================
-- 015: Fix ledger numerical mismatch for P2P and Blind matches
-- P2P 'wager_amount' is NUMERIC, but _write_ledger expects INTEGER.
-- This overload allows NUMERIC amounts and casts them to INTEGER.
-- =====================================================================

CREATE OR REPLACE FUNCTION _write_ledger(
    p_campaign_id UUID,
    p_user_id     UUID,
    p_type        TEXT,
    p_amount      NUMERIC,
    p_memo        TEXT
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    -- Cast the numeric amount to integer and call the primary ledger function
    PERFORM _write_ledger(
        p_campaign_id, 
        p_user_id, 
        p_type, 
        p_amount::INTEGER, 
        p_memo
    );
END;
$$;
