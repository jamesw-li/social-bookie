-- Migration: 001_update_events_table.sql
-- Description: Adds the missing description and start_time columns designed in the Multi-Event Architecture to the events table.

ALTER TABLE events 
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS start_time TIMESTAMPTZ;
