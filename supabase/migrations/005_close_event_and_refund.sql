CREATE OR REPLACE FUNCTION close_event_and_refund(p_event_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_target_campaign_id UUID;
BEGIN
    SELECT campaign_id INTO v_target_campaign_id FROM events WHERE id = p_event_id;
    IF v_target_campaign_id IS NULL THEN
        RAISE EXCEPTION 'Event not found.';
    END IF;

    UPDATE events SET status = 'completed' WHERE id = p_event_id;

    UPDATE campaign_participants cp
    SET global_point_balance = cp.global_point_balance + w.points_risked
    FROM wagers w
    JOIN bets b ON w.bet_id = b.id
    WHERE b.event_id = p_event_id AND b.status IN ('open', 'locked')
      AND w.user_id = cp.user_id
      AND cp.campaign_id = v_target_campaign_id
      AND w.status = 'pending';

    UPDATE wagers w
    SET status = 'canceled'
    FROM bets b
    WHERE w.bet_id = b.id AND b.event_id = p_event_id AND b.status IN ('open', 'locked') AND w.status = 'pending';

    UPDATE bets
    SET status = 'canceled'
    WHERE event_id = p_event_id AND status IN ('open', 'locked');

    UPDATE campaign_participants cp
    SET global_point_balance = cp.global_point_balance + p.wager_amount
    FROM p2p_prop_bets p
    WHERE p.event_id = p_event_id AND p.status IN ('open', 'locked', 'pending_approval')
      AND p.proposer_id = cp.user_id
      AND cp.campaign_id = v_target_campaign_id;
      
    UPDATE campaign_participants cp
    SET global_point_balance = cp.global_point_balance + p.challenger_cost
    FROM p2p_prop_bets p
    WHERE p.event_id = p_event_id AND p.status IN ('locked')
      AND p.side_b_user_id = cp.user_id
      AND cp.campaign_id = v_target_campaign_id;

    UPDATE p2p_prop_bets
    SET status = 'resolved'
    WHERE event_id = p_event_id AND status IN ('open', 'locked', 'pending_approval');

    UPDATE campaign_participants cp
    SET global_point_balance = cp.global_point_balance + b.base_amount
    FROM blind_matchups b
    WHERE b.event_id = p_event_id AND b.status IN ('open', 'matched', 'pending_approval')
      AND b.user_1_id = cp.user_id
      AND cp.campaign_id = v_target_campaign_id;

    UPDATE campaign_participants cp
    SET global_point_balance = cp.global_point_balance + (b.base_amount * b.final_multiplier) - b.base_amount
    FROM blind_matchups b
    WHERE b.event_id = p_event_id AND b.status IN ('matched')
      AND b.user_2_id = cp.user_id
      AND cp.campaign_id = v_target_campaign_id;

    UPDATE blind_matchups
    SET status = 'resolved'
    WHERE event_id = p_event_id AND status IN ('open', 'matched', 'pending_approval');
END;
$$;
