content = """# Bet On It v2: Project Rules & Specifications

## 1. Project Scope & Tech Stack
**Bet On It** is a social betting companion app for group trips, sports seasons, and coordinated events. It allows a "Host" to manage a digital economy where "Guests" can wager points on custom lines.

### Core Stack:
- **Frontend:** React Native (Expo) with TypeScript
- **Styling:** Native CSS / StyleSheet (Dark Mode Primary)
- **Backend:** Supabase (PostgreSQL, Auth, Realtime)
- **Deployment:** Vercel (Web/API)

---

## 2. Multi-Event Architecture
A **Campaign** (e.g., "Tahoe Cabin Weekend") is the top-level container. Each Campaign contains multiple chronological **Events**.

### Event Lifecycle States:
- **`scheduled`**: Visible to guests. Bets are locked (padlocked). Guests can browse lines and "Pitch a Bet."
- **`live`**: Betting window is open. Padlocks are removed; wagers are active.
- **`completed`**: Event is over. Board is locked. Results are displayed for auditing.

### Trigger Logic:
- **Auto-Open:** Transition to `live` happens automatically at the specified `start_time`.
- **Manual Open:** Transition requires explicit Host interaction, regardless of the timestamp.

---

## 3. Public Pitching Workflow
To drive engagement, all Guest pitches are public by default during the `scheduled` and `live` phases.
- **Status:** Pitches appear immediately with a `Pending Host Approval` badge.
- **Restriction:** Guests cannot wager on pending pitches until approved.
- **Host Action:** The Host can "Approve & Edit" any pitch to set official odds, transforming it into a House Line.

---

## 4. The Economy & Ledger
The app uses a persistent **Campaign Wallet** balance that follows a user across all events within a single trip.

### The Banker (Host Control):
- The Host has absolute authority to `Add`, `Subtract`, or `Set` point balances for any participant.
- Manual overrides are required for re-buys or penalties.

### The Ledger (Audit Trail):
Every point movement must generate a record in the `ledger_entries` table.
- **Required Fields:** `transaction_type` (wager, payout, adjustment, refund), `amount`, `memo`, and `running_balance`.
- **UI:** Users must have a "Wallet" tab to audit their transaction history chronologically.

---

## 5. UI & Technical Constraints

### Theme Constants:
- **Background:** `#121212` (Root) / `#1e1e1e` (Cards/Modals)
- **Primary:** `#00D084` (Green)
- **Typography:** `#e0e0e0` (Primary) / `#a0a0a0` (Secondary)

### Keyboard-Safe Layout (The "Holy Grail"):
To prevent the "White Block" glitch and ensure visibility of focused inputs:
```tsx
<View style={{ flex: 1, backgroundColor: '#121212' }}>
  <KeyboardAvoidingView 
    style={{ flex: 1 }} 
    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    keyboardVerticalOffset={Platform.OS === 'ios' ? 40 : 20}
  >
    <ScrollView 
      style={{ flex: 1 }} 
      contentContainerStyle={{ flexGrow: 1 }}
      keyboardShouldPersistTaps="handled"
    >
      {/* Content */}
    </ScrollView>
  </KeyboardAvoidingView>
</View>