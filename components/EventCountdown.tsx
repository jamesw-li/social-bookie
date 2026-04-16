import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { EventItem } from './EventSwitcher';

interface EventCountdownProps {
  event: EventItem;
  onZero?: () => void;
}

export default function EventCountdown({ event, onZero }: EventCountdownProps) {
  const [timeLeft, setTimeLeft] = useState<string | null>(null);

  useEffect(() => {
    if (event.status !== 'scheduled' || event.trigger_type !== 'auto' || !event.start_time) {
      setTimeLeft(null);
      return;
    }

    const interval = setInterval(() => {
      const now = new Date().getTime();
      const start = new Date(event.start_time!).getTime();
      const diff = start - now;

      if (diff <= 0) {
        setTimeLeft('00:00');
        clearInterval(interval);
        if (onZero) onZero();
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
  }, [event.id, event.status, event.start_time, event.trigger_type]);

  if (!timeLeft) return null;

  return (
    <View style={styles.countdownBadge}>
      <Text style={styles.countdownText}>⏳ {timeLeft}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  countdownBadge: {
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.3)',
  },
  countdownText: {
    color: '#FFD700',
    fontSize: 14,
    fontWeight: 'bold',
  },
});
