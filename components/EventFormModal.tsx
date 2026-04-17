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
  Platform,
  ActivityIndicator
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { supabase } from '../supabase';
import { HostEvent } from './HostEventController';

const FONT_STACK = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol"';

const webInputStyle: any = Platform.OS === 'web' ? {
  backgroundColor: '#121212',
  color: '#fff',
  borderRadius: '8px',
  padding: '12px 14px',
  border: '1px solid #333',
  fontSize: '14px',
  width: '100%',
  outline: 'none',
  fontFamily: FONT_STACK,
  boxSizing: 'border-box'
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
      statusBarTranslucent={true}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView 
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{existingEvent ? 'Edit Event' : 'Create Event'}</Text>
            <TouchableOpacity onPress={onClose} disabled={isSubmitting}>
              <Text style={styles.specCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            style={{ maxHeight: 400 }}
          >
            <Text style={styles.specSectionLabel}>General Information</Text>
            
            <View style={{ marginBottom: 15 }}>
              <Text style={styles.label}>Event Name</Text>
              <TextInput
                style={styles.specInput}
                placeholder="e.g. Saturday Main Event"
                placeholderTextColor="#666"
                value={name}
                onChangeText={setName}
              />
            </View>

            <View style={{ marginBottom: 15 }}>
              <Text style={styles.label}>Description (Optional)</Text>
              <TextInput
                style={[styles.specInput, { minHeight: 80, textAlignVertical: 'top' }]}
                placeholder="Brief description of the action..."
                placeholderTextColor="#666"
                multiline
                value={description}
                onChangeText={setDescription}
              />
            </View>

            <View style={{ marginBottom: 15 }}>
              <Text style={styles.specSectionLabel}>Scheduling & Automation</Text>
              
              <Text style={styles.label}>Trigger Type</Text>
              <View style={styles.specTypeSelectorRow}>
                <TouchableOpacity
                  style={[styles.specTypeBtn, triggerType === 'manual' && styles.specTypeBtnActive]}
                  onPress={() => setTriggerType('manual')}
                >
                  <Text style={[styles.specTypeBtnText, triggerType === 'manual' && styles.specTypeBtnTextActive]}>Manual</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.specTypeBtn, triggerType === 'auto' && styles.specTypeBtnActive]}
                  onPress={() => setTriggerType('auto')}
                >
                  <Text style={[styles.specTypeBtnText, triggerType === 'auto' && styles.specTypeBtnTextActive]}>Auto-Timer</Text>
                </TouchableOpacity>
              </View>

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Start Date</Text>
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
                    <TouchableOpacity style={styles.specInput} onPress={() => setShowDatePicker(true)}>
                      <Text style={{ color: '#fff', fontSize: 14 }}>{dateInput || 'YYYY-MM-DD'}</Text>
                    </TouchableOpacity>
                  )}
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Start Time (24-hr)</Text>
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
                    <TouchableOpacity style={styles.specInput} onPress={() => setShowTimePicker(true)}>
                      <Text style={{ color: '#fff', fontSize: 14 }}>{timeInput || 'HH:MM'}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {showDatePicker && Platform.OS !== 'web' && (
                <DateTimePicker
                  value={dateObj}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'inline' : 'default'}
                  themeVariant="dark"
                  onChange={onDateChange}
                />
              )}
              {showTimePicker && Platform.OS !== 'web' && (
                <DateTimePicker
                  value={dateObj}
                  mode="time"
                  is24Hour={true}
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  themeVariant="dark"
                  onChange={onTimeChange}
                />
              )}
            </View>
          </ScrollView>

          <TouchableOpacity
            style={[styles.specSubmitBtn, isSubmitting && { opacity: 0.7 }]}
            onPress={handleSave}
            disabled={isSubmitting}
          >
            {isSubmitting ? <ActivityIndicator color="#000" /> : (
              <Text style={styles.specSubmitBtnText}>SAVE SETTINGS</Text>
            )}
          </TouchableOpacity>

          {Platform.OS === 'ios' && <View style={{ height: 40 }} />}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1e1e1e',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 25,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  specCancelText: {
    color: '#ff4444',
    fontSize: 16,
    fontWeight: 'bold',
  },
  specSectionLabel: {
    color: '#e0e0e0',
    fontSize: 13,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  label: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  specInput: {
    backgroundColor: '#121212',
    color: '#fff',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#333',
    fontSize: 14,
  },
  specTypeSelectorRow: {
    flexDirection: 'row',
    backgroundColor: '#121212',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
    padding: 4,
    marginBottom: 15,
  },
  specTypeBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 6,
  },
  specTypeBtnActive: {
    backgroundColor: '#00D084',
  },
  specTypeBtnText: {
    color: '#a0a0a0',
    fontWeight: 'bold',
    fontSize: 12,
  },
  specTypeBtnTextActive: {
    color: '#121212',
  },
  specSubmitBtn: {
    backgroundColor: '#00D084',
    paddingVertical: 15,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 15,
  },
  specSubmitBtnText: {
    color: '#121212',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
