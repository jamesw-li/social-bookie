import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, FlatList, Platform } from 'react-native';

export type EventStatus = 'scheduled' | 'live' | 'completed';

export interface EventItem {
  id: string;
  name: string;
  status: EventStatus;
  start_time?: string;
}

interface EventSwitcherProps {
  events: EventItem[];
  activeEventId: string | null;
  onSelectEvent: (eventId: string) => void;
}

export default function EventSwitcher({ events, activeEventId, onSelectEvent }: EventSwitcherProps) {
  const [modalVisible, setModalVisible] = useState(false);

  const getIcon = (status: EventStatus) => {
    switch (status) {
      case 'live': return '🟢';
      case 'scheduled': return '⏳';
      case 'completed': return '🔒';
      default: return '';
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  };

  const activeEvent = events.find(e => e.id === activeEventId) || events[0];

  const getDisplayText = (event?: EventItem) => {
    if (!event) return 'Select Event';
    if (event.start_time) return `${event.name}  ·  ${formatDate(event.start_time)}`;
    return event.name;
  };

  // Trigger pill shows name only; dropdown rows show full text
  const getTriggerText = (event?: EventItem) => event?.name ?? 'Select Event';

  return (
    <View style={styles.container}>
      {/* The Active Dropdown Pill */}
      <TouchableOpacity 
        style={styles.dropdownButton} 
        onPress={() => setModalVisible(true)}
      >
        <Text style={styles.dropdownIcon}>{getIcon(activeEvent?.status)}</Text>
        <Text style={styles.dropdownText}>{getTriggerText(activeEvent)}</Text>
        <Text style={styles.chevron}>▼</Text>
      </TouchableOpacity>

      {/* The Action Sheet Modal */}
      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay} 
          activeOpacity={1} 
          onPress={() => setModalVisible(false)}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Event</Text>
            </View>
            
            <FlatList
              data={events}
              scrollEnabled={false}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => {
                const isActive = item.id === activeEventId;
                return (
                  <TouchableOpacity
                    style={[styles.eventRow, isActive && styles.eventRowActive]}
                    onPress={() => {
                      onSelectEvent(item.id);
                      setModalVisible(false);
                    }}
                  >
                    <View style={styles.eventRowLeft}>
                      <Text style={styles.rowIcon}>{getIcon(item.status)}</Text>
                      <Text style={[styles.rowText, isActive && styles.rowTextActive]}>
                        {item.name}
                      </Text>
                    </View>
                    {item.start_time && (
                      <Text style={styles.rowTime}>{formatDate(item.start_time)}</Text>
                    )}
                    {isActive && <Text style={styles.checkmark}>✓</Text>}
                  </TouchableOpacity>
                );
              }}
            />
            {Platform.OS === 'ios' && <View style={{ height: 20 }} />}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'flex-start',
    marginVertical: 4,
  },
  dropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e1e1e',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
  },
  dropdownIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  dropdownText: {
    color: '#e0e0e0',
    fontSize: 14,
    fontWeight: 'bold',
    marginRight: 8,
  },
  chevron: {
    color: '#a0a0a0',
    fontSize: 10,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  modalContent: {
    backgroundColor: '#1e1e1e',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 30, // SafeArea allowance
  },
  modalHeader: {
    marginBottom: 15,
    alignItems: 'center',
  },
  modalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  eventRowActive: {
    backgroundColor: 'rgba(0, 208, 132, 0.1)',
    borderBottomColor: 'transparent',
  },
   eventRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  rowIcon: {
    fontSize: 16,
    marginRight: 10,
  },
  rowText: {
    color: '#a0a0a0',
    fontSize: 16,
    fontWeight: '500',
  },
  rowTextActive: {
    color: '#00D084',
    fontWeight: 'bold',
  },
   checkmark: {
    color: '#00D084',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 10,
  },
  rowTime: {
    color: '#666',
    fontSize: 13,
    marginLeft: 10,
  },
});
