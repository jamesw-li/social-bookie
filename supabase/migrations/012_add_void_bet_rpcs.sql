-- =====================================================================
-- 012: Add void_bet_and_refund logic
-- Refund points without deleting the bet/match rows.
-- =====================================================================

CREATE OR REPLACE FUNCTION void_bet_and_refund(p_bet_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_bet         RECORD;
    v_campaign_id UUID;
    v_wager       RECORD;
BEGIN
    SELECT * INTO v_bet FROM bets WHERE id = p_bet_id;
    IF NOT FOUND THEN RETURN; END IF;

    SELECT campaign_id INTO v_campaign_id FROM events WHERE id = v_bet.event_id;
    IF v_campaign_id IS NULL THEN
        -- Fallback to finding it via wagers if no event_id
        SELECT cp.campaign_id INTO v_campaign_id
        FROM wagers w
        JOIN campaign_participants cp ON cp.user_id = w.user_id
        WHERE w.bet_id = p_bet_id LIMIT 1;
    END IF;

    FOR v_wager IN SELECT * FROM wagers WHERE bet_id = p_bet_id AND status = 'pending' LOOP
        UPDATE campaign_participants
        SET global_point_balance = global_point_balance + v_wager.points_risked
        WHERE user_id = v_wager.user_id AND campaign_id = v_campaign_id;

        UPDATE wagers SET status = 'canceled' WHERE id = v_wager.id;

        PERFORM _write_ledger(
            v_campaign_id, v_wager.user_id, 'refund',
            v_wager.points_risked,
            'Bet voided by host (Points Refunded): ' || v_bet.question
        );
    END LOOP;

    UPDATE bets SET status = 'canceled' WHERE id = p_bet_id;
END;
$$;

CREATE OR REPLACE FUNCTION void_p2p_bet_and_refund(p_bet_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_bet RECORD;
BEGIN
    SELECT * INTO v_bet FROM p2p_prop_bets WHERE id = p_bet_id;
    IF NOT FOUND THEN RETURN; END IF;

    -- Refund proposer
    UPDATE campaign_participants
    SET global_point_balance = global_point_balance + v_bet.wager_amount
    WHERE user_id = v_bet.proposer_id AND campaign_id = v_bet.campaign_id;

    PERFORM _write_ledger(v_bet.campaign_id, v_bet.proposer_id, 'refund',
        v_bet.wager_amount, 'P2P bet voided by host: ' || v_bet.question);

    -- Refund challenger if matched
    IF v_bet.side_b_user_id IS NOT NULL AND v_bet.challenger_cost IS NOT NULL THEN
        UPDATE campaign_participants
        SET global_point_balance = global_point_balance + v_bet.challenger_cost
        WHERE user_id = v_bet.side_b_user_id AND campaign_id = v_bet.campaign_id;

        PERFORM _write_ledger(v_bet.campaign_id, v_bet.side_b_user_id, 'refund',
            v_bet.challenger_cost, 'P2P bet voided by host: ' || v_bet.question);
    END IF;

    UPDATE p2p_prop_bets SET status = 'resolved' WHERE id = p_bet_id;
END;
$$;

CREATE OR REPLACE FUNCTION void_blind_match_and_refund(p_matchup_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_match RECORD;
    v_challenger_cost INTEGER;
BEGIN
    SELECT * INTO v_match FROM blind_matchups WHERE id = p_matchup_id;
    IF NOT FOUND THEN RETURN; END IF;

    -- Refund creator
    UPDATE campaign_participants
    SET global_point_balance = global_point_balance + v_match.base_amount
    WHERE user_id = v_match.user_1_id AND campaign_id = v_match.campaign_id;

    PERFORM _write_ledger(v_match.campaign_id, v_match.user_1_id, 'refund',
        v_match.base_amount, 'Blind match voided by host: ' || v_match.question);

    -- Refund challenger if matched
    IF v_match.user_2_id IS NOT NULL AND v_match.final_multiplier IS NOT NULL THEN
        v_challenger_cost := FLOOR((v_match.base_amount * v_match.final_multiplier) - v_match.base_amount);

        UPDATE campaign_participants
        SET global_point_balance = global_point_balance + v_challenger_cost
        WHERE user_id = v_match.user_2_id AND campaign_id = v_match.campaign_id;

        PERFORM _write_ledger(v_match.campaign_id, v_match.user_2_id, 'refund',
            v_challenger_cost, 'Blind match voided by host: ' || v_match.question);
    END IF;

    UPDATE blind_matchups SET status = 'resolved' WHERE id = p_matchup_id;
END;
$$;
