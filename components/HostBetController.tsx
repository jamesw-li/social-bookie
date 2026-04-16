import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Switch, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export interface BetOption {
  id: string;
  label: string;
}

export interface HostBet {
  id: string;
  question: string;
  status: 'open' | 'locked' | 'matched' | 'graded' | 'canceled';
  event_id: string | null;
  type: string;
  isP2P?: boolean;
  isBlind?: boolean;
  bet_options?: BetOption[];
  event_name?: string;
}

interface HostBetControllerProps {
  bet: HostBet;
  onStatusToggle: (betId: string, newStatus: string) => void;
  onGradeRequest: (bet: HostBet) => void;
  onDeleteRequest: (bet: HostBet) => void;
  onRefundRequest: (bet: HostBet) => void;
  isProcessing?: boolean;
}

export default function HostBetController({ 
  bet, 
  onStatusToggle, 
  onGradeRequest, 
  onDeleteRequest, 
  onRefundRequest,
  isProcessing 
}: HostBetControllerProps) {
  const [localStatus, setLocalStatus] = useState<HostBet['status']>(bet.status);
  const [menuVisible, setMenuVisible] = useState(false);

  // Sync with props if they change in background
  useEffect(() => {
    setLocalStatus(bet.status);
  }, [bet.status]);

  const isActive = localStatus === 'locked' || localStatus === 'matched';
  const canGrade = isActive;

  const handleToggle = (value: boolean) => {
    let nextStatus: HostBet['status'] = 'open';
    if (bet.isBlind) {
      nextStatus = value ? 'matched' : 'open';
    } else {
      nextStatus = value ? 'locked' : 'open';
    }
    
    setLocalStatus(nextStatus); // Optimistic flip
    onStatusToggle(bet.id, nextStatus);
  };

  const getBadgeStyle = () => {
    switch (localStatus) {
      case 'open': return styles.badgeOpen;
      case 'locked':
      case 'matched': return styles.badgeActive;
      case 'graded': return styles.badgeGraded;
      default: return styles.badgeDefault;
    }
  };

  return (
    <View style={styles.container}>
      {/* Left: Details */}
      <View style={styles.detailsArea}>
        <View style={styles.headerRow}>
          <Text style={[styles.statusBadge, getBadgeStyle()]}>{localStatus.toUpperCase()}</Text>
          {bet.isBlind && <Text style={styles.typeTag}>🤝 BLIND</Text>}
          {bet.isP2P && <Text style={styles.typeTag}>🥊 P2P</Text>}
        </View>

        <Text style={styles.questionText}>{bet.question}</Text>
        
        {bet.bet_options && bet.bet_options.length > 0 && (
          <View style={styles.optionsRow}>
            {bet.bet_options.map((opt, idx) => (
              <Text key={opt.id} style={styles.optionText}>
                {opt.label}{idx < bet.bet_options!.length - 1 ? ' • ' : ''}
              </Text>
            ))}
          </View>
        )}
      </View>

      {/* Right: Controls */}
      <View style={styles.controlsArea}>
        <View style={styles.topActions}>
          <TouchableOpacity 
            style={styles.menuBtn} 
            onPress={() => setMenuVisible(!menuVisible)}
          >
            <MaterialCommunityIcons name="dots-horizontal" size={20} color="#888" />
          </TouchableOpacity>
          
          {menuVisible && (
            <View style={styles.popupMenu}>
              <TouchableOpacity style={styles.menuItem} onPress={() => { onRefundRequest(bet); setMenuVisible(false); }}>
                <Text style={styles.menuItemText}>💰 Refund (Void)</Text>
              </TouchableOpacity>
              <View style={styles.menuDivider} />
              <TouchableOpacity style={styles.menuItem} onPress={() => { onDeleteRequest(bet); setMenuVisible(false); }}>
                <Text style={styles.menuItemRedText}>🗑️ Delete & Refund</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={styles.toggleSection}>
          <Text style={[styles.toggleLabel, !isActive && styles.labelOpenActive]}>OPEN</Text>
          <Switch
            value={isActive}
            onValueChange={handleToggle}
            trackColor={{ false: '#333', true: 'rgba(0, 208, 132, 0.3)' }}
            thumbColor={isActive ? '#00D084' : '#666'}
            disabled={isProcessing}
          />
          <Text style={[styles.toggleLabel, isActive && styles.labelLockedActive]}>
            {bet.isBlind ? 'MATCH' : 'LOCK'}
          </Text>
        </View>

        <TouchableOpacity 
          style={[styles.gradeBtn, !canGrade && styles.gradeBtnDisabled]} 
          onPress={() => onGradeRequest(bet)}
          disabled={!canGrade || isProcessing}
        >
          <Text style={[styles.gradeBtnText, !canGrade && styles.gradeBtnTextDisabled]}>GRADE</Text>
        </TouchableOpacity>
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
    marginBottom: 12,
    flexDirection: 'row',
    overflow: 'visible', // To allow popup menu
    minHeight: 120,
  },
  detailsArea: {
    flex: 1,
    padding: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    flexWrap: 'wrap',
    gap: 6,
  },
  statusBadge: {
    fontSize: 8,
    fontWeight: 'bold',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  badgeOpen: { backgroundColor: 'rgba(0, 208, 132, 0.2)', color: '#00D084' },
  badgeActive: { backgroundColor: 'rgba(255, 68, 68, 0.2)', color: '#FF4444' },
  badgeGraded: { backgroundColor: 'rgba(187, 134, 252, 0.2)', color: '#BB86FC' },
  badgeDefault: { backgroundColor: '#333', color: '#888' },
  typeTag: {
    color: '#BB86FC',
    fontSize: 9,
    fontWeight: 'bold',
    backgroundColor: 'rgba(187, 134, 252, 0.1)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  questionText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 8,
    lineHeight: 20,
  },
  optionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  optionText: {
    color: '#888',
    fontSize: 11,
  },
  controlsArea: {
    width: 110,
    padding: 8,
    borderLeftWidth: 1,
    borderLeftColor: '#2A2A2A',
    backgroundColor: 'rgba(0,0,0,0.15)',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topActions: {
    width: '100%',
    alignItems: 'flex-end',
    zIndex: 10,
  },
  menuBtn: {
    padding: 4,
  },
  popupMenu: {
    position: 'absolute',
    top: 30,
    right: 0,
    backgroundColor: '#2A2A2A',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#444',
    width: 160,
    zIndex: 100,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 10,
  },
  menuItem: {
    padding: 12,
  },
  menuItemText: {
    color: '#FFF',
    fontSize: 13,
  },
  menuItemRedText: {
    color: '#FF4444',
    fontSize: 13,
    fontWeight: 'bold',
  },
  menuDivider: {
    height: 1,
    backgroundColor: '#444',
  },
  toggleSection: {
    alignItems: 'center',
    marginVertical: 4,
  },
  toggleLabel: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#444',
    marginVertical: 1,
  },
  labelOpenActive: {
    color: '#00D084',
  },
  labelLockedActive: {
    color: '#FF4444',
  },
  gradeBtn: {
    backgroundColor: '#00D084',
    paddingVertical: 8,
    width: '100%',
    borderRadius: 6,
    alignItems: 'center',
  },
  gradeBtnDisabled: {
    backgroundColor: '#2A2A2A',
    borderWidth: 1,
    borderColor: '#333',
  },
  gradeBtnText: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 11,
    letterSpacing: 0.5,
  },
  gradeBtnTextDisabled: {
    color: '#555',
  },
});
