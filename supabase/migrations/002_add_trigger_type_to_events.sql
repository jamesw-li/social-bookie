-- Migration: 002_add_trigger_type_to_events.sql
-- Description: Adds the missing trigger_type (and status, if missing) columns designed in the Multi-Event Architecture.

ALTER TABLE events 
ADD COLUMN IF NOT EXISTS trigger_type TEXT DEFAULT 'manual',
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'scheduled';
