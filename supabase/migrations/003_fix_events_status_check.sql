-- Migration: 003_fix_events_status_check.sql
-- Description: Updates the 'events_status_check' constraint to allow the new architectural lifecycle statuses.

ALTER TABLE events DROP CONSTRAINT IF EXISTS events_status_check;

ALTER TABLE events ADD CONSTRAINT events_status_check 
CHECK (status IN ('scheduled', 'live', 'completed'));
