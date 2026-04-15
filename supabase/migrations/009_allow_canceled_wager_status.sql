-- =====================================================================
-- Migration 009: Allow 'canceled' in wagers.status check constraint
-- =====================================================================
--
-- Every refund-path RPC in migration 006 (cancel_wager,
-- close_event_and_refund, delete_bet_and_refund, close_board_and_refund,
-- delete_campaign, etc.) writes `status = 'canceled'` to wagers. The
-- legacy wagers_status_check constraint only allowed
-- ('pending','won','lost'), so every refund path was silently failing in
-- production with:
--
--   new row for relation "wagers" violates check constraint "wagers_status_check"
--
-- The 400 surfaced in the UI once client error handling was fixed
-- (see DashboardScreen.tsx cancel_wager rpc destructuring).
--
-- This migration drops the stale constraint and recreates it with the
-- full set of statuses the app actually uses.
-- =====================================================================

ALTER TABLE public.wagers DROP CONSTRAINT IF EXISTS wagers_status_check;

ALTER TABLE public.wagers
  ADD CONSTRAINT wagers_status_check
  CHECK (status IN ('pending', 'won', 'lost', 'canceled'));
