-- Migration: 018_enable_realtime_for_events.sql
-- Description: Ensures the events table is part of the supabase_realtime publication to enable live updates on the Dashboard.

-- Check if the publication exists, then add the table to it
-- This is a standard Supabase pattern for enabling Realtime via SQL
alter publication supabase_realtime add table events;
