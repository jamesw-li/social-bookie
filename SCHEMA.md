# Database Schema Definition (Social Bookie)

This file acts as the source-of-truth reference representing the exact table structure of your Supabase database.

---

## 👥 Core Models

### `users`
Represents application users (both Hosts and Guests).
- `id` (uuid, PK, Not Null)
- `display_name` (text, Not Null)
- `created_at` (timestamptz, Not Null)

### `campaigns`
The top-level ledger and event container representing a single trip or timeline.
- `id` (uuid, PK, Not Null)
- `host_id` (uuid, Nullable)
- `name` (text, Not Null)
- `start_date` (date, Nullable)
- `end_date` (date, Nullable)
- `bankroll_type` (text, Nullable) - Default: `'daily_drip'`
- `status` (text, Nullable) - Default: `'active'`
- `join_code` (varchar, Nullable)
- `created_at` (timestamptz, Nullable)

### `campaign_participants`
Junction table linking users to campaigns with their role and global point balance.
- `id` (uuid, PK, Not Null)
- `user_id` (uuid, Nullable)
- `campaign_id` (uuid, Nullable)
- `role` (text, Nullable) - Default: `'guest'`
- `global_point_balance` (integer, Nullable) - Default: `0`

### `events`
Specific temporal instances within a campaign that house specific bets.
- `id` (uuid, PK, Not Null)
- `campaign_id` (uuid, Nullable)
- `name` (text, Not Null)
- `description` (text, Nullable)
- `status` (text, Nullable) - Default: `'upcoming'` (Note: app logic transitions this to 'scheduled', 'live', 'completed')
- `trigger_type` (text, Nullable) - Default: `'manual'`
- `start_time` (timestamptz, Nullable)
- `drip_amount` (integer, Nullable) - Default: `10000`

---

## 🎲 Betting Models

### `bets`
Wagers created by the host or approved from guest pitches.
- `id` (uuid, PK, Not Null)
- `event_id` (uuid, Nullable)
- `type` (text, Not Null) 
- `question` (text, Not Null)
- `status` (text, Nullable) - Default: `'open'`
- `winning_option_id` (uuid, Nullable)
- `creator_id` (uuid, Nullable)

### `bet_options`
The available options/sides to take on a standard bet.
- `id` (uuid, PK, Not Null)
- `bet_id` (uuid, Nullable)
- `label` (text, Not Null)
- `multiplier` (numeric, Nullable) - Default: `1.00`

### `wagers`
The actual stakes/bets placed by users against standard `bets`.
- `id` (uuid, PK, Not Null)
- `user_id` (uuid, Nullable)
- `bet_id` (uuid, Nullable)
- `option_id` (uuid, Nullable)
- `points_risked` (integer, Not Null)
- `status` (text, Nullable) - Default: `'pending'`
- `created_at` (timestamptz, Nullable)

### `guest_proposals`
Pitches submitted by guests for the host to review and approve.
- `id` (uuid, PK, Not Null)
- `event_id` (uuid, Nullable)
- `user_id` (uuid, Nullable)
- `suggestion` (text, Not Null)
- `status` (text, Nullable) - Default: `'pending'`
- `created_at` (timestamptz, Nullable)

---

## ⚔️ Specialty Bets Models

### `p2p_prop_bets`
Direct Player vs Player prop bets proposed by a user.
- `id` (uuid, PK, Not Null)
- `campaign_id` (uuid, Nullable)
- `event_id` (uuid, Nullable) - Links to a specific event timeframe *(Added in 004)*
- `proposer_id` (uuid, Not Null)
- `question` (text, Not Null)
- `option_a_label` (text, Not Null)
- `option_b_label` (text, Not Null)
- `wager_amount` (numeric, Not Null)
- `multiplier` (numeric, Not Null)
- `status` (text, Nullable) - Default: `'pending_approval'`
- `side_a_user_id` (uuid, Nullable)
- `side_b_user_id` (uuid, Nullable)
- `total_pot` (integer, Nullable)
- `challenger_cost` (integer, Nullable)
- `created_at` (timestamptz, Nullable)

### `blind_matchups`
Blind auction or blind bidding matchups.
- `id` (uuid, PK, Not Null)
- `campaign_id` (uuid, Nullable)
- `event_id` (uuid, Nullable)
- `question` (text, Not Null)
- `side_a_label` (text, Not Null)
- `side_b_label` (text, Not Null)
- `base_amount` (integer, Nullable) - Default: `100`
- `user_1_id` (uuid, Nullable)
- `user_1_bid_multiplier` (numeric, Not Null)
- `user_2_id` (uuid, Nullable)
- `user_2_bid_multiplier` (numeric, Nullable)
- `status` (text, Nullable) - Default: `'open'`
- `final_multiplier` (numeric, Nullable)
- `side_a_user_id` (uuid, Nullable)
- `side_b_user_id` (uuid, Nullable)
- `winner_id` (uuid, Nullable)
- `created_at` (timestamptz, Nullable)

---

## 🏦 Economy Models

### `ledger_entries`
The campaign bank accounts. Every point adjustment hits this table to form an audit trail.
- `id` (uuid, PK, Not Null)
- `campaign_id` (uuid, Not Null)
- `user_id` (uuid, Not Null)
- `transaction_type` (`ledger_transaction_type` Enum, Not Null) — values: `wager`, `payout`, `refund`, `adjustment`
- `amount` (integer, Not Null)
- `memo` (text, Not Null)
- `running_balance` (integer, Not Null)
- `created_at` (timestamptz, Not Null)
