-- =====================================================================
-- 007: delete_campaign
-- Permanently deletes a campaign and ALL associated data after first
-- refunding every pending wager/bet so players aren't short-changed.
-- =====================================================================

DROP FUNCTION IF EXISTS delete_campaign(uuid);

CREATE OR REPLACE FUNCTION delete_campaign(p_campaign_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_wager  RECORD;
    v_p2p    RECORD;
    v_blind  RECORD;
    v_refund INTEGER;
BEGIN
    -- ── 1. Refund pending standard wagers ─────────────────────────────
    FOR v_wager IN
        SELECT w.user_id, w.points_risked, w.id AS wager_id
        FROM wagers w
        JOIN bets b ON w.bet_id = b.id
        WHERE w.status = 'pending'
          AND b.status IN ('open', 'locked')
          AND (
              b.event_id IN (SELECT id FROM events WHERE campaign_id = p_campaign_id)
              OR b.event_id IS NULL
          )
    LOOP
        UPDATE campaign_participants
        SET global_point_balance = global_point_balance + v_wager.points_risked
        WHERE user_id = v_wager.user_id AND campaign_id = p_campaign_id;

        UPDATE wagers SET status = 'canceled' WHERE id = v_wager.wager_id;
    END LOOP;

    -- ── 2. Refund pending P2P prop bets ───────────────────────────────
    FOR v_p2p IN
        SELECT * FROM p2p_prop_bets
        WHERE campaign_id = p_campaign_id
          AND status IN ('open', 'locked', 'pending_approval')
    LOOP
        UPDATE campaign_participants
        SET global_point_balance = global_point_balance + v_p2p.wager_amount
        WHERE user_id = v_p2p.proposer_id AND campaign_id = p_campaign_id;

        -- Refund the challenger if they claimed a side
        IF v_p2p.side_b_user_id IS NOT NULL
           AND v_p2p.challenger_cost IS NOT NULL
           AND v_p2p.status = 'locked'
        THEN
            UPDATE campaign_participants
            SET global_point_balance = global_point_balance + v_p2p.challenger_cost
            WHERE user_id = v_p2p.side_b_user_id AND campaign_id = p_campaign_id;
        END IF;
    END LOOP;

    -- ── 3. Refund pending blind matchups ──────────────────────────────
    FOR v_blind IN
        SELECT * FROM blind_matchups
        WHERE campaign_id = p_campaign_id
          AND status IN ('open', 'matched', 'pending_approval')
    LOOP
        UPDATE campaign_participants
        SET global_point_balance = global_point_balance + v_blind.base_amount
        WHERE user_id = v_blind.user_1_id AND campaign_id = p_campaign_id;

        IF v_blind.user_2_id IS NOT NULL
           AND v_blind.final_multiplier IS NOT NULL
           AND v_blind.status = 'matched'
        THEN
            v_refund := FLOOR((v_blind.base_amount * v_blind.final_multiplier) - v_blind.base_amount);
            UPDATE campaign_participants
            SET global_point_balance = global_point_balance + v_refund
            WHERE user_id = v_blind.user_2_id AND campaign_id = p_campaign_id;
        END IF;
    END LOOP;

    -- ── 4. Hard-delete all child records then the campaign ─────────────
    -- (Delete in dependency order to avoid FK violations)

    -- Wagers depend on bets / bet_options
    DELETE FROM wagers
    WHERE bet_id IN (
        SELECT b.id FROM bets b
        WHERE b.event_id IN (SELECT id FROM events WHERE campaign_id = p_campaign_id)
           OR b.event_id IS NULL
    );

    -- Bet options depend on bets
    DELETE FROM bet_options
    WHERE bet_id IN (
        SELECT b.id FROM bets b
        WHERE b.event_id IN (SELECT id FROM events WHERE campaign_id = p_campaign_id)
           OR b.event_id IS NULL
    );

    -- Bets depend on events
    DELETE FROM bets
    WHERE event_id IN (SELECT id FROM events WHERE campaign_id = p_campaign_id)
       OR event_id IS NULL;

    -- Specialty bet tables
    DELETE FROM p2p_prop_bets  WHERE campaign_id = p_campaign_id;
    DELETE FROM blind_matchups WHERE campaign_id = p_campaign_id;
    DELETE FROM guest_proposals
    WHERE event_id IN (SELECT id FROM events WHERE campaign_id = p_campaign_id)
       OR event_id IS NULL;

    -- Ledger history
    DELETE FROM ledger_entries WHERE campaign_id = p_campaign_id;

    -- Events
    DELETE FROM events WHERE campaign_id = p_campaign_id;

    -- Participants
    DELETE FROM campaign_participants WHERE campaign_id = p_campaign_id;

    -- Finally, the campaign itself
    DELETE FROM campaigns WHERE id = p_campaign_id;
END;
$$;
