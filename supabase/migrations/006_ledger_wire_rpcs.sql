-- =====================================================================
-- 006: Wire all existing financial RPCs to write ledger_entries
-- Every money move must produce an audit trail row.
-- =====================================================================

-- Drop all functions first to allow parameter renames.
-- CASCADE is safe here — no other DB objects depend on these functions.
DROP FUNCTION IF EXISTS _write_ledger(uuid, uuid, text, integer, text);
DROP FUNCTION IF EXISTS cancel_wager(uuid);
DROP FUNCTION IF EXISTS place_wager(uuid, uuid, uuid, uuid, integer);
DROP FUNCTION IF EXISTS resolve_bet(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS undo_resolve_bet(uuid);
DROP FUNCTION IF EXISTS resolve_p2p_bet(uuid, uuid);
DROP FUNCTION IF EXISTS grade_blind_match(uuid, uuid);
DROP FUNCTION IF EXISTS delete_bet_and_refund(uuid);
DROP FUNCTION IF EXISTS delete_p2p_bet_and_refund(uuid);
DROP FUNCTION IF EXISTS delete_blind_match_and_refund(uuid);
DROP FUNCTION IF EXISTS close_event_and_refund(uuid);
DROP FUNCTION IF EXISTS close_board_and_refund(uuid);
DROP FUNCTION IF EXISTS claim_p2p_side(uuid, uuid, text, integer);
DROP FUNCTION IF EXISTS match_blind_p2p(uuid, uuid, numeric);
DROP FUNCTION IF EXISTS reset_p2p_bet(uuid);

-- Helper: insert a single ledger entry after a balance mutation
-- Usage: PERFORM _write_ledger(campaign_id, user_id, type, amount, memo);
CREATE OR REPLACE FUNCTION _write_ledger(
    p_campaign_id UUID,
    p_user_id     UUID,
    p_type        TEXT,
    p_amount      INTEGER,
    p_memo        TEXT
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
    v_new_balance INTEGER;
BEGIN
    SELECT global_point_balance INTO v_new_balance
    FROM campaign_participants
    WHERE campaign_id = p_campaign_id AND user_id = p_user_id;

    INSERT INTO ledger_entries (campaign_id, user_id, transaction_type, amount, memo, running_balance)
    VALUES (p_campaign_id, p_user_id, p_type::ledger_transaction_type, p_amount, p_memo, v_new_balance);
END;
$$;

-- =====================================================================
-- cancel_wager
-- =====================================================================
CREATE OR REPLACE FUNCTION cancel_wager(target_wager_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_wager        RECORD;
    v_bet          RECORD;
    v_campaign_id  UUID;
BEGIN
    SELECT * INTO v_wager FROM wagers WHERE id = target_wager_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Wager not found'; END IF;

    SELECT * INTO v_bet FROM bets WHERE id = v_wager.bet_id;

    SELECT campaign_id INTO v_campaign_id
    FROM campaign_participants
    WHERE user_id = v_wager.user_id
    LIMIT 1;

    -- Refund points
    UPDATE campaign_participants
    SET global_point_balance = global_point_balance + v_wager.points_risked
    WHERE user_id = v_wager.user_id;

    UPDATE wagers SET status = 'canceled' WHERE id = target_wager_id;

    PERFORM _write_ledger(
        v_campaign_id, v_wager.user_id, 'refund',
        v_wager.points_risked,
        'Wager canceled: ' || v_bet.question
    );
END;
$$;

-- =====================================================================
-- place_wager (new atomic RPC — replaces inline frontend writes)
-- =====================================================================
CREATE OR REPLACE FUNCTION place_wager(
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
BEGIN
    SELECT global_point_balance INTO v_balance
    FROM campaign_participants
    WHERE user_id = p_user_id AND campaign_id = p_campaign_id;

    IF v_balance < p_points THEN
        RAISE EXCEPTION 'Insufficient balance';
    END IF;

    SELECT question INTO v_bet FROM bets WHERE id = p_bet_id;
    SELECT label    INTO v_option FROM bet_options WHERE id = p_option_id;

    INSERT INTO wagers (user_id, bet_id, option_id, points_risked, status)
    VALUES (p_user_id, p_bet_id, p_option_id, p_points, 'pending');

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

DROP FUNCTION IF EXISTS resolve_bet(uuid, uuid);
CREATE OR REPLACE FUNCTION resolve_bet(
    target_bet_id        UUID,
    p_winning_option_id  UUID,
    p_campaign_id        UUID
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_bet         RECORD;
    v_option      RECORD;
    v_wager       RECORD;
    v_payout      INTEGER;
BEGIN
    SELECT * INTO v_bet FROM bets WHERE id = target_bet_id;
    SELECT label INTO v_option FROM bet_options WHERE id = p_winning_option_id;

    UPDATE bets SET status = 'graded', winning_option_id = p_winning_option_id WHERE id = target_bet_id;

    -- Pay out each winning wager
    FOR v_wager IN
        SELECT w.*, bo.multiplier
        FROM wagers w
        JOIN bet_options bo ON bo.id = w.option_id
        WHERE w.bet_id = target_bet_id AND w.option_id = p_winning_option_id AND w.status = 'pending'
    LOOP
        v_payout := FLOOR(v_wager.points_risked * v_wager.multiplier);

        UPDATE campaign_participants
        SET global_point_balance = global_point_balance + v_payout
        WHERE user_id = v_wager.user_id AND campaign_id = p_campaign_id;

        UPDATE wagers SET status = 'won' WHERE id = v_wager.id;

        PERFORM _write_ledger(
            p_campaign_id, v_wager.user_id, 'payout',
            v_payout,
            'Winnings: ' || v_bet.question || ' — ' || v_option.label
        );
    END LOOP;

    -- Mark losers
    UPDATE wagers SET status = 'lost'
    WHERE bet_id = target_bet_id AND option_id != p_winning_option_id AND status = 'pending';
END;
$$;

-- =====================================================================
-- undo_resolve_bet
-- =====================================================================
CREATE OR REPLACE FUNCTION undo_resolve_bet(target_bet_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_campaign_id UUID;
    v_wager       RECORD;
    v_bet         RECORD;
    v_option      RECORD;
    v_payout      INTEGER;
BEGIN
    SELECT * INTO v_bet FROM bets WHERE id = target_bet_id;
    SELECT label INTO v_option FROM bet_options WHERE id = v_bet.winning_option_id;

    SELECT cp.campaign_id INTO v_campaign_id
    FROM wagers w
    JOIN campaign_participants cp ON cp.user_id = w.user_id
    WHERE w.bet_id = target_bet_id LIMIT 1;

    -- Claw back payouts from winners
    FOR v_wager IN
        SELECT w.*, bo.multiplier
        FROM wagers w
        JOIN bet_options bo ON bo.id = w.option_id
        WHERE w.bet_id = target_bet_id AND w.status = 'won'
    LOOP
        v_payout := FLOOR(v_wager.points_risked * v_wager.multiplier);

        UPDATE campaign_participants
        SET global_point_balance = global_point_balance - v_payout
        WHERE user_id = v_wager.user_id;

        PERFORM _write_ledger(
            v_campaign_id, v_wager.user_id, 'adjustment',
            -v_payout,
            'Bet ungraded (points reclaimed): ' || v_bet.question
        );
    END LOOP;

    UPDATE wagers SET status = 'pending'
        WHERE bet_id = target_bet_id AND status IN ('won', 'lost');
    UPDATE bets SET status = 'open', winning_option_id = NULL WHERE id = target_bet_id;
END;
$$;

-- =====================================================================
-- resolve_p2p_bet
-- =====================================================================
CREATE OR REPLACE FUNCTION resolve_p2p_bet(
    p_bet_id    UUID,
    p_winner_id UUID
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_bet         RECORD;
    v_campaign_id UUID;
    v_payout      INTEGER;
BEGIN
    SELECT * INTO v_bet FROM p2p_prop_bets WHERE id = p_bet_id;
    v_campaign_id := v_bet.campaign_id;
    v_payout := v_bet.total_pot;

    UPDATE campaign_participants
    SET global_point_balance = global_point_balance + v_payout
    WHERE user_id = p_winner_id AND campaign_id = v_campaign_id;

    UPDATE p2p_prop_bets SET status = 'resolved' WHERE id = p_bet_id;

    PERFORM _write_ledger(
        v_campaign_id, p_winner_id, 'payout',
        v_payout,
        'P2P Prop won: ' || v_bet.question
    );
END;
$$;

-- =====================================================================
-- grade_blind_match
-- =====================================================================
CREATE OR REPLACE FUNCTION grade_blind_match(
    p_matchup_id UUID,
    p_winner_id  UUID
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_match       RECORD;
    v_payout      INTEGER;
BEGIN
    SELECT * INTO v_match FROM blind_matchups WHERE id = p_matchup_id;
    v_payout := FLOOR(v_match.base_amount * v_match.final_multiplier);

    UPDATE campaign_participants
    SET global_point_balance = global_point_balance + v_payout
    WHERE user_id = p_winner_id AND campaign_id = v_match.campaign_id;

    UPDATE blind_matchups SET status = 'resolved', winner_id = p_winner_id WHERE id = p_matchup_id;

    PERFORM _write_ledger(
        v_match.campaign_id, p_winner_id, 'payout',
        v_payout,
        'Blind match won: ' || v_match.question
    );
END;
$$;

-- =====================================================================
-- delete_bet_and_refund
-- =====================================================================
CREATE OR REPLACE FUNCTION delete_bet_and_refund(target_bet_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_bet         RECORD;
    v_campaign_id UUID;
    v_wager       RECORD;
BEGIN
    SELECT * INTO v_bet FROM bets WHERE id = target_bet_id;

    SELECT cp.campaign_id INTO v_campaign_id
    FROM wagers w
    JOIN campaign_participants cp ON cp.user_id = w.user_id
    WHERE w.bet_id = target_bet_id LIMIT 1;

    FOR v_wager IN SELECT * FROM wagers WHERE bet_id = target_bet_id AND status = 'pending' LOOP
        UPDATE campaign_participants
        SET global_point_balance = global_point_balance + v_wager.points_risked
        WHERE user_id = v_wager.user_id;

        PERFORM _write_ledger(
            v_campaign_id, v_wager.user_id, 'refund',
            v_wager.points_risked,
            'Bet removed by host: ' || v_bet.question
        );
    END LOOP;

    DELETE FROM wagers WHERE bet_id = target_bet_id;
    DELETE FROM bet_options WHERE bet_id = target_bet_id;
    DELETE FROM bets WHERE id = target_bet_id;
END;
$$;

-- =====================================================================
-- delete_p2p_bet_and_refund
-- =====================================================================
CREATE OR REPLACE FUNCTION delete_p2p_bet_and_refund(p_bet_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_bet RECORD;
BEGIN
    SELECT * INTO v_bet FROM p2p_prop_bets WHERE id = p_bet_id;

    -- Refund proposer
    UPDATE campaign_participants
    SET global_point_balance = global_point_balance + v_bet.wager_amount
    WHERE user_id = v_bet.proposer_id AND campaign_id = v_bet.campaign_id;

    PERFORM _write_ledger(v_bet.campaign_id, v_bet.proposer_id, 'refund',
        v_bet.wager_amount, 'P2P bet removed by host: ' || v_bet.question);

    -- Refund challenger if matched
    IF v_bet.side_b_user_id IS NOT NULL AND v_bet.challenger_cost IS NOT NULL THEN
        UPDATE campaign_participants
        SET global_point_balance = global_point_balance + v_bet.challenger_cost
        WHERE user_id = v_bet.side_b_user_id AND campaign_id = v_bet.campaign_id;

        PERFORM _write_ledger(v_bet.campaign_id, v_bet.side_b_user_id, 'refund',
            v_bet.challenger_cost, 'P2P bet removed by host: ' || v_bet.question);
    END IF;

    DELETE FROM p2p_prop_bets WHERE id = p_bet_id;
END;
$$;

-- =====================================================================
-- delete_blind_match_and_refund
-- =====================================================================
CREATE OR REPLACE FUNCTION delete_blind_match_and_refund(p_matchup_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_match RECORD;
    v_challenger_cost INTEGER;
BEGIN
    SELECT * INTO v_match FROM blind_matchups WHERE id = p_matchup_id;

    -- Refund creator (base amount)
    UPDATE campaign_participants
    SET global_point_balance = global_point_balance + v_match.base_amount
    WHERE user_id = v_match.user_1_id AND campaign_id = v_match.campaign_id;

    PERFORM _write_ledger(v_match.campaign_id, v_match.user_1_id, 'refund',
        v_match.base_amount, 'Blind match removed by host: ' || v_match.question);

    -- Refund challenger if matched
    IF v_match.user_2_id IS NOT NULL AND v_match.final_multiplier IS NOT NULL THEN
        v_challenger_cost := FLOOR((v_match.base_amount * v_match.final_multiplier) - v_match.base_amount);

        UPDATE campaign_participants
        SET global_point_balance = global_point_balance + v_challenger_cost
        WHERE user_id = v_match.user_2_id AND campaign_id = v_match.campaign_id;

        PERFORM _write_ledger(v_match.campaign_id, v_match.user_2_id, 'refund',
            v_challenger_cost, 'Blind match removed by host: ' || v_match.question);
    END IF;

    DELETE FROM blind_matchups WHERE id = p_matchup_id;
END;
$$;

-- =====================================================================
-- close_event_and_refund — updated to write ledger rows
-- =====================================================================
CREATE OR REPLACE FUNCTION close_event_and_refund(p_event_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_campaign_id UUID;
    v_wager       RECORD;
    v_p2p         RECORD;
    v_blind       RECORD;
    v_refund_amt  INTEGER;
    v_event_name  TEXT;
BEGIN
    SELECT campaign_id, name INTO v_campaign_id, v_event_name FROM events WHERE id = p_event_id;
    IF v_campaign_id IS NULL THEN RAISE EXCEPTION 'Event not found.'; END IF;

    UPDATE events SET status = 'completed' WHERE id = p_event_id;

    -- Refund pending standard wagers
    FOR v_wager IN
        SELECT w.user_id, w.points_risked, w.id AS wager_id
        FROM wagers w
        JOIN bets b ON w.bet_id = b.id
        WHERE b.event_id = p_event_id AND b.status IN ('open', 'locked') AND w.status = 'pending'
    LOOP
        UPDATE campaign_participants
        SET global_point_balance = global_point_balance + v_wager.points_risked
        WHERE user_id = v_wager.user_id AND campaign_id = v_campaign_id;

        UPDATE wagers SET status = 'canceled' WHERE id = v_wager.wager_id;

        PERFORM _write_ledger(v_campaign_id, v_wager.user_id, 'refund',
            v_wager.points_risked, 'Refund: Event closed early — ' || v_event_name);
    END LOOP;

    UPDATE bets SET status = 'canceled' WHERE event_id = p_event_id AND status IN ('open', 'locked');

    -- Refund P2P bets
    FOR v_p2p IN SELECT * FROM p2p_prop_bets WHERE event_id = p_event_id AND status IN ('open', 'locked', 'pending_approval') LOOP
        UPDATE campaign_participants
        SET global_point_balance = global_point_balance + v_p2p.wager_amount
        WHERE user_id = v_p2p.proposer_id AND campaign_id = v_campaign_id;

        PERFORM _write_ledger(v_campaign_id, v_p2p.proposer_id, 'refund',
            v_p2p.wager_amount, 'Refund: Event closed early — ' || v_event_name);

        IF v_p2p.side_b_user_id IS NOT NULL AND v_p2p.challenger_cost IS NOT NULL AND v_p2p.status = 'locked' THEN
            UPDATE campaign_participants
            SET global_point_balance = global_point_balance + v_p2p.challenger_cost
            WHERE user_id = v_p2p.side_b_user_id AND campaign_id = v_campaign_id;

            PERFORM _write_ledger(v_campaign_id, v_p2p.side_b_user_id, 'refund',
                v_p2p.challenger_cost, 'Refund: Event closed early — ' || v_event_name);
        END IF;
    END LOOP;

    UPDATE p2p_prop_bets SET status = 'resolved' WHERE event_id = p_event_id AND status IN ('open', 'locked', 'pending_approval');

    -- Refund blind matchups
    FOR v_blind IN SELECT * FROM blind_matchups WHERE event_id = p_event_id AND status IN ('open', 'matched', 'pending_approval') LOOP
        UPDATE campaign_participants
        SET global_point_balance = global_point_balance + v_blind.base_amount
        WHERE user_id = v_blind.user_1_id AND campaign_id = v_campaign_id;

        PERFORM _write_ledger(v_campaign_id, v_blind.user_1_id, 'refund',
            v_blind.base_amount, 'Refund: Event closed early — ' || v_event_name);

        IF v_blind.user_2_id IS NOT NULL AND v_blind.final_multiplier IS NOT NULL AND v_blind.status = 'matched' THEN
            v_refund_amt := FLOOR((v_blind.base_amount * v_blind.final_multiplier) - v_blind.base_amount);
            UPDATE campaign_participants
            SET global_point_balance = global_point_balance + v_refund_amt
            WHERE user_id = v_blind.user_2_id AND campaign_id = v_campaign_id;

            PERFORM _write_ledger(v_campaign_id, v_blind.user_2_id, 'refund',
                v_refund_amt, 'Refund: Event closed early — ' || v_event_name);
        END IF;
    END LOOP;

    UPDATE blind_matchups SET status = 'resolved' WHERE event_id = p_event_id AND status IN ('open', 'matched', 'pending_approval');
END;
$$;

-- =====================================================================
-- close_board_and_refund — campaign-level nuke
-- =====================================================================
CREATE OR REPLACE FUNCTION close_board_and_refund(p_campaign_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_wager  RECORD;
    v_p2p    RECORD;
    v_blind  RECORD;
    v_refund INTEGER;
BEGIN
    UPDATE campaigns SET status = 'closed' WHERE id = p_campaign_id;

    FOR v_wager IN
        SELECT w.user_id, w.points_risked, w.id AS wager_id
        FROM wagers w JOIN bets b ON w.bet_id = b.id
        WHERE w.status = 'pending'
          AND b.status IN ('open', 'locked')
          AND (b.event_id IN (SELECT id FROM events WHERE campaign_id = p_campaign_id) OR b.event_id IS NULL)
    LOOP
        UPDATE campaign_participants
        SET global_point_balance = global_point_balance + v_wager.points_risked
        WHERE user_id = v_wager.user_id AND campaign_id = p_campaign_id;

        UPDATE wagers SET status = 'canceled' WHERE id = v_wager.wager_id;

        PERFORM _write_ledger(p_campaign_id, v_wager.user_id, 'refund',
            v_wager.points_risked, 'Refund: Campaign closed');
    END LOOP;

    FOR v_p2p IN SELECT * FROM p2p_prop_bets WHERE campaign_id = p_campaign_id AND status IN ('open', 'locked', 'pending_approval') LOOP
        UPDATE campaign_participants
        SET global_point_balance = global_point_balance + v_p2p.wager_amount
        WHERE user_id = v_p2p.proposer_id AND campaign_id = p_campaign_id;
        PERFORM _write_ledger(p_campaign_id, v_p2p.proposer_id, 'refund', v_p2p.wager_amount, 'Refund: Campaign closed');

        IF v_p2p.side_b_user_id IS NOT NULL AND v_p2p.challenger_cost IS NOT NULL AND v_p2p.status = 'locked' THEN
            UPDATE campaign_participants
            SET global_point_balance = global_point_balance + v_p2p.challenger_cost
            WHERE user_id = v_p2p.side_b_user_id AND campaign_id = p_campaign_id;
            PERFORM _write_ledger(p_campaign_id, v_p2p.side_b_user_id, 'refund', v_p2p.challenger_cost, 'Refund: Campaign closed');
        END IF;
    END LOOP;

    FOR v_blind IN SELECT * FROM blind_matchups WHERE campaign_id = p_campaign_id AND status IN ('open', 'matched', 'pending_approval') LOOP
        UPDATE campaign_participants SET global_point_balance = global_point_balance + v_blind.base_amount
        WHERE user_id = v_blind.user_1_id AND campaign_id = p_campaign_id;
        PERFORM _write_ledger(p_campaign_id, v_blind.user_1_id, 'refund', v_blind.base_amount, 'Refund: Campaign closed');

        IF v_blind.user_2_id IS NOT NULL AND v_blind.final_multiplier IS NOT NULL AND v_blind.status = 'matched' THEN
            v_refund := FLOOR((v_blind.base_amount * v_blind.final_multiplier) - v_blind.base_amount);
            UPDATE campaign_participants SET global_point_balance = global_point_balance + v_refund
            WHERE user_id = v_blind.user_2_id AND campaign_id = p_campaign_id;
            PERFORM _write_ledger(p_campaign_id, v_blind.user_2_id, 'refund', v_refund, 'Refund: Campaign closed');
        END IF;
    END LOOP;
END;
$$;

-- =====================================================================
-- claim_p2p_side — deduct + ledger when a user claims a P2P side
-- =====================================================================
CREATE OR REPLACE FUNCTION claim_p2p_side(
    p_bet_id  UUID,
    p_user_id UUID,
    p_side    TEXT,
    p_cost    INTEGER
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_bet RECORD;
BEGIN
    SELECT * INTO v_bet FROM p2p_prop_bets WHERE id = p_bet_id;

    UPDATE campaign_participants
    SET global_point_balance = global_point_balance - p_cost
    WHERE user_id = p_user_id AND campaign_id = v_bet.campaign_id;

    IF p_side = 'A' THEN
        UPDATE p2p_prop_bets SET side_a_user_id = p_user_id,
            status = CASE WHEN side_b_user_id IS NOT NULL THEN 'locked' ELSE status END
        WHERE id = p_bet_id;
    ELSE
        UPDATE p2p_prop_bets SET side_b_user_id = p_user_id,
            status = CASE WHEN side_a_user_id IS NOT NULL THEN 'locked' ELSE status END
        WHERE id = p_bet_id;
    END IF;

    PERFORM _write_ledger(v_bet.campaign_id, p_user_id, 'wager',
        -p_cost, 'P2P wager locked: ' || v_bet.question || ' — Side ' || p_side);
END;
$$;

-- =====================================================================
-- match_blind_p2p — challenger locks in a blind bid
-- =====================================================================
CREATE OR REPLACE FUNCTION match_blind_p2p(
    p_matchup_id   UUID,
    p_user_2_id    UUID,
    p_user_2_bid   NUMERIC
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_match      RECORD;
    v_final_mult NUMERIC;
    v_cost       INTEGER;
BEGIN
    SELECT * INTO v_match FROM blind_matchups WHERE id = p_matchup_id;
    v_final_mult := GREATEST(v_match.user_1_bid_multiplier, p_user_2_bid);
    v_cost := FLOOR((v_match.base_amount * v_final_mult) - v_match.base_amount);

    UPDATE campaign_participants
    SET global_point_balance = global_point_balance - v_cost
    WHERE user_id = p_user_2_id AND campaign_id = v_match.campaign_id;

    UPDATE blind_matchups SET
        user_2_id = p_user_2_id,
        user_2_bid_multiplier = p_user_2_bid,
        final_multiplier = v_final_mult,
        status = 'matched',
        side_a_user_id = CASE WHEN v_match.user_1_bid_multiplier >= p_user_2_bid THEN v_match.user_1_id ELSE p_user_2_id END,
        side_b_user_id = CASE WHEN v_match.user_1_bid_multiplier >= p_user_2_bid THEN p_user_2_id ELSE v_match.user_1_id END
    WHERE id = p_matchup_id;

    PERFORM _write_ledger(v_match.campaign_id, p_user_2_id, 'wager',
        -v_cost, 'Blind bid matched: ' || v_match.question);
END;
$$;

-- =====================================================================
-- reset_p2p_bet — host resets a claimed P2P (refunds claimer if locked)
-- =====================================================================
CREATE OR REPLACE FUNCTION reset_p2p_bet(p_bet_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_bet RECORD;
BEGIN
    SELECT * INTO v_bet FROM p2p_prop_bets WHERE id = p_bet_id;

    IF v_bet.side_b_user_id IS NOT NULL AND v_bet.challenger_cost IS NOT NULL THEN
        UPDATE campaign_participants
        SET global_point_balance = global_point_balance + v_bet.challenger_cost
        WHERE user_id = v_bet.side_b_user_id AND campaign_id = v_bet.campaign_id;

        PERFORM _write_ledger(v_bet.campaign_id, v_bet.side_b_user_id, 'refund',
            v_bet.challenger_cost, 'P2P bet reset by host: ' || v_bet.question);
    END IF;

    UPDATE p2p_prop_bets SET
        side_a_user_id = NULL, side_b_user_id = NULL, status = 'open'
    WHERE id = p_bet_id;
END;
$$;
