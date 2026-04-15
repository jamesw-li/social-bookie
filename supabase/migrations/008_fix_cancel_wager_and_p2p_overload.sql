-- =====================================================================
-- Migration 008: Fix cancel_wager + resolve claim_p2p_side overload
-- =====================================================================
--
-- Two bugs:
--
-- 1. cancel_wager was returning 400 in production. Two server-side issues:
--      a) UPDATE campaign_participants SET global_point_balance = ...
--         WHERE user_id = v_wager.user_id
--         — this omits campaign_id, so for a user in multiple campaigns
--         it updates ALL their participant rows (cross-campaign balance
--         contamination). On top of that, the ledger entry was written
--         against a campaign_id picked by LIMIT 1, which could differ
--         from the wager's actual campaign — and when it did, the
--         ledger balance snapshot was inconsistent.
--      b) The campaign_id lookup via campaign_participants LIMIT 1 is
--         flaky. The correct path is wager → bet → event → campaign.
--
-- 2. claim_p2p_side has two overloaded versions in the deployed DB:
--      public.claim_p2p_side(..., p_cost integer)  — from migration 006
--      public.claim_p2p_side(..., p_cost numeric)  — legacy, never dropped
--    Postgres can't pick between them and raises:
--      "Could not choose the best candidate function..."
--    Migration 006 only dropped the integer signature, leaving the
--    numeric one orphaned. Drop it here.
--
-- =====================================================================

-- Drop the stale numeric overload. Keep the integer version from 006.
DROP FUNCTION IF EXISTS public.claim_p2p_side(uuid, uuid, text, numeric);

-- Rewrite cancel_wager with a reliable campaign lookup and scoped update.
DROP FUNCTION IF EXISTS public.cancel_wager(uuid);
CREATE OR REPLACE FUNCTION public.cancel_wager(target_wager_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_wager        RECORD;
    v_bet          RECORD;
    v_campaign_id  UUID;
BEGIN
    SELECT * INTO v_wager FROM wagers WHERE id = target_wager_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Wager % not found', target_wager_id;
    END IF;

    IF v_wager.status <> 'pending' THEN
        RAISE EXCEPTION 'Wager % is not pending (status: %)', target_wager_id, v_wager.status;
    END IF;

    SELECT * INTO v_bet FROM bets WHERE id = v_wager.bet_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Bet % not found for wager %', v_wager.bet_id, target_wager_id;
    END IF;

    -- Preferred path: wager → bet → event → campaign.
    SELECT e.campaign_id INTO v_campaign_id
    FROM events e
    WHERE e.id = v_bet.event_id;

    -- Fallback for freestanding bets (event_id NULL): pick any campaign
    -- the user participates in. This mirrors the pre-008 behavior so we
    -- degrade gracefully if an older bet lacks an event link.
    IF v_campaign_id IS NULL THEN
        SELECT cp.campaign_id INTO v_campaign_id
        FROM campaign_participants cp
        WHERE cp.user_id = v_wager.user_id
        LIMIT 1;
    END IF;

    IF v_campaign_id IS NULL THEN
        RAISE EXCEPTION 'Could not resolve campaign for wager %', target_wager_id;
    END IF;

    -- Scoped refund: only touch the participant row for this campaign.
    UPDATE campaign_participants
    SET global_point_balance = global_point_balance + v_wager.points_risked
    WHERE user_id = v_wager.user_id AND campaign_id = v_campaign_id;

    UPDATE wagers SET status = 'canceled' WHERE id = target_wager_id;

    PERFORM _write_ledger(
        v_campaign_id, v_wager.user_id, 'refund',
        v_wager.points_risked,
        'Wager canceled: ' || v_bet.question
    );
END;
$$;
