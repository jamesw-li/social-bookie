import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Platform, ActivityIndicator, Switch } from 'react-native';
import { supabase } from '../supabase';

export type TriggerType = 'manual' | 'auto';
export type EventStatus = 'scheduled' | 'live' | 'completed';

export interface HostEvent {
  id: string;
  name: string;
  status: EventStatus;
  trigger_type: TriggerType;
  start_time: string;
  description?: string;
}

interface HostEventControllerProps {
  event: HostEvent;
  onEventChanged: (silent?: boolean) => void;
  onEditRequest?: () => void;
}

export default function HostEventController({ event, onEventChanged, onEditRequest }: HostEventControllerProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  // Local state for optimistic UI
  const [localStatus, setLocalStatus] = useState<EventStatus>(event.status);

  // Sync local status if the prop changes (e.g. from a background refresh)
  useEffect(() => {
    setLocalStatus(event.status);
  }, [event.status]);

  const handleToggleStatus = async (value: boolean) => {
    const newStatus: EventStatus = value ? 'live' : 'scheduled';
    
    // 1. Optimistic Update
    setLocalStatus(newStatus);
    setIsProcessing(true);

    try {
      const { error } = await supabase
        .from('events')
        .update({ status: newStatus })
        .eq('id', event.id);

      if (error) {
        // Rollback on error
        setLocalStatus(event.status);
        throw error;
      }
      
      // 2. Silent Refresh (updates other global states without showing the full-page loader)
      onEventChanged(true);
    } catch (error: any) {
      if (Platform.OS === 'web') window.alert(error.message);
      else Alert.alert('Error', error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCloseEvent = async () => {
    const title = 'Close & Refund?';
    const msg = 'This will lock the board and securely refund all un-graded bets to players for this event.';

    const executeClose = async () => {
      setIsClosing(true);
      try {
        const { error } = await supabase.rpc('close_event_and_refund', { 
          p_event_id: event.id 
        });

        if (error) throw error;
        onEventChanged(); // Full refresh might be better here as it's a major state change
      } catch (error: any) {
        if (Platform.OS === 'web') window.alert(error.message);
        else Alert.alert('Error closing event', error.message);
      } finally {
        setIsClosing(false);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`${title}\n\n${msg}`)) executeClose();
    } else {
      Alert.alert(title, msg, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Close', style: 'destructive', onPress: executeClose }
      ]);
    }
  };

  const timeString = new Date(event.start_time).toLocaleTimeString([], { 
    weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
  });

  const isActive = localStatus === 'live';

  return (
    <View style={styles.container}>
      {/* Left side: Details */}
      <TouchableOpacity 
        style={styles.detailsArea} 
        onPress={onEditRequest}
        activeOpacity={0.7}
      >
        <View style={styles.headerRow}>
          <Text style={styles.eventName} numberOfLines={1}>{event.name}</Text>
          <Text style={[styles.statusBadge, isActive ? styles.statusLive : localStatus === 'completed' ? styles.statusCompleted : styles.statusLocked]}>
            {(localStatus || 'UNKNOWN').toUpperCase()}
          </Text>
        </View>
        
        <View style={styles.infoRow}>
          <Text style={styles.infoText}>⏰ {timeString}</Text>
        </View>

        {(event.description || event.trigger_type) && (
          <Text style={styles.descriptionText} numberOfLines={1}>
            🕹️ {(event.trigger_type || 'manual').toUpperCase()} {event.description ? `• ${event.description}` : ''}
          </Text>
        )}
        
        <Text style={styles.editHint}>Tap to edit</Text>
      </TouchableOpacity>

      {/* Right side: Controls */}
      <View style={styles.controlsArea}>
        {localStatus !== 'completed' ? (
          <>
            <View style={styles.toggleWrapper}>
              <Text style={[styles.toggleLabel, !isActive && styles.labelLocked]}>LOCKED</Text>
              <Switch
                trackColor={{ false: '#333', true: 'rgba(0, 208, 132, 0.3)' }}
                thumbColor={isActive ? '#00D084' : '#666'}
                ios_backgroundColor="#333"
                onValueChange={handleToggleStatus}
                value={isActive}
                disabled={isProcessing || isClosing}
              />
              <Text style={[styles.toggleLabel, isActive && styles.labelActive]}>ACTIVE</Text>
            </View>

            <TouchableOpacity 
              style={[styles.closeButton, isClosing && { opacity: 0.5 }]} 
              onPress={handleCloseEvent}
              disabled={isClosing}
            >
              {isClosing ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.closeButtonText}>Close</Text>}
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity 
            style={styles.reopenButton} 
            onPress={() => handleToggleStatus(true)}
            disabled={isProcessing || isClosing}
          >
            <Text style={styles.reopenButtonText}>Re-Open</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
    marginBottom: 15,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  detailsArea: {
    flex: 1,
    padding: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.01)',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  eventName: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
    flexShrink: 1,
  },
  statusBadge: {
    fontSize: 8,
    fontWeight: 'bold',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
    marginLeft: 10,
  },
  statusLive: { backgroundColor: 'rgba(0, 208, 132, 0.2)', color: '#00D084' },
  statusLocked: { backgroundColor: 'rgba(255, 184, 0, 0.1)', color: '#FFB800' },
  statusCompleted: { backgroundColor: 'rgba(255, 68, 68, 0.2)', color: '#FF4444' },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  infoText: {
    color: '#A0A0A0',
    fontSize: 12,
  },
  descriptionText: {
    color: '#666',
    fontSize: 11,
    marginBottom: 8,
  },
  editHint: {
    color: '#444',
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  controlsArea: {
    width: 120,
    padding: 10,
    alignItems: 'center',
    borderLeftWidth: 1,
    borderLeftColor: '#2a2a2a',
    backgroundColor: 'rgba(0,0,0,0.1)',
    height: '100%',
    justifyContent: 'center',
  },
  closeButton: {
    backgroundColor: '#7f1d1d', // Muted dark red
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    width: '100%',
    alignItems: 'center',
    marginTop: 12,
  },
  closeButtonText: {
    color: '#ff9999',
    fontWeight: 'bold',
    fontSize: 12,
  },
  toggleWrapper: {
    alignItems: 'center',
    width: '100%',
    marginBottom: 8,
  },
  toggleLabel: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#444',
    marginVertical: 2,
  },
  labelActive: { color: '#00D084' },
  labelLocked: { color: '#FFB800' },
  reopenButton: {
    borderWidth: 1,
    borderColor: '#00D084',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    width: '100%',
    alignItems: 'center',
  },
  reopenButtonText: {
    color: '#00D084',
    fontWeight: 'bold',
    fontSize: 12,
  },
});
