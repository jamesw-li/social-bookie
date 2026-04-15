-- =====================================================================
-- Migration 010: place_wager reuses canceled wager rows
-- =====================================================================
--
-- The wagers table has a unique constraint on (user_id, bet_id) — the
-- client code already catches its error code ('23505') with
-- "You already placed a wager on this bet!". That was fine when wagers
-- only had a single lifecycle, but now that cancel_wager leaves behind a
-- status='canceled' row (see migrations 006/008), a user who refunds a
-- wager cannot place a fresh one on the same bet — the canceled row
-- still occupies the unique slot and the INSERT fails.
--
-- Fix: when place_wager sees an existing canceled wager for the same
-- (user_id, bet_id), update it in place (option_id, points_risked,
-- status='pending', refreshed created_at) instead of inserting. The
-- ledger still captures the original wager + refund + new wager as
-- separate entries via _write_ledger, so audit history is preserved.
-- =====================================================================

DROP FUNCTION IF EXISTS public.place_wager(uuid, uuid, uuid, uuid, integer);
CREATE OR REPLACE FUNCTION public.place_wager(
    p_user_id     UUID,
    p_bet_id      UUID,
    p_option_id   UUID,
    p_campaign_id UUID,
    p_points      INTEGER
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_bet        RECORD;
    v_option     RECORD;
    v_balance    INTEGER;
    v_existing   UUID;
BEGIN
    SELECT global_point_balance INTO v_balance
    FROM campaign_participants
    WHERE user_id = p_user_id AND campaign_id = p_campaign_id;

    IF v_balance < p_points THEN
        RAISE EXCEPTION 'Insufficient balance';
    END IF;

    SELECT question INTO v_bet FROM bets WHERE id = p_bet_id;
    SELECT label    INTO v_option FROM bet_options WHERE id = p_option_id;

    -- Reuse a prior canceled wager row if one exists, so the
    -- (user_id, bet_id) unique constraint doesn't block a re-bet.
    SELECT id INTO v_existing
    FROM wagers
    WHERE user_id = p_user_id AND bet_id = p_bet_id AND status = 'canceled'
    LIMIT 1;

    IF v_existing IS NOT NULL THEN
        UPDATE wagers
        SET option_id     = p_option_id,
            points_risked = p_points,
            status        = 'pending',
            created_at    = NOW()
        WHERE id = v_existing;
    ELSE
        INSERT INTO wagers (user_id, bet_id, option_id, points_risked, status)
        VALUES (p_user_id, p_bet_id, p_option_id, p_points, 'pending');
    END IF;

    UPDATE campaign_participants
    SET global_point_balance = global_point_balance - p_points
    WHERE user_id = p_user_id AND campaign_id = p_campaign_id;

    PERFORM _write_ledger(
        p_campaign_id, p_user_id, 'wager',
        -p_points,
        'Wager placed: ' || v_bet.question || ' — ' || v_option.label
    );
END;
$$;
