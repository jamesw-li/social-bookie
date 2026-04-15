import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Modal,
  Alert,
  KeyboardAvoidingView,
  ScrollView,
  Platform
} from 'react-native';
import { supabase } from '../supabase';
import { HostEvent } from './HostEventController';

interface EventFormModalProps {
  visible: boolean;
  onClose: () => void;
  existingEvent: HostEvent | null;
  campaignId: string | null;
  onSaveComplete: () => void;
}

export default function EventFormModal({ visible, onClose, existingEvent, campaignId, onSaveComplete }: EventFormModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [triggerType, setTriggerType] = useState<'manual' | 'auto'>('manual');

  // Explicit strings for Expo Web compat
  const [dateInput, setDateInput] = useState('');
  const [timeInput, setTimeInput] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (visible) {
      if (existingEvent) {
        setName(existingEvent.name);
        setDescription(existingEvent.description || '');
        setTriggerType(existingEvent.trigger_type || 'manual');

        if (existingEvent.start_time) {
          try {
            const d = new Date(existingEvent.start_time);
            // Format to YYYY-MM-DD
            const yyyy = d.getUTCFullYear();
            const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
            const dd = String(d.getUTCDate()).padStart(2, '0');
            setDateInput(`${yyyy}-${mm}-${dd}`);

            // Format to HH:MM
            const hh = String(d.getUTCHours()).padStart(2, '0');
            const min = String(d.getUTCMinutes()).padStart(2, '0');
            setTimeInput(`${hh}:${min}`);
          } catch (e) {
            setDateInput('');
            setTimeInput('');
          }
        }
      } else {
        // Reset form for create mode
        setName('');
        setDescription('');
        setTriggerType('manual');
        setDateInput('');
        setTimeInput('');
      }
    }
  }, [visible, existingEvent]);

  const handleSave = async () => {
    if (!name.trim()) {
      const msg = 'Event Name cannot be empty.';
      if (Platform.OS === 'web') return window.alert(msg);
      return Alert.alert('Invalid', msg);
    }

    let parsedIsoString = null;

    if (dateInput.trim() || timeInput.trim() || triggerType === 'auto') {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      const timeRegex = /^\d{2}:\d{2}$/;

      if (!dateRegex.test(dateInput)) {
        const msg = 'Date must be in YYYY-MM-DD format.';
        if (Platform.OS === 'web') return window.alert(msg);
        return Alert.alert('Invalid', msg);
      }
      if (!timeRegex.test(timeInput)) {
        const msg = 'Time must be in HH:MM format (24-hr).';
        if (Platform.OS === 'web') return window.alert(msg);
        return Alert.alert('Invalid', msg);
      }

      // We treat the input as UTC for consistent DB storage
      try {
        const dateObj = new Date(`${dateInput}T${timeInput}:00Z`);
        if (isNaN(dateObj.getTime())) {
          throw new Error('Invalid date/time values (e.g. month 13)');
        }
        parsedIsoString = dateObj.toISOString();
      } catch (err: any) {
        const msg = err.message || 'Could not parse date and time.';
        if (Platform.OS === 'web') return window.alert(msg);
        return Alert.alert('Invalid Date', msg);
      }
    }

    if (triggerType === 'auto' && !parsedIsoString) {
      const msg = 'Auto-trigger events require a valid Date and Time.';
      if (Platform.OS === 'web') return window.alert(msg);
      return Alert.alert('Invalid', msg);
    }

    setIsSubmitting(true);
    try {
      if (existingEvent) {
        const { error } = await supabase.from('events').update({
          name: name.trim(),
          description: description.trim(),
          trigger_type: triggerType,
          start_time: parsedIsoString
        }).eq('id', existingEvent.id);

        if (error) throw error;
      } else {
        if (!campaignId) throw new Error('Missing campaign reference.');
        const { error } = await supabase.from('events').insert([{
          campaign_id: campaignId,
          name: name.trim(),
          description: description.trim(),
          status: 'scheduled',
          trigger_type: triggerType,
          start_time: parsedIsoString
        }]);

        if (error) throw error;
      }

      onSaveComplete();
      onClose();
    } catch (error: any) {
      if (Platform.OS === 'web') window.alert(error.message);
      else Alert.alert('Error Saving Event', error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      {/* Holy Grail Layout applied to Modal */}
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.85)' }}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 40 : 20}
        >
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-end' }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.modalContent}>
              <View style={styles.header}>
                <Text style={styles.title}>{existingEvent ? 'Edit Event' : 'Create Event'}</Text>
                <TouchableOpacity onPress={onClose} disabled={isSubmitting}>
                  <Text style={styles.closeText}>Cancel</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>Event Name</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Saturday Main Event"
                placeholderTextColor="#666"
                value={name}
                onChangeText={setName}
              />

              <Text style={styles.label}>Description (Optional)</Text>
              <TextInput
                style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]}
                placeholder="Brief description of the action..."
                placeholderTextColor="#666"
                multiline
                value={description}
                onChangeText={setDescription}
              />

              <Text style={styles.label}>Trigger Type</Text>
              <View style={styles.segmentContainer}>
                <TouchableOpacity
                  style={[styles.segmentBtn, triggerType === 'manual' && styles.segmentBtnActive]}
                  onPress={() => setTriggerType('manual')}
                >
                  <Text style={[styles.segmentText, triggerType === 'manual' && styles.segmentTextActive]}>Manual</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.segmentBtn, triggerType === 'auto' && styles.segmentBtnActive]}
                  onPress={() => setTriggerType('auto')}
                >
                  <Text style={[styles.segmentText, triggerType === 'auto' && styles.segmentTextActive]}>Auto-Timer</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>Start Time (UTC) {triggerType === 'manual' && '(Optional)'}</Text>
              <View style={styles.timeRow}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={styles.subLabel}>Date (YYYY-MM-DD)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor="#666"
                    value={dateInput}
                    onChangeText={setDateInput}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.subLabel}>Time (HH:MM)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="14:00"
                    placeholderTextColor="#666"
                    value={timeInput}
                    onChangeText={setTimeInput}
                  />
                </View>
              </View>

              <TouchableOpacity
                style={[styles.saveButton, isSubmitting && { opacity: 0.7 }]}
                onPress={handleSave}
                disabled={isSubmitting}
              >
                <Text style={styles.saveButtonText}>{isSubmitting ? 'Saving...' : 'Save Settings'}</Text>
              </TouchableOpacity>

              {/* Bottom Padding for SafeArea */}
              {Platform.OS === 'ios' && <View style={{ height: 40 }} />}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContent: {
    backgroundColor: '#1e1e1e',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 30,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
  },
  closeText: {
    color: '#ff4444',
    fontSize: 16,
    fontWeight: 'bold',
  },
  label: {
    color: '#e0e0e0',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
    marginTop: 10,
  },
  subLabel: {
    color: '#a0a0a0',
    fontSize: 12,
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#121212',
    color: '#fff',
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: '#333',
    fontSize: 16,
  },
  segmentContainer: {
    flexDirection: 'row',
    backgroundColor: '#121212',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
    padding: 4,
    marginBottom: 10,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 6,
  },
  segmentBtnActive: {
    backgroundColor: '#00D084',
  },
  segmentText: {
    color: '#a0a0a0',
    fontWeight: 'bold',
  },
  segmentTextActive: {
    color: '#121212',
  },
  timeRow: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  saveButton: {
    backgroundColor: '#00D084',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
    shadowColor: '#00D084',
    shadowOpacity: 0.3,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
  },
  saveButtonText: {
    color: '#121212',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
