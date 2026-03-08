import React, { useEffect, useState } from 'react';
import { 
  StyleSheet, Text, View, FlatList, TouchableOpacity, 
  ActivityIndicator, Alert, Modal, TextInput, KeyboardAvoidingView, Platform 
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';

export default function DashboardScreen({ route, navigation }: any) {
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [walletBalance, setWalletBalance] = useState(0);
  const [activeEvent, setActiveEvent] = useState<any>(null);
  const [bets, setBets] = useState<any[]>([]);
  const [userRole, setUserRole] = useState<string>('guest');
  
  // NEW: Track the user's existing wagers
  const [myWagers, setMyWagers] = useState<any[]>([]);

  const [modalVisible, setModalVisible] = useState(false);
  const [selectedBet, setSelectedBet] = useState<any>(null);
  const [selectedOption, setSelectedOption] = useState<any>(null);
  const [wagerAmount, setWagerAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [suggestModalVisible, setSuggestModalVisible] = useState(false);
  const [suggestionText, setSuggestionText] = useState('');

  const [myBetsModalVisible, setMyBetsModalVisible] = useState(false);
  const [myBets, setMyBets] = useState<any[]>([]);

  useEffect(() => {
    let walletSub: any;
    let betsSub: any;
    let campaignSub: any;

    async function setupRealtime() {
      const storedUserId = await AsyncStorage.getItem('userId');
      const storedCampaignId = await AsyncStorage.getItem('campaignId'); // <-- Add this

      // 1. Listen for YOUR Wallet Changes Only
      walletSub = supabase
        .channel('public:campaign_participants_dashboard')
        .on(
          'postgres_changes', 
          { 
            event: 'UPDATE', 
            schema: 'public', 
            table: 'campaign_participants',
            filter: `user_id=eq.${storedUserId}` 
          }, 
          (payload) => {
            loadBoard(); 
          }
        )
        .subscribe();

      // 2. Listen for ALL Bet Changes
      betsSub = supabase
        .channel('public:bets_dashboard')
        .on(
          'postgres_changes', 
          { event: '*', schema: 'public', table: 'bets' }, 
          (payload) => {
            loadBoard(); 
          }
        )
        .subscribe();

      // 3. Listen for THIS Campaign's closure
      campaignSub = supabase
        .channel(`campaign_status_${storedCampaignId}`) // <-- Unique channel name
        .on(
          'postgres_changes', 
          { 
            event: 'UPDATE', 
            schema: 'public', 
            table: 'campaigns',
            filter: `id=eq.${storedCampaignId}` // <-- Strictly listen to this board
          }, 
          (payload) => {
            console.log('Campaign Update:', payload);
            if (payload.new.status === 'closed') {
               // The Host ended it! Kick them to the podium.
               navigation.reset({ index: 0, routes: [{ name: 'FinalResults' }] });
            }
          }
        )
        .subscribe();
    }

    loadBoard();
    setupRealtime();

    return () => {
      if (walletSub) supabase.removeChannel(walletSub);
      if (betsSub) supabase.removeChannel(betsSub);
      if (campaignSub) supabase.removeChannel(campaignSub);
    };
  }, []);

  async function loadBoard() {
    setLoading(true);
    try {
      const storedUserId = await AsyncStorage.getItem('userId');
      const storedCampaignId = await AsyncStorage.getItem('campaignId');
      
      if (!storedUserId || !storedCampaignId) throw new Error("Missing user data.");
      
      setUserId(storedUserId);
      setCampaignId(storedCampaignId);

      // 1. Fetch Wallet & Role
      const { data: participantData } = await supabase
        .from('campaign_participants')
        .select('global_point_balance, role')
        .eq('user_id', storedUserId)
        .eq('campaign_id', storedCampaignId)
        .single();
        
      if (participantData) {
        setWalletBalance(participantData.global_point_balance);
        setUserRole(participantData.role);
      }

      // 2. Fetch Live Event
      const { data: eventData } = await supabase
        .from('events')
        .select('*')
        .eq('campaign_id', storedCampaignId)
        .eq('status', 'live')
        .single();

      if (!eventData) return setLoading(false);
      setActiveEvent(eventData);

      // 3. Fetch Active & Locked Bets
      const { data: betsData } = await supabase
        .from('bets')
        .select(`id, question, status, bet_options!bet_options_bet_id_fkey ( id, label, multiplier )`)
        .eq('event_id', eventData.id)
        .in('status', ['open', 'locked']); // <-- Now it pulls both!

      if (betsData) setBets(betsData);

      // 4. Fetch ALL of this user's wagers for this event
      const { data: wagersData } = await supabase
        .from('wagers')
        .select(`
          id,
          bet_id,
          points_risked,
          status,
          bet_options!wagers_option_id_fkey ( label, multiplier ),
          bets ( question, event_id ) 
        `)
        .eq('user_id', storedUserId);

      if (wagersData) {
        // Look directly at the bets object now, not inside bet_options
        const eventWagers = wagersData.filter((w: any) => w.bets?.event_id === eventData.id);
        
        // Feed your existing board UI 
        setMyWagers(eventWagers.filter((w: any) => w.status === 'pending'));
        
        // Feed the new My Bets Modal
        setMyBets(eventWagers.reverse());
      }

    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  }

function openBetSlip(bet: any, option?: any) {
    if (bet.status === 'locked') {
      return Alert.alert('Board Locked 🔒', 'The host has locked betting for this action.');
    }

    // Check if they already wagered on this bet
    const existingWager = myWagers.find((w: any) => w.bet_id === bet.id);
    
    if (existingWager) {
      Alert.alert(
        'Bet Already Placed', 
        'You already have action on this bet. Want to cancel your ticket, refund your points, and pick again?', 
        [
          { text: 'Keep Ticket', style: 'cancel' },
          { text: 'Refund & Edit', style: 'destructive', onPress: async () => {
              try {
                await supabase.rpc('cancel_wager', { target_wager_id: existingWager.id });
                Alert.alert('Refunded!', 'Your points have been returned. You can now place a new bet.');
              } catch (error: any) {
                Alert.alert('Error', error.message);
              }
            }
          }
        ]
      );
      return;
    }

    // If no existing wager, open the slip normally
    setSelectedBet(bet);
    setWagerAmount('');
    setSelectedOption(option || null); // <-- We pass the option they tapped right into your state!
    setModalVisible(true);
  }

  async function submitWager() {
    const pointsToRisk = parseInt(wagerAmount);

    if (isNaN(pointsToRisk) || pointsToRisk <= 0) return Alert.alert('Invalid', 'Enter a valid amount.');
    if (pointsToRisk > walletBalance) return Alert.alert('Insufficient Funds', 'Not enough points!');

    setIsSubmitting(true);

    try {
      const { error: wagerError } = await supabase
        .from('wagers')
        .insert([{
          user_id: userId,
          bet_id: selectedBet.id,
          option_id: selectedOption.id,
          points_risked: pointsToRisk,
          status: 'pending'
        }]);

      // If the database unique constraint blocks it, we catch it here!
      if (wagerError) throw wagerError;

      const newBalance = walletBalance - pointsToRisk;
      await supabase
        .from('campaign_participants')
        .update({ global_point_balance: newBalance })
        .eq('user_id', userId)
        .eq('campaign_id', campaignId);

      setWalletBalance(newBalance);
      setModalVisible(false);
      
      // Refresh the board so the UI updates to show their new locked wager
      loadBoard(); 

    } catch (error: any) {
      // Friendly error if they somehow bypassed the UI to double-bet
      if (error.code === '23505') {
        Alert.alert('Hold Up', 'You already placed a wager on this bet!');
      } else {
        Alert.alert('Error', error.message);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function submitSuggestion() {
    if (!suggestionText.trim()) return Alert.alert('Error', 'Type an idea first!');
    try {
      await supabase.from('guest_proposals').insert([{
        event_id: activeEvent.id,
        user_id: userId,
        suggestion: suggestionText
      }]);
      setSuggestionText('');
      setSuggestModalVisible(false);
      Alert.alert('Sent!', 'Your pitch was sent to the host.');
    } catch (error) { Alert.alert('Error', 'Failed to send.'); }
  }

  async function handleSwitchEvent() {
    try {
      // 1. Grab the user data directly from the device memory
      const savedUserId = await AsyncStorage.getItem('userId');
      const savedUserName = await AsyncStorage.getItem('userName');
      
      // 2. Clear out the active campaign data so they leave the board
      await AsyncStorage.removeItem('campaignId');
      await AsyncStorage.removeItem('campaignName');
      
      // 3. Instantly reset navigation back to the Campaigns list
      navigation.reset({ 
        index: 0, 
        routes: [{ 
          name: 'Campaigns', 
          params: { userId: savedUserId, userName: savedUserName } 
        }] 
      });
    } catch (error) {
      console.error("Error switching events:", error);
    }
  }

  const potentialWin = wagerAmount ? Math.floor(parseInt(wagerAmount) * (selectedOption?.multiplier || 1)) : 0;

  const renderBetCard = ({ item }: { item: any }) => {
    // Check if the user already bet on this specific question
    const existingWager = myWagers.find(w => w.bet_id === item.id);

    return (
      <View style={styles.betCard}>
        <Text style={styles.betQuestion}>{item.question}</Text>
        
        {existingWager ? (
          // IF THEY ALREADY BET: Show a receipt instead of buttons
          <View style={styles.lockedWagerCard}>
            <Text style={styles.lockedText}>🔒 Action Locked</Text>
            <Text style={styles.lockedDetails}>
              {existingWager.points_risked} pts on <Text style={{color: '#fff'}}>{existingWager.bet_options.label}</Text>
            </Text>
          </View>
        ) : (
          // IF THEY HAVEN'T BET: Show the normal buttons
          <View style={styles.optionsRow}>
            {item.bet_options.map((option: any) => (
              <TouchableOpacity 
                key={option.id} 
                style={styles.optionButton}
                onPress={() => openBetSlip(item, option)}
              >
                <Text style={styles.optionLabel}>{option.label}</Text>
                <Text style={styles.optionOdds}>{option.multiplier}x</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    );
  };

  if (loading) return <View style={styles.container}><ActivityIndicator size="large" color="#00D084" /></View>;

  return (
    <View style={styles.container}>
      {/* --- UPGRADED HEADER --- */}
      <View style={styles.headerContainer}>
        
        {/* Top Nav Row */}
        <View style={styles.topNavRow}>
          <TouchableOpacity style={styles.navPillLeave} onPress={handleSwitchEvent}>
            <Text style={styles.navPillLeaveText}>← Leave</Text>
          </TouchableOpacity>
          
          <View style={styles.rightNavGroup}>
            <TouchableOpacity style={styles.navPillMyBets} onPress={() => setMyBetsModalVisible(true)}>
              <Text style={styles.navPillMyBetsText}>🧾 My Bets</Text>
            </TouchableOpacity>
          
            <TouchableOpacity style={styles.navPillStandings} onPress={() => navigation.navigate('Leaderboard')}>
              <Text style={styles.navPillStandingsText}>🏆 Standings</Text>
            </TouchableOpacity>
            
            {userRole === 'host' && (
              <TouchableOpacity style={styles.navPillHost} onPress={() => navigation.navigate('Host')}>
                <Text style={styles.navPillHostText}>👑 Host</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Main Action Header (Mirrors Host View) */}
        <View style={styles.mainHeaderRow}>
          <View style={{ flex: 1, paddingRight: 10 }}>
            <Text style={styles.title}>The Action</Text>
            <Text style={styles.subtitle}>{activeEvent ? `Live: ${activeEvent.name}` : 'Waiting for host...'}</Text>
            <Text style={styles.balanceText}>Wallet: {walletBalance.toLocaleString()} pts</Text>
          </View>
          
          <TouchableOpacity style={styles.pitchButton} onPress={() => setSuggestModalVisible(true)}>
            <Text style={styles.pitchButtonText}>+ Pitch Bet</Text>
          </TouchableOpacity>
        </View>

      </View>
      
      <FlatList
        data={bets}
        keyExtractor={(item) => item.id}
        renderItem={renderBetCard}
        contentContainerStyle={{ paddingBottom: 50 }}
      />

      {/* Bet Slip Modal remains unchanged */}
      <Modal visible={modalVisible} transparent={true} animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.betSlipContainer}>
            <View style={styles.slipHeaderRow}>
              <Text style={styles.slipTitle}>Bet Slip</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}><Text style={styles.closeSlipText}>Cancel</Text></TouchableOpacity>
            </View>

            {selectedBet && selectedOption && (
              <View style={styles.slipDetails}>
                <Text style={styles.slipQuestion}>{selectedBet.question}</Text>
                <View style={styles.slipPickRow}>
                  <Text style={styles.slipPickLabel}>Pick: <Text style={{color: '#fff'}}>{selectedOption.label}</Text></Text>
                  <Text style={styles.slipPickOdds}>{selectedOption.multiplier}x</Text>
                </View>
              </View>
            )}

            <View style={styles.wagerInputRow}>
              <Text style={styles.wagerLabel}>Risk:</Text>
              <TextInput style={styles.wagerInput} keyboardType="numeric" placeholder="0" placeholderTextColor="#666" value={wagerAmount} onChangeText={setWagerAmount} autoFocus />
            </View>

            <View style={styles.payoutRow}>
              <Text style={styles.payoutLabel}>To Win:</Text>
              <Text style={styles.payoutAmount}>{isNaN(potentialWin) ? 0 : potentialWin} pts</Text>
            </View>

            <TouchableOpacity style={[styles.confirmButton, isSubmitting && { opacity: 0.7 }]} onPress={submitWager} disabled={isSubmitting}>
              <Text style={styles.confirmButtonText}>{isSubmitting ? 'Processing...' : 'Lock It In'}</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      {/* --- PITCH AN IDEA MODAL --- */}
      <Modal visible={suggestModalVisible} transparent={true} animationType="fade">
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
          style={styles.modalOverlayCenter}
        >
          <View style={styles.gradeModalContent}>
            <Text style={styles.modalTitle}>Pitch an Idea</Text>
            
            <TextInput 
              style={styles.pitchInput} 
              placeholder="e.g., Will Chris go all-in blind?" 
              placeholderTextColor="#666"
              value={suggestionText} 
              onChangeText={setSuggestionText} 
              multiline={true}
              autoFocus 
            />
            
            <TouchableOpacity style={styles.confirmButton} onPress={submitSuggestion}>
              <Text style={styles.confirmButtonText}>Send to Host</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={{ marginTop: 15, alignItems: 'center' }} onPress={() => setSuggestModalVisible(false)}>
              <Text style={styles.closeSlipText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      {/* --- MY BETS (LIVE RECEIPTS) MODAL --- */}
      <Modal visible={myBetsModalVisible} transparent={true} animationType="slide">
        <View style={styles.modalOverlayCenter}>
          <View style={[styles.gradeModalContent, { maxHeight: '80%', width: '100%' }]}>
            <Text style={styles.modalTitle}>My Live Tickets</Text>
            
            <FlatList
              data={myBets}
              keyExtractor={(item) => item.id.toString()}
              ListEmptyComponent={<Text style={{ color: '#666', textAlign: 'center', marginTop: 20 }}>No bets placed yet. Get in the action!</Text>}
              renderItem={({ item }) => {
                const isLocked = item.status === 'locked';
                
                return (
                  <TouchableOpacity 
                    style={[styles.betCard, isLocked && { borderColor: '#ff4444', opacity: 0.8 }]} 
                    onPress={() => openBetSlip(item)}
                    activeOpacity={isLocked ? 1 : 0.7} // Prevents click animation if locked
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
                      <Text style={[styles.betQuestion, { flex: 1, paddingRight: 10 }]}>{item.question}</Text>
                      {isLocked && (
                        <View style={{ backgroundColor: 'rgba(255, 68, 68, 0.2)', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6, borderWidth: 1, borderColor: '#ff4444' }}>
                          <Text style={{ color: '#ff4444', fontWeight: 'bold', fontSize: 10 }}>🔒 LOCKED</Text>
                        </View>
                      )}
                    </View>
                    {/* ... the rest of your options render code ... */}
                  </TouchableOpacity>
                );
              }}
            />

            <TouchableOpacity style={{ marginTop: 20, alignItems: 'center', padding: 10 }} onPress={() => setMyBetsModalVisible(false)}>
              <Text style={styles.closeSlipText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212', padding: 15, paddingTop: 50 },
  // --- NEW HEADER & BUTTON STYLES ---
  headerContainer: { marginBottom: 15 },
  
  topNavRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  rightNavGroup: { flexDirection: 'row', gap: 10 },
  
  // Pill Buttons
  navPillLeave: { backgroundColor: '#2a2a2a', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: '#444' },
  navPillLeaveText: { color: '#ff4444', fontWeight: 'bold', fontSize: 14 },
  
  navPillStandings: { backgroundColor: 'rgba(0, 208, 132, 0.1)', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: '#00D084' },
  navPillStandingsText: { color: '#00D084', fontWeight: 'bold', fontSize: 14 },
  
  navPillHost: { backgroundColor: 'rgba(255, 215, 0, 0.1)', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: '#FFD700' },
  navPillHostText: { color: '#FFD700', fontWeight: 'bold', fontSize: 14 },

  // Main Header Layout
  mainHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  pitchButton: { backgroundColor: '#00D084', paddingVertical: 12, paddingHorizontal: 15, borderRadius: 8, shadowColor: '#00D084', shadowOpacity: 0.3, shadowRadius: 5, shadowOffset: { width: 0, height: 2 } },
  pitchButtonText: { color: '#000', fontWeight: 'bold', fontSize: 16 }, 
  title: { fontSize: 32, fontWeight: 'bold', color: '#fff' },
  subtitle: { fontSize: 16, color: '#00D084', marginTop: 5, fontWeight: '600' },
  balanceText: { fontSize: 16, color: '#a0a0a0', marginTop: 5 },
  
  betCard: { backgroundColor: '#1e1e1e', borderRadius: 12, padding: 16, marginBottom: 15, borderWidth: 1, borderColor: '#333' },
  betQuestion: { fontSize: 18, color: '#fff', fontWeight: 'bold', marginBottom: 15 },
  optionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  optionButton: { flex: 1, minWidth: '45%', backgroundColor: '#2a2a2a', paddingVertical: 12, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#444' },
  optionLabel: { color: '#fff', fontSize: 14, fontWeight: '600', marginBottom: 4 },
  optionOdds: { color: '#00D084', fontSize: 12, fontWeight: 'bold' },

  // NEW STYLES for the Locked Receipt
  lockedWagerCard: { backgroundColor: '#121212', padding: 15, borderRadius: 8, borderWidth: 1, borderColor: '#00D084', alignItems: 'center' },
  lockedText: { color: '#00D084', fontWeight: 'bold', fontSize: 16, marginBottom: 5 },
  lockedDetails: { color: '#a0a0a0', fontSize: 14 },

  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  betSlipContainer: { backgroundColor: '#1e1e1e', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 25 },
  slipHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  slipTitle: { fontSize: 22, fontWeight: 'bold', color: '#fff' },
  closeSlipText: { color: '#ff4444', fontSize: 16, fontWeight: 'bold' },
  slipDetails: { backgroundColor: '#2a2a2a', padding: 15, borderRadius: 10, marginBottom: 20 },
  slipQuestion: { color: '#a0a0a0', fontSize: 14, marginBottom: 10 },
  slipPickRow: { flexDirection: 'row', justifyContent: 'space-between' },
  slipPickLabel: { color: '#00D084', fontSize: 18, fontWeight: 'bold' },
  slipPickOdds: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  wagerInputRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  wagerLabel: { color: '#fff', fontSize: 18, marginRight: 15 },
  wagerInput: { flex: 1, backgroundColor: '#121212', color: '#fff', fontSize: 24, fontWeight: 'bold', borderRadius: 8, padding: 15, borderWidth: 1, borderColor: '#333' },
  payoutRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 25 },
  payoutLabel: { color: '#a0a0a0', fontSize: 16 },
  payoutAmount: { color: '#00D084', fontSize: 20, fontWeight: 'bold' },
  confirmButton: { backgroundColor: '#00D084', padding: 18, borderRadius: 10, alignItems: 'center' },
  confirmButtonText: { color: '#000', fontSize: 18, fontWeight: 'bold' },
  // Add these inside your styles object in DashboardScreen.tsx
  modalOverlayCenter: { 
    flex: 1, 
    justifyContent: 'center', 
    backgroundColor: 'rgba(0,0,0,0.8)', 
    padding: 20 
  },
  gradeModalContent: { 
    backgroundColor: '#1e1e1e', 
    padding: 25, 
    borderRadius: 15 
  },
  modalTitle: { 
    fontSize: 24, 
    fontWeight: 'bold', 
    color: '#fff', 
    marginBottom: 20, 
    textAlign: 'center' 
  },
  pitchInput: { 
    backgroundColor: '#121212', 
    color: '#fff', 
    fontSize: 18, 
    borderRadius: 8, 
    padding: 15, 
    borderWidth: 1, 
    borderColor: '#333', 
    marginBottom: 20,
    minHeight: 100, // Gives them plenty of room to type a crazy prop bet
    textAlignVertical: 'top' // Keeps text at the top of the box on Android
  },
  // Add to your Pill Buttons section:
  navPillMyBets: { backgroundColor: 'rgba(52, 152, 219, 0.1)', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: '#3498db' },
  navPillMyBetsText: { color: '#3498db', fontWeight: 'bold', fontSize: 14 },

  // Add these Receipt Card styles to the very bottom:
  receiptCard: { backgroundColor: '#121212', padding: 15, borderRadius: 10, marginBottom: 15, borderWidth: 1, borderColor: '#333' },
  receiptQuestion: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginBottom: 10 },
  receiptDetailsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  receiptPick: { color: '#FFD700', fontSize: 14, fontWeight: 'bold' },
  receiptAmount: { color: '#a0a0a0', fontSize: 14 },
  statusBadge: { alignSelf: 'flex-start', paddingVertical: 4, paddingHorizontal: 10, borderRadius: 6 },
  badgeWon: { backgroundColor: 'rgba(0, 208, 132, 0.2)', borderWidth: 1, borderColor: '#00D084' },
  badgeLost: { backgroundColor: 'rgba(255, 68, 68, 0.2)', borderWidth: 1, borderColor: '#ff4444' },
  badgePending: { backgroundColor: 'rgba(255, 215, 0, 0.2)', borderWidth: 1, borderColor: '#FFD700' },
  statusText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  receiptOdds: { color: '#a0a0a0', fontSize: 14, fontWeight: 'bold' },
  receiptToWin: { color: '#FFD700', fontSize: 14, fontWeight: 'bold' },
  receiptWon: { color: '#00D084', fontSize: 14, fontWeight: 'bold' },
  receiptLost: { color: '#ff4444', fontSize: 14, fontWeight: 'bold' },
});