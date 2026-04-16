-- =====================================================================
-- 016: Add is_favorite to campaign_participants
-- Allows users to favorite campaigns on their dashboard.
-- =====================================================================

ALTER TABLE campaign_participants 
ADD COLUMN is_favorite BOOLEAN DEFAULT FALSE;
