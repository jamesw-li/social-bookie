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
import DateTimePicker from '@react-native-community/datetimepicker';
import { supabase } from '../supabase';
import { HostEvent } from './HostEventController';

const FONT_STACK = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol"';

const webInputStyle: any = Platform.OS === 'web' ? {
  backgroundColor: '#121212',
  color: '#fff',
  borderRadius: '8px',
  padding: '14px',
  border: '1px solid #333',
  fontSize: '16px',
  width: '100%',
  outline: 'none',
  fontFamily: FONT_STACK,
  boxSizing: 'border-box' // 🚨 Prevents padding from causing overflow/cutoff
} : {};

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

  const [dateObj, setDateObj] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

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
            setDateObj(d);
            
            // Sync strings for web/manual fallback
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            setDateInput(`${yyyy}-${mm}-${dd}`);

            const hh = String(d.getHours()).padStart(2, '0');
            const min = String(d.getMinutes()).padStart(2, '0');
            setTimeInput(`${hh}:${min}`);
          } catch (e) {
            setDateObj(new Date());
          }
        }
      } else {
        setName('');
        setDescription('');
        setTriggerType('manual');
        const now = new Date();
        setDateObj(now);
        
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        setDateInput(`${yyyy}-${mm}-${dd}`);
        setTimeInput("12:00");
      }
    }
  }, [visible, existingEvent]);

  const onDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(false);
    if (selectedDate) {
      const newD = new Date(dateObj);
      newD.setFullYear(selectedDate.getFullYear());
      newD.setMonth(selectedDate.getMonth());
      newD.setDate(selectedDate.getDate());
      setDateObj(newD);
      
      const yyyy = newD.getFullYear();
      const mm = String(newD.getMonth() + 1).padStart(2, '0');
      const dd = String(newD.getDate()).padStart(2, '0');
      setDateInput(`${yyyy}-${mm}-${dd}`);
    }
  };

  const onTimeChange = (event: any, selectedTime?: Date) => {
    setShowTimePicker(false);
    if (selectedTime) {
      const newD = new Date(dateObj);
      newD.setHours(selectedTime.getHours());
      newD.setMinutes(selectedTime.getMinutes());
      newD.setSeconds(0);
      newD.setMilliseconds(0);
      setDateObj(newD);

      const hh = String(newD.getHours()).padStart(2, '0');
      const min = String(newD.getMinutes()).padStart(2, '0');
      setTimeInput(`${hh}:${min}`);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      const msg = 'Event Name cannot be empty.';
      if (Platform.OS === 'web') return window.alert(msg);
      return Alert.alert('Invalid', msg);
    }

    let parsedIsoString = null;

    if (dateInput.trim() || timeInput.trim() || triggerType === 'auto') {
      // Use the dateObj directly to avoid timezone string parsing issues
      if (!isNaN(dateObj.getTime())) {
        parsedIsoString = dateObj.toISOString();
      } else {
        const msg = 'Could not determine a valid date and time.';
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

              <Text style={styles.label}>Start Time {triggerType === 'manual' && '(Optional)'}</Text>
              <View style={styles.timeRow}>
                {/* DATE PICKER */}
                <View style={[styles.timeFieldContainer, { marginRight: Platform.OS === 'web' ? 0 : 10 }]}>
                  <Text style={styles.subLabel}>Date</Text>
                  {Platform.OS === 'web' ? (
                    <input
                      type="date"
                      value={dateInput}
                      onChange={(e: any) => {
                        const val = e.target.value;
                        setDateInput(val);
                        try {
                          const [y, m, d] = val.split('-').map(Number);
                          const newD = new Date(dateObj);
                          newD.setFullYear(y, m - 1, d);
                          setDateObj(newD);
                        } catch(err) {}
                      }}
                      style={webInputStyle}
                    />
                  ) : (
                    <TouchableOpacity style={styles.pickerTrigger} onPress={() => setShowDatePicker(true)}>
                      <Text style={styles.pickerTriggerText}>{dateInput || 'YYYY-MM-DD'}</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* TIME PICKER */}
                <View style={styles.timeFieldContainer}>
                  <Text style={styles.subLabel}>Time (24-hr)</Text>
                  {Platform.OS === 'web' ? (
                    <input
                      type="time"
                      value={timeInput}
                      onChange={(e: any) => {
                        const val = e.target.value;
                        setTimeInput(val);
                        try {
                          const [h, m] = val.split(':').map(Number);
                          const newD = new Date(dateObj);
                          newD.setHours(h, m);
                          setDateObj(newD);
                        } catch(err) {}
                      }}
                      style={webInputStyle}
                    />
                  ) : (
                    <TouchableOpacity style={styles.pickerTrigger} onPress={() => setShowTimePicker(true)}>
                      <Text style={styles.pickerTriggerText}>{timeInput || 'HH:MM'}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* NATIVE PICKERS (Mobile only) */}
              {showDatePicker && Platform.OS !== 'web' && (
                <DateTimePicker
                  value={dateObj}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'inline' : 'default'}
                  themeVariant="dark"
                  onChange={(event, selectedDate) => {
                    setShowDatePicker(false);
                    if (selectedDate) onDateChange(event, selectedDate);
                  }}
                />
              )}
              {showTimePicker && Platform.OS !== 'web' && (
                <DateTimePicker
                  value={dateObj}
                  mode="time"
                  is24Hour={true}
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  themeVariant="dark"
                  onChange={(event, selectedTime) => {
                    setShowTimePicker(false);
                    if (selectedTime) onTimeChange(event, selectedTime);
                  }}
                />
              )}

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
    flexWrap: 'wrap',
    marginHorizontal: -5,
    marginBottom: 10,
  },
  timeFieldContainer: {
    flex: 1,
    minWidth: 160,
    marginHorizontal: 5,
    marginBottom: 10,
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
  pickerTrigger: {
    backgroundColor: '#121212',
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: '#333',
    justifyContent: 'center',
    position: 'relative', // 🚨 Required for the overlay input
  },
  pickerTriggerText: {
    color: '#fff',
    fontSize: 16,
  },
});
