import React, { useEffect, useState } from 'react';
import { 
  StyleSheet, Text, View, FlatList, TouchableOpacity, 
  ActivityIndicator, Alert, Modal, TextInput, KeyboardAvoidingView, Platform, ScrollView 
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';

export default function HostScreen({ navigation }: any) {
  const [loading, setLoading] = useState(true);
  const [activeEventId, setActiveEventId] = useState<string | null>(null);
  const [bets, setBets] = useState<any[]>([]);
  const [proposals, setProposals] = useState<any[]>([]);
  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<any[]>([]);
  // Grading & Creation States
  const [gradeModalVisible, setGradeModalVisible] = useState(false);
  const [selectedBet, setSelectedBet] = useState<any>(null);
  const [isGrading, setIsGrading] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  
  // NEW: Bet Type State
  const [betType, setBetType] = useState('prop'); // 'prop' or 'over_under'
  const [newQuestion, setNewQuestion] = useState('');
  const [newOptions, setNewOptions] = useState([
    { id: 1, label: '', odds: '2.0' },
    { id: 2, label: '', odds: '1.5' }
  ]);

  useEffect(() => {
    fetchHostData();

    // Listen for new Guest Proposals instantly
    const proposalSub = supabase
      .channel('public:guest_proposals')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'guest_proposals' }, () => {
        fetchHostData(); 
      }).subscribe();

    return () => { supabase.removeChannel(proposalSub); };
  }, []);

  async function fetchHostData() {
    setLoading(true);
    try {
      // Save your own ID to prevent self-lockout
      const myUserId = await AsyncStorage.getItem('userId');
      setCurrentUserId(myUserId);
      const campaignId = await AsyncStorage.getItem('campaignId');
      setActiveCampaignId(campaignId); // <-- Save this for our elevate function
      
      const { data: eventData } = await supabase
        .from('events').select('id').eq('campaign_id', campaignId).eq('status', 'live').single();

      if (!eventData) return;
      setActiveEventId(eventData.id);

      // Fetch all participants so we can manage them
      const { data: participantsData } = await supabase
        .from('campaign_participants')
        .select('user_id, role, users(display_name)')
        .eq('campaign_id', campaignId);
      if (participantsData) setParticipants(participantsData);

      // Fetch open, locked, and graded bets
      const { data: betsData } = await supabase
        .from('bets')
        .select(`id, question, status, bet_options!bet_options_bet_id_fkey ( id, label )`)
        .eq('event_id', eventData.id)
        .in('status', ['open', 'locked', 'graded']); // Removed the .order() crash risk!
      
      if (betsData) setBets(betsData);
      
      if (betsData) setBets(betsData);

      // Fetch pending proposals
      const { data: propsData } = await supabase
        .from('guest_proposals').select('id, suggestion, users(display_name)')
        .eq('event_id', eventData.id).eq('status', 'pending');
      if (propsData) setProposals(propsData);

    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  }

  // --- BET CREATION LOGIC ---
  function handleToggleBetType(type: string) {
    setBetType(type);
    if (type === 'over_under') {
      // Auto-fill the labels for Over/Under
      setNewOptions([
        { id: 1, label: 'Over', odds: '1.9' },
        { id: 2, label: 'Under', odds: '1.9' }
      ]);
    } else {
      setNewOptions([{ id: 1, label: '', odds: '2.0' }, { id: 2, label: '', odds: '1.5' }]);
    }
  }

  function handleAddOption() {
    if (betType === 'over_under') return; // Lock to 2 options for O/U
    setNewOptions([...newOptions, { id: Date.now(), label: '', odds: '1.0' }]);
  }

  function updateOption(id: number, field: string, value: string) {
    setNewOptions(newOptions.map(opt => opt.id === id ? { ...opt, [field]: value } : opt));
  }

  async function handlePublishBet(proposalIdToClear: string | null = null) {
    if (!newQuestion.trim()) return Alert.alert('Hold up', 'You need a question!');
    const validOptions = newOptions.filter(opt => opt.label.trim() !== '');
    if (validOptions.length < 2) return Alert.alert('Hold up', 'You need at least two options.');

    setIsCreating(true);
    try {
      const { data: betData, error: betError } = await supabase
        .from('bets')
        .insert([{ event_id: activeEventId, type: betType, question: newQuestion, status: 'open' }])
        .select().single();

      if (betError) throw betError;

      const optionsToInsert = validOptions.map(opt => ({
        bet_id: betData.id, label: opt.label, multiplier: parseFloat(opt.odds) || 1.0
      }));

      await supabase.from('bet_options').insert(optionsToInsert);

      // If this came from a proposal, mark it as approved
      if (proposalIdToClear) {
        await supabase.from('guest_proposals').update({ status: 'approved' }).eq('id', proposalIdToClear);
      }

      setNewQuestion('');
      handleToggleBetType('prop'); // Reset form
      setCreateModalVisible(false);
      fetchHostData(); 

    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setIsCreating(false);
    }
  }

  // --- PROPOSAL ACTIONS ---
  function convertProposalToBet(proposal: any) {
    setNewQuestion(proposal.suggestion);
    setCreateModalVisible(true);
  }

  async function rejectProposal(id: string) {
    await supabase.from('guest_proposals').update({ status: 'rejected' }).eq('id', id);
    fetchHostData();
  }

  // ... (Keep handleGradeBet and openGradeModal exactly the same as before)
  function openGradeModal(bet: any) { setSelectedBet(bet); setGradeModalVisible(true); }
  async function toggleBetStatus(betId: string, newStatus: string) {
    try {
      await supabase.from('bets').update({ status: newStatus }).eq('id', betId);
      fetchHostData(); // Refresh UI
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  }

  async function handleDeleteBet(betId: string) {
    Alert.alert(
      'Trash & Refund Bet?',
      'This will permanently delete the bet and refund any points wagered back to the players.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete & Refund', 
          style: 'destructive', 
          onPress: async () => {
            try {
              // Call our new Supabase function to handle the refund math AND the deletion
              const { error } = await supabase.rpc('delete_bet_and_refund', { target_bet_id: betId });

              if (error) throw error;
              
              Alert.alert('Deleted', 'Bet removed and points refunded.');
              fetchHostData(); // Refresh the board
            } catch (error: any) {
              Alert.alert('Error', error.message);
            }
          }
        }
      ]
    );
  }

  async function handleReverseGrading(betId: string) {
    Alert.alert('Reverse Grading?', 'This will claw back all payouts and set the bet back to Locked.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reverse', style: 'destructive', onPress: async () => {
          try {
            await supabase.rpc('undo_resolve_bet', { target_bet_id: betId });
            fetchHostData();
          } catch (error: any) {
            Alert.alert('Error', error.message);
          }
        }
      }
    ]);
  }
  async function handleGradeBet(winningOptionId: string) {
    setIsGrading(true);
    try {
      await supabase.rpc('resolve_bet', { target_bet_id: selectedBet.id, winning_opt_id: winningOptionId });
      setGradeModalVisible(false); fetchHostData(); 
    } catch (error) { Alert.alert('Error', 'Failed to grade bet.'); } finally { setIsGrading(false); }
  }

  if (loading) return <View style={styles.container}><ActivityIndicator size="large" color="#FFD700" /></View>;
  // --- MANAGE CREW LOGIC ---
  async function handleElevateHost(targetUserId: string, targetName: string) {
    Alert.alert(
      'Elevate to Co-Host?',
      `Are you sure you want to give ${targetName} the power to create and grade bets?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Make Host', 
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('campaign_participants')
                .update({ role: 'host' })
                .eq('user_id', targetUserId)
                .eq('campaign_id', activeCampaignId);

              if (error) throw error;
              
              Alert.alert('Success', `${targetName} is now a Co-Host!`);
              fetchHostData(); // Refresh the list
            } catch (error: any) {
              Alert.alert('Error', error.message);
            }
          }
        }
      ]
    );
  }
  async function handleRevokeHost(targetUserId: string, targetName: string) {
    Alert.alert(
      'Revoke Co-Host?',
      `Are you sure you want to remove ${targetName}'s host powers?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Revoke', 
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('campaign_participants')
                .update({ role: 'guest' })
                .eq('user_id', targetUserId)
                .eq('campaign_id', activeCampaignId);

              if (error) throw error;
              
              Alert.alert('Demoted', `${targetName} is now a Guest.`);
              fetchHostData(); // Refresh the list
            } catch (error: any) {
              Alert.alert('Error', error.message);
            }
          }
        }
      ]
    );
  }
  async function handleCloseBoard() {
    Alert.alert('Close Board Forever?', 'This will permanently end the game and lock all bets. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'End Event', style: 'destructive', onPress: async () => {
          try {
            await supabase.from('campaigns').update({ status: 'closed' }).eq('id', activeCampaignId);
            // Once updated, the Host gets pushed to the final results
            navigation.reset({ index: 0, routes: [{ name: 'FinalResults' }] });
          } catch (error: any) {
            Alert.alert('Error', error.message);
          }
        }
      }
    ]);
  }
  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>Host Control</Text>
          <Text style={styles.subtitle}>Manage the board.</Text>
        </View>
        <TouchableOpacity style={styles.createButton} onPress={() => { setNewQuestion(''); setCreateModalVisible(true); }}>
          <Text style={styles.createButtonText}>+ New Bet</Text>
        </TouchableOpacity>
      </View>

      {/* --- INBOX: Guest Proposals --- */}
      {proposals.length > 0 && (
        <View style={styles.inboxContainer}>
          <Text style={styles.inboxTitle}>📥 Guest Pitches ({proposals.length})</Text>
          {proposals.map(prop => (
            <View key={prop.id} style={styles.pitchCard}>
              <Text style={styles.pitchText}>"{prop.suggestion}"</Text>
              <Text style={styles.pitchAuthor}>- {prop.users.display_name}</Text>
              <View style={styles.pitchActions}>
                <TouchableOpacity onPress={() => convertProposalToBet(prop)}><Text style={styles.approveText}>Approve & Setup</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => rejectProposal(prop.id)}><Text style={styles.rejectText}>Trash</Text></TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* --- LIVE BETS TO GRADE & MANAGE CREW --- */}
      <Text style={styles.sectionHeader}>Active Action (Needs Grading)</Text>
      <FlatList
        data={bets}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 50 }}
        ListEmptyComponent={<Text style={styles.emptyText}>No open bets right now.</Text>}
        renderItem={({ item }) => (
          <View style={[styles.betCard, item.status === 'graded' && { opacity: 0.6, borderColor: '#666' }]}>
            
            {/* Header & Status */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 }}>
              <Text style={[styles.betQuestion, { flex: 1, paddingRight: 10 }]}>{item.question}</Text>
              <Text style={{ 
                color: item.status === 'open' ? '#00D084' : item.status === 'locked' ? '#FFD700' : '#ff4444', 
                fontWeight: 'bold', fontSize: 12 
              }}>
                {item.status.toUpperCase()}
              </Text>
            </View>
            
            {/* Buttons */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 }}>
              
              {item.status === 'open' && (
                <TouchableOpacity style={styles.actionBtn} onPress={() => toggleBetStatus(item.id, 'locked')}>
                  <Text style={styles.actionBtnText}>🔒 Lock Betting</Text>
                </TouchableOpacity>
              )}

              {item.status === 'locked' && (
                <>
                  <TouchableOpacity style={styles.actionBtnSecondary} onPress={() => toggleBetStatus(item.id, 'open')}>
                    <Text style={styles.actionBtnTextSecondary}>🔓 Re-Open</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => openGradeModal(item)}>
                    <Text style={styles.actionBtnText}>✅ Grade</Text>
                  </TouchableOpacity>
                </>
              )}

              {item.status === 'graded' && (
                <TouchableOpacity style={styles.actionBtnDanger} onPress={() => handleReverseGrading(item.id)}>
                  <Text style={styles.actionBtnTextDanger}>↩️ Reverse</Text>
                </TouchableOpacity>
              )}

              {/* NEW TRASH BUTTON */}
              <TouchableOpacity 
                style={[styles.actionBtnSecondary, { borderColor: '#ff4444' }]} 
                onPress={() => handleDeleteBet(item.id)}
              >
                <Text style={[styles.actionBtnTextSecondary, { color: '#ff4444' }]}>🗑️ Trash</Text>
              </TouchableOpacity>

            </View>
          </View>
        )}
        ListFooterComponent={
          <View style={{ paddingTop: 20 }}>
            {/* --- MANAGE CREW SECTION --- */}
            <Text style={styles.sectionHeader}>Manage Crew</Text>
            <View style={styles.crewContainer}>
              {participants.map(p => (
                <View key={p.user_id} style={styles.crewCard}>
                  <View>
                    <Text style={styles.crewName}>{p.users.display_name}</Text>
                    <Text style={p.role === 'host' ? styles.crewRoleHost : styles.crewRoleGuest}>
                      {p.role.toUpperCase()}
                    </Text>
                  </View>
                  
                  {p.role === 'guest' && (
                    <TouchableOpacity 
                      style={styles.elevateBtn} 
                      onPress={() => handleElevateHost(p.user_id, p.users.display_name)}
                    >
                      <Text style={styles.elevateBtnText}>Make Host</Text>
                    </TouchableOpacity>
                  )}

                  {p.role === 'host' && p.user_id !== currentUserId && (
                    <TouchableOpacity 
                      style={styles.revokeBtn} 
                      onPress={() => handleRevokeHost(p.user_id, p.users.display_name)}
                    >
                      <Text style={styles.revokeBtnText}>Revoke</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </View>

            {/* --- THE NUKE BUTTON --- */}
            <TouchableOpacity 
              style={{ backgroundColor: 'rgba(255, 68, 68, 0.1)', padding: 18, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#ff4444', marginTop: 10 }}
              onPress={handleCloseBoard}
            >
              <Text style={{ color: '#ff4444', fontWeight: 'bold', fontSize: 16 }}>🛑 Close Board & End Event</Text>
            </TouchableOpacity>
          </View>
        }
      />

      {/* --- CREATE BET MODAL --- */}
      <Modal visible={createModalVisible} transparent={true} animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Push Live Bet</Text>
              <TouchableOpacity onPress={() => setCreateModalVisible(false)}><Text style={styles.closeText}>Cancel</Text></TouchableOpacity>
            </View>

            {/* Type Selector */}
            <View style={styles.typeSelectorRow}>
              <TouchableOpacity style={[styles.typeBtn, betType === 'prop' && styles.typeBtnActive]} onPress={() => handleToggleBetType('prop')}>
                <Text style={[styles.typeBtnText, betType === 'prop' && styles.typeBtnTextActive]}>Props / Moneyline</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.typeBtn, betType === 'over_under' && styles.typeBtnActive]} onPress={() => handleToggleBetType('over_under')}>
                <Text style={[styles.typeBtnText, betType === 'over_under' && styles.typeBtnTextActive]}>Over/Under</Text>
              </TouchableOpacity>
            </View>
            
            <ScrollView style={{ maxHeight: 400 }}>
              <Text style={styles.label}>The Question</Text>
              <TextInput 
                style={styles.input} 
                placeholder={betType === 'over_under' ? "e.g., Number of foul calls: 4.5" : "e.g., Who wins the first hand of poker?"} 
                placeholderTextColor="#666" 
                value={newQuestion} 
                onChangeText={setNewQuestion} 
              />

              <Text style={styles.label}>Options & Payouts</Text>
              {newOptions.map((opt) => (
                <View key={opt.id} style={styles.optionRow}>
                  <TextInput 
                    style={[styles.input, { flex: 2, marginRight: 10, marginBottom: 0 }]} 
                    placeholder="e.g., William" 
                    placeholderTextColor="#666" 
                    value={opt.label} 
                    onChangeText={(text) => updateOption(opt.id, 'label', text)} 
                    editable={betType !== 'over_under'} // Lock text if it's Over/Under
                  />
                  <TextInput 
                    style={[styles.input, { flex: 1, marginBottom: 0 }]} 
                    keyboardType="numeric" 
                    placeholder="2.0" 
                    placeholderTextColor="#666" 
                    value={opt.odds} 
                    onChangeText={(text) => updateOption(opt.id, 'odds', text)} 
                  />
                </View>
              ))}

              {betType === 'prop' && (
                <TouchableOpacity style={styles.addOptionBtn} onPress={handleAddOption}>
                  <Text style={styles.addOptionText}>+ Add Another Option</Text>
                </TouchableOpacity>
              )}
            </ScrollView>

            <TouchableOpacity style={[styles.submitBtn, isCreating && { opacity: 0.7 }]} onPress={() => handlePublishBet()} disabled={isCreating}>
              <Text style={styles.submitBtnText}>{isCreating ? 'Publishing...' : 'Publish to Board'}</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Grade Modal Remains the Same */}
      <Modal visible={gradeModalVisible} transparent={true} animationType="fade">
        <View style={styles.modalOverlayCenter}>
          <View style={styles.gradeModalContent}>
            <Text style={styles.modalTitle}>Who Won?</Text>
            <Text style={styles.modalSubtitle}>{selectedBet?.question}</Text>
            {selectedBet?.bet_options.map((option: any) => (
              <TouchableOpacity key={option.id} style={styles.winnerButton} onPress={() => handleGradeBet(option.id)} disabled={isGrading}>
                <Text style={styles.winnerButtonText}>{isGrading ? 'Processing...' : `Winner: ${option.label}`}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={{ marginTop: 10, alignItems: 'center' }} onPress={() => setGradeModalVisible(false)}><Text style={styles.closeText}>Cancel</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  // ... Keep all your previous HostScreen styles, and add these new ones at the bottom:
  container: { flex: 1, backgroundColor: '#121212', padding: 20 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 25 },
  title: { fontSize: 32, fontWeight: 'bold', color: '#FFD700' },
  subtitle: { color: '#a0a0a0' },
  createButton: { backgroundColor: '#FFD700', paddingVertical: 10, paddingHorizontal: 15, borderRadius: 8 },
  createButtonText: { color: '#000', fontWeight: 'bold', fontSize: 16 },
  sectionHeader: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 15 },
  emptyText: { color: '#666', textAlign: 'center', marginTop: 20, marginBottom: 20 },
  betCard: { backgroundColor: '#1e1e1e', padding: 20, borderRadius: 10, marginBottom: 15, borderWidth: 1, borderColor: '#333' },
  betQuestion: { fontSize: 18, color: '#fff', fontWeight: 'bold', marginBottom: 10 },
  actionText: { color: '#FFD700', fontWeight: 'bold' },
  
  // INBOX STYLES
  inboxContainer: { backgroundColor: '#2a2a2a', padding: 15, borderRadius: 10, marginBottom: 25, borderWidth: 1, borderColor: '#FFD700' },
  inboxTitle: { color: '#FFD700', fontWeight: 'bold', fontSize: 16, marginBottom: 15 },
  pitchCard: { backgroundColor: '#121212', padding: 15, borderRadius: 8, marginBottom: 10 },
  pitchText: { color: '#fff', fontStyle: 'italic', fontSize: 16, marginBottom: 5 },
  pitchAuthor: { color: '#a0a0a0', fontSize: 14, marginBottom: 15 },
  pitchActions: { flexDirection: 'row', justifyContent: 'space-between' },
  approveText: { color: '#00D084', fontWeight: 'bold' },
  rejectText: { color: '#ff4444', fontWeight: 'bold' },

  // MODAL & FORM STYLES
  typeSelectorRow: { flexDirection: 'row', marginBottom: 15, backgroundColor: '#121212', borderRadius: 8, padding: 4 },
  typeBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 6 },
  typeBtnActive: { backgroundColor: '#FFD700' },
  typeBtnText: { color: '#a0a0a0', fontWeight: 'bold' },
  typeBtnTextActive: { color: '#000' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.7)' },
  modalOverlayCenter: { flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.8)', padding: 20 },
  modalContent: { backgroundColor: '#1e1e1e', padding: 25, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  gradeModalContent: { backgroundColor: '#1e1e1e', padding: 25, borderRadius: 15 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 24, fontWeight: 'bold', color: '#fff' },
  modalSubtitle: { color: '#a0a0a0', textAlign: 'center', marginBottom: 25, fontSize: 16 },
  closeText: { color: '#ff4444', fontSize: 16, fontWeight: 'bold' },
  label: { color: '#fff', fontWeight: 'bold', marginBottom: 10, marginTop: 10 },
  input: { backgroundColor: '#121212', color: '#fff', borderRadius: 8, padding: 15, borderWidth: 1, borderColor: '#333', marginBottom: 15 },
  optionRow: { flexDirection: 'row', marginBottom: 10 },
  addOptionBtn: { alignItems: 'center', paddingVertical: 10, marginBottom: 20 },
  addOptionText: { color: '#00D084', fontWeight: 'bold' },
  submitBtn: { backgroundColor: '#FFD700', padding: 18, borderRadius: 10, alignItems: 'center', marginTop: 10 },
  submitBtnText: { color: '#000', fontSize: 18, fontWeight: 'bold' },
  winnerButton: { backgroundColor: '#00D084', padding: 15, borderRadius: 8, marginBottom: 15, alignItems: 'center' },
  winnerButtonText: { color: '#000', fontWeight: 'bold', fontSize: 18 },
  // CREW STYLES
  crewContainer: { backgroundColor: '#1e1e1e', padding: 15, borderRadius: 10, borderWidth: 1, borderColor: '#333', marginBottom: 40 },
  crewCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#2a2a2a' },
  crewName: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  crewRoleHost: { color: '#FFD700', fontSize: 12, fontWeight: 'bold', marginTop: 4 },
  crewRoleGuest: { color: '#a0a0a0', fontSize: 12, marginTop: 4 },
  elevateBtn: { backgroundColor: 'rgba(255, 215, 0, 0.1)', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 6, borderWidth: 1, borderColor: '#FFD700' },
  elevateBtnText: { color: '#FFD700', fontWeight: 'bold', fontSize: 12 },
  revokeBtn: { backgroundColor: 'rgba(255, 68, 68, 0.1)', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 6, borderWidth: 1, borderColor: '#ff4444' },
  revokeBtnText: { color: '#ff4444', fontWeight: 'bold', fontSize: 12 },
  actionBtn: { backgroundColor: '#FFD700', padding: 10, borderRadius: 6 }, 
  actionBtnText: { color: '#000', fontWeight: 'bold' }, 
  actionBtnSecondary: { backgroundColor: '#2a2a2a', padding: 10, borderRadius: 6, borderWidth: 1, borderColor: '#FFD700' }, 
  actionBtnTextSecondary: { color: '#FFD700', fontWeight: 'bold' }, 
  actionBtnDanger: { backgroundColor: '#ff4444', padding: 10, borderRadius: 6 }, 
  actionBtnTextDanger: { color: '#fff', fontWeight: 'bold' }
});