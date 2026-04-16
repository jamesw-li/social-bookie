import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';

export interface BetCountdownItem {
  id: string;
  status: string;
  trigger_type?: string | null;
  lock_at?: string | null;
}

interface BetCountdownProps {
  bet: BetCountdownItem;
  onZero?: () => void;
  mode?: 'full' | 'icon-only' | 'status-only';
  color?: string;
}

export default function BetCountdown({ bet, onZero, mode = 'full', color }: BetCountdownProps) {
  const [timeLeft, setTimeLeft] = useState<string | null>(null);

  useEffect(() => {
    // Show countdown for 'open' (guests) and also 'locked' (hosts) if auto-trigger is active
    if (!['open', 'locked'].includes(bet.status) || bet.trigger_type !== 'auto' || !bet.lock_at) {
      setTimeLeft(null);
      return;
    }

    const interval = setInterval(() => {
      const now = new Date().getTime();
      const lock = new Date(bet.lock_at!).getTime();
      const diff = lock - now;

      if (diff <= 0) {
        setTimeLeft('00:00');
        if (onZero) onZero();
        return; // Logic changed: don't clear interval if we want it to stay at 00:00, or just stop here.
      } else {
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);

        const hDisplay = hours > 0 ? `${hours}:` : '';
        const mDisplay = minutes < 10 && hours > 0 ? `0${minutes}` : minutes;
        const sDisplay = seconds < 10 ? `0${seconds}` : seconds;
        setTimeLeft(`${hDisplay}${mDisplay}:${sDisplay}`);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [bet.id, bet.status, bet.lock_at, bet.trigger_type]);

  if (!timeLeft) return null;

  if (mode === 'status-only') {
    return <Text style={[styles.statusOnlyText, color ? { color } : null]}>{timeLeft}</Text>;
  }

  if (mode === 'icon-only') {
    return <Text style={[styles.iconText, color ? { color } : null]}>{timeLeft}</Text>;
  }

  return (
    <View style={styles.countdownBadge}>
      <Text style={[styles.countdownText, color ? { color } : null]}>LOCKS IN: {timeLeft}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  countdownBadge: {
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.3)',
    marginTop: 8,
    alignSelf: 'flex-start'
  },
  countdownText: {
    color: '#FFD700',
    fontSize: 10,
    fontWeight: 'bold',
  },
  iconText: {
    color: '#FFD700',
    fontSize: 12,
    fontWeight: 'bold',
    marginLeft: 6
  },
  statusOnlyText: {
    color: '#00D084',
    fontSize: 10,
    fontWeight: 'bold',
    marginLeft: 4
  }
});
