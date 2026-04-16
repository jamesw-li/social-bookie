-- Migration: 017_open_expired_auto_events_rpc.sql
-- Description: Creates a function to automatically flip scheduled auto-trigger events to live if their time has passed.
-- Includes a 10-second buffer to handle clock drift between client and server.

CREATE OR REPLACE FUNCTION open_expired_auto_events()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE events
    SET status = 'live'
    WHERE status = 'scheduled'
      AND trigger_type = 'auto'
      AND start_time <= (NOW() + interval '10 seconds');
END;
$$;
