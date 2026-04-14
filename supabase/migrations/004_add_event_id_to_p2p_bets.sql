-- Migration: 004_add_event_id_to_p2p_bets.sql
-- Description: Adds the missing event_id column to p2p_prop_bets, establishing the Multi-Event Architecture timeline relationship. Nullable by design to support Campaign-Long bets.

ALTER TABLE p2p_prop_bets ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES events(id);
