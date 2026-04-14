import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Platform } from 'react-native';
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
  onEventChanged: () => void;
  onEditRequest?: () => void;
}

export default function HostEventController({ event, onEventChanged, onEditRequest }: HostEventControllerProps) {
  const [isProcessing, setIsProcessing] = useState(false);

  const handleOpenEvent = async () => {
    setIsProcessing(true);
    try {
      const { error } = await supabase
        .from('events')
        .update({ status: 'live' })
        .eq('id', event.id);

      if (error) throw error;
      onEventChanged();
    } catch (error: any) {
      if (Platform.OS === 'web') window.alert(error.message);
      else Alert.alert('Error', error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCloseEvent = async () => {
    const title = 'Close & Refund?';
    const msg = 'This will lock the board and securely refund all un-graded bets to players.';

    const executeClose = async () => {
      setIsProcessing(true);
      try {
        // Option B: Safety-first RPC call mimicking the campaign closure
        const { error } = await supabase.rpc('close_event_and_refund', { 
          p_event_id: event.id 
        });

        if (error) throw error;
        onEventChanged();
      } catch (error: any) {
        if (Platform.OS === 'web') window.alert(error.message);
        else Alert.alert('Error closing event', error.message);
      } finally {
        setIsProcessing(false);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`${title}\n\n${msg}`)) executeClose();
    } else {
      Alert.alert(title, msg, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Close Event', style: 'destructive', onPress: executeClose }
      ]);
    }
  };


  if (event.status === 'completed') {
    return (
      <View style={[styles.container, styles.completedContainer]}>
        <Text style={styles.warningBanner}>⚠️ Betting is temporarily closed.</Text>
        <Text style={styles.completedText}>🔒 This event has been completed and locked.</Text>
        <TouchableOpacity 
          style={styles.reopenButton} 
          onPress={handleOpenEvent}
          disabled={isProcessing}
        >
          <Text style={styles.reopenButtonText}>
            {isProcessing ? 'Processing...' : 'Unlock Board (Re-Open)'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (event.status === 'live') {
    return (
      <View style={styles.container}>
        <View style={styles.stateHeaderRow}>
          <View>
            <Text style={styles.stateTitle}>🟢 Event is Live</Text>
            <Text style={styles.stateSubtitle}>The board is open. Wagers are active.</Text>
          </View>
          {onEditRequest && (
            <TouchableOpacity style={styles.editButton} onPress={onEditRequest}>
              <Text style={styles.editButtonText}>✏️ Edit Settings</Text>
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity 
          style={styles.dangerButton} 
          onPress={handleCloseEvent}
          disabled={isProcessing}
        >
          <Text style={styles.dangerButtonText}>
            {isProcessing ? 'Processing...' : '🔒 Close Event (Lock Board)'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  // event.status === 'scheduled'
  if (event.trigger_type === 'auto') {
    const timeString = new Date(event.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return (
      <View style={styles.container}>
        <View style={styles.stateHeaderRow}>
          <Text style={styles.stateTitle}>⏳ Scheduled Event Context</Text>
          {onEditRequest && (
            <TouchableOpacity style={styles.editButton} onPress={onEditRequest}>
              <Text style={styles.editButtonText}>✏️ Edit Settings</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.autoBlock}>
          <Text style={styles.autoText}>⏰ Auto-opens at {timeString}</Text>
          <TouchableOpacity 
            style={styles.secondaryButton} 
            onPress={handleOpenEvent}
            disabled={isProcessing}
          >
            <Text style={styles.secondaryButtonText}>
               {isProcessing ? 'Opening...' : 'Force Open Early'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Scheduled and Manual
  return (
    <View style={styles.container}>
      <View style={styles.stateHeaderRow}>
        <View style={{ flex: 1, paddingRight: 10 }}>
          <Text style={styles.stateTitle}>⏳ Scheduled Event Context</Text>
          <Text style={styles.stateSubtitle}>Bets are locked until you manually open the floor.</Text>
        </View>
        {onEditRequest && (
          <TouchableOpacity style={styles.editButton} onPress={onEditRequest}>
            <Text style={styles.editButtonText}>✏️ Edit Settings</Text>
          </TouchableOpacity>
        )}
      </View>
      <TouchableOpacity 
        style={styles.primaryButton} 
        onPress={handleOpenEvent}
        disabled={isProcessing}
      >
        <Text style={styles.primaryButtonText}>
          {isProcessing ? 'Opening...' : '🔓 Open Action (Live)'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1e1e1e',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
    marginBottom: 20,
    marginTop: 10,
  },
  completedContainer: {
    borderColor: '#444',
    alignItems: 'center',
    paddingVertical: 20,
  },
  completedText: {
    color: '#a0a0a0',
    fontWeight: 'bold',
    fontSize: 16,
  },
  stateTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  stateSubtitle: {
    color: '#a0a0a0',
    fontSize: 14,
    marginBottom: 16,
  },
  primaryButton: {
    backgroundColor: '#00D084',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    shadowColor: '#00D084',
    shadowOpacity: 0.2,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
  },
  primaryButtonText: {
    color: '#121212',
    fontWeight: 'bold',
    fontSize: 16,
  },
  dangerButton: {
    backgroundColor: '#ff4444',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    shadowColor: '#ff4444',
    shadowOpacity: 0.2,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
  },
  dangerButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  autoBlock: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#121212',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
    marginTop: 8,
  },
  autoText: {
    color: '#FFD700',
    fontSize: 14,
    fontWeight: 'bold',
    flex: 1,
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#00D084',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  secondaryButtonText: {
    color: '#00D084',
    fontWeight: 'bold',
    fontSize: 12,
  },
  warningBanner: {
    color: '#FFD700',
    fontWeight: 'bold',
    fontSize: 14,
    marginBottom: 8,
  },
  reopenButton: {
    backgroundColor: '#FFD700',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginTop: 15,
  },
  reopenButtonText: {
    color: '#121212',
    fontWeight: 'bold',
  },
  stateHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  editButton: {
    backgroundColor: '#2a2a2a',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#444'
  },
  editButtonText: {
    color: '#e0e0e0',
    fontSize: 12,
  },
});
