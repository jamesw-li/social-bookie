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

  // NEW: State for Tabs and Standings Data
  const [activeTab, setActiveTab] = useState<'action' | 'standings'>('action');
  const [standings, setStandings] = useState<any[]>([]);

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
      
      // 5. Fetch Standings for the Leaderboard Tab
      const { data: standingsData } = await supabase
        .from('campaign_participants')
        .select('user_id, global_point_balance, users(display_name)')
        .eq('campaign_id', storedCampaignId)
        .order('global_point_balance', { ascending: false }); // Highest points at the top!

      if (standingsData) setStandings(standingsData);

    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  }

function openBetSlip(bet: any, option?: any) {
    const cleanBetId = String(bet.id).toLowerCase().trim();
    const existingWager = myWagers.find((w: any) => 
      String(w.bet_id).toLowerCase().trim() === cleanBetId
    );

    // 1. Check if the bet is locked FIRST to prevent refunds on locked action
    if (bet.status === 'locked') {
      const lockMsg = 'The host has locked betting for this action. No more changes allowed.';
      if (Platform.OS === 'web') {
        return window.alert(`Board Locked 🔒\n${lockMsg}`);
      }
      return Alert.alert('Board Locked 🔒', lockMsg);
    }

    // 2. Only allow refund if the bet is NOT locked
    if (existingWager) {
      if (Platform.OS === 'web') {
        const confirmRefund = window.confirm(
          'You already have action on this bet. Want to cancel your ticket, refund your points, and pick again?'
        );
        if (confirmRefund) {
          (async () => {
            try {
              await supabase.rpc('cancel_wager', { target_wager_id: existingWager.id });
              window.alert('Refunded! Your points have been returned.');
            } catch (error: any) {
              window.alert(`Error: ${error.message}`);
            }
          })();
        }
        return;
      }

      Alert.alert(
        'Bet Already Placed', 
        'Want to cancel your ticket, refund your points, and pick again?', 
        [
          { text: 'Keep Ticket', style: 'cancel' },
          { text: 'Refund & Edit', style: 'destructive', onPress: async () => {
              try {
                await supabase.rpc('cancel_wager', { target_wager_id: existingWager.id });
              } catch (error: any) {
                Alert.alert('Error', error.message);
              }
            }
          }
        ]
      );
      return;
    }

    // 3. Open normal slip for new bets
    setSelectedBet(bet);
    setWagerAmount('');
    setSelectedOption(option || null);
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
    const existingWager = myWagers.find(w => String(w.bet_id) === String(item.id));
    const isOpen = item.status === 'open';
    const isLocked = item.status === 'locked';

    return (
      <View style={[styles.betCard, isLocked && { opacity: 0.9, borderColor: '#444' }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
          <Text style={styles.betQuestion}>{item.question}</Text>
          <View style={[
            styles.statusBadge, 
            isOpen ? { backgroundColor: 'rgba(0, 208, 132, 0.2)' } : { backgroundColor: 'rgba(255, 68, 68, 0.2)' }
          ]}>
            <Text style={{ color: isOpen ? '#00D084' : '#ff4444', fontWeight: 'bold', fontSize: 10 }}>
              {isOpen ? '🟢 OPEN' : '🔒 LOCKED'}
            </Text>
          </View>
        </View>
        
        {existingWager ? (
          <TouchableOpacity 
            style={[styles.lockedWagerCard, isLocked && { borderColor: '#666' }]} 
            onPress={() => openBetSlip(item)}
            disabled={isLocked} // Visual feedback: can't tap if locked
          >
            {/* Top Row: Status and Edit Prompt */}
            <View style={{ width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={styles.lockedText}>
                {isLocked ? '🔒 Ticket Locked' : '✅ Ticket Placed'}
              </Text>
              {isOpen && (
                <Text style={{color: '#00D084', fontSize: 12, fontStyle: 'italic'}}>
                  Tap to Edit
                </Text>
              )}
            </View>
            
            {/* Bottom Row: 2-Column Data Layout */}
            <View style={{ marginTop: 12, flexDirection: 'row', justifyContent: 'space-between', width: '100%' }}>
              
              {/* Left Column: Pick & Odds */}
              <View style={{ flex: 1 }}>
                <Text style={styles.lockedDetails}>
                  Pick: <Text style={{color: '#fff', fontWeight: 'bold'}}>{existingWager.bet_options.label}</Text>
                </Text>
                <Text style={styles.lockedDetails}>
                  Odds: <Text style={{color: '#00D084', fontWeight: 'bold'}}>{existingWager.bet_options.multiplier}x</Text>
                </Text>
              </View>

              {/* Right Column: Wager & Potential Win */}
              <View style={{ flex: 1, alignItems: 'flex-end' }}>
                <Text style={styles.lockedDetails}>
                  Wager: <Text style={{color: '#fff', fontWeight: 'bold'}}>{existingWager.points_risked} pts</Text>
                </Text>
                <Text style={[styles.lockedDetails, { color: '#00D084', fontWeight: 'bold' }]}>
                  Win: {Math.floor(existingWager.points_risked * existingWager.bet_options.multiplier)} pts
                </Text>
              </View>

            </View>
          </TouchableOpacity>
        ) : (
          <View style={styles.optionsRow}>
            {item.bet_options.map((option: any) => (
              <TouchableOpacity 
                key={option.id} 
                style={[styles.optionButton, isLocked && { opacity: 0.5 }]}
                onPress={() => openBetSlip(item, option)}
                disabled={isLocked}
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
            
            {userRole === 'host' && (
              <TouchableOpacity style={styles.navPillHost} onPress={() => navigation.navigate('Host')}>
                <Text style={styles.navPillHostText}>👑 Host</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Main Action Header (Mirrors Host View) */}
        {/* --- DYNAMIC HEADER --- */}
        {activeTab === 'action' ? (
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
        ) : (
          <View style={styles.mainHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Standings</Text>
              <Text style={styles.subtitle}>Current Leaderboard</Text>
              <Text style={styles.balanceText}>Wallet: {walletBalance.toLocaleString()} pts</Text>
            </View>
          </View>
        )}

      </View>

      {/* --- DYNAMIC MAIN CONTENT (STRICT EITHER / OR) --- */}
      {activeTab === 'action' ? (
        <FlatList
          style={{ flex: 1 }}
          data={bets}
          keyExtractor={(item) => item.id}
          renderItem={renderBetCard}
          contentContainerStyle={{ paddingBottom: 50 }}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <FlatList
          style={{ flex: 1 }}
          data={standings}
          keyExtractor={(item) => item.user_id}
          contentContainerStyle={{ paddingBottom: 50 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => {
            let rankColor = '#00D084'; 
            if (index === 0) rankColor = '#FFD700'; 
            else if (index === 1) rankColor = '#C0C0C0'; 
            else if (index === 2) rankColor = '#CD7F32'; 

            return (
              <View style={[styles.standingsCard, index === 0 && { borderColor: '#FFD700', borderWidth: 2 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={[styles.standingsRank, { color: rankColor }]}>#{index + 1}</Text>
                  <Text style={styles.standingsName}>
                    {item.users?.display_name || 'Unknown Player'}
                    <Text style={{ color: '#a0a0a0', fontWeight: 'normal', fontSize: 14 }}>
                      {item.user_id === userId ? ' (You)' : ''}
                    </Text>
                  </Text>
                </View>
                <Text style={[styles.standingsScore, { color: rankColor }]}>
                  {item.global_point_balance.toLocaleString()} pts
                </Text>
              </View>
            );
          }}
        />
      )}
      {/* --- BOTTOM NAVIGATION BAR --- */}
      <View style={styles.bottomNavBar}>
        {/* The Action Tab */}
        <TouchableOpacity 
          style={activeTab === 'action' ? styles.bottomNavBtnActive : styles.bottomNavBtn}
          onPress={() => setActiveTab('action')}
        >
          <Text style={{ fontSize: 20 }}>🎲</Text>
          <Text style={activeTab === 'action' ? styles.bottomNavTextActive : styles.bottomNavText}>The Action</Text>
        </TouchableOpacity>
        
        {/* Standings Tab */}
        <TouchableOpacity 
          style={activeTab === 'standings' ? styles.bottomNavBtnActive : styles.bottomNavBtn} 
          onPress={() => setActiveTab('standings')}
        >
          <Text style={{ fontSize: 20 }}>🏆</Text>
          <Text style={activeTab === 'standings' ? styles.bottomNavTextActive : styles.bottomNavText}>Standings</Text>
        </TouchableOpacity>
      </View>
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
                // Map the nested wager data correctly from Supabase
                const wagerStatus = item.status || 'pending'; 
                const question = item.bets?.question || 'Unknown Bet';
                const pick = item.bet_options?.label || 'Unknown Pick';
                const odds = item.bet_options?.multiplier || 1;
                const wagerAmount = item.points_risked || 0;
                const potentialWin = Math.floor(wagerAmount * odds);

                // Dynamic coloring based on ticket status
                let statusText = '🟡 PENDING';
                let statusColor = '#FFD700';
                let statusBg = 'rgba(255, 215, 0, 0.2)';

                if (wagerStatus === 'won') {
                  statusText = '🟢 WON';
                  statusColor = '#00D084';
                  statusBg = 'rgba(0, 208, 132, 0.2)';
                } else if (wagerStatus === 'lost') {
                  statusText = '🔴 LOST';
                  statusColor = '#ff4444';
                  statusBg = 'rgba(255, 68, 68, 0.2)';
                }

                return (
                  <View style={[styles.receiptCard, { borderColor: statusColor, opacity: wagerStatus === 'pending' ? 1 : 0.6 }]}>
                    
                    {/* Header: Question & Status Badge */}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                      <Text style={[styles.receiptQuestion, { flex: 1, paddingRight: 10 }]}>{question}</Text>
                      <View style={[styles.statusBadge, { backgroundColor: statusBg, borderColor: statusColor, borderWidth: 1 }]}>
                        <Text style={[styles.statusText, { color: statusColor }]}>{statusText}</Text>
                      </View>
                    </View>

                    {/* Body: Pick Data & Math */}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.receiptAmount}>Pick: <Text style={styles.receiptPick}>{pick}</Text></Text>
                        <Text style={styles.receiptAmount}>Odds: <Text style={styles.receiptOdds}>{odds}x</Text></Text>
                      </View>
                      
                      <View style={{ flex: 1, alignItems: 'flex-end' }}>
                        <Text style={styles.receiptAmount}>Wager: <Text style={{ color: '#fff', fontWeight: 'bold' }}>{wagerAmount} pts</Text></Text>
                        <Text style={[
                          wagerStatus === 'won' ? styles.receiptWon : (wagerStatus === 'lost' ? styles.receiptLost : styles.receiptToWin),
                          { marginTop: 4 }
                        ]}>
                          {wagerStatus === 'won' ? `Payout: ${potentialWin} pts` : `Win: ${potentialWin} pts`}
                        </Text>
                      </View>
                    </View>
                  </View>
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
  badgeWon: { backgroundColor: 'rgba(0, 208, 132, 0.2)', borderWidth: 1, borderColor: '#00D084' },
  badgeLost: { backgroundColor: 'rgba(255, 68, 68, 0.2)', borderWidth: 1, borderColor: '#ff4444' },
  badgePending: { backgroundColor: 'rgba(255, 215, 0, 0.2)', borderWidth: 1, borderColor: '#FFD700' },
  statusText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  receiptOdds: { color: '#a0a0a0', fontSize: 14, fontWeight: 'bold' },
  receiptToWin: { color: '#FFD700', fontSize: 14, fontWeight: 'bold' },
  receiptWon: { color: '#00D084', fontSize: 14, fontWeight: 'bold' },
  receiptLost: { color: '#ff4444', fontSize: 14, fontWeight: 'bold' },
  //statusBadge: { alignSelf: 'flex-start', paddingVertical: 4, paddingHorizontal: 10, borderRadius: 6 },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    height: 22,
    justifyContent: 'center'
  },
  // --- BOTTOM NAV STYLES ---
  // --- BOTTOM NAV STYLES ---
  bottomNavBar: {
    flexDirection: 'row',
    backgroundColor: '#1e1e1e',
    borderTopWidth: 1,
    borderTopColor: '#333',
    // These negative margins counteract the container's padding to hit the edges
    marginHorizontal: -15,
    marginBottom: -15,
    // Adds safe area padding for modern iPhones with the swipe-up bar
    paddingBottom: Platform.OS === 'ios' ? 25 : 0, 
  },
  bottomNavBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 15,
  },
  bottomNavBtnActive: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 15,
    backgroundColor: 'rgba(0, 208, 132, 0.05)',
    // Moved the active indicator line to the top of the tab
    borderTopWidth: 3, 
    borderTopColor: '#00D084',
    marginTop: -1, // Snaps the green line perfectly over the gray border
  },
  bottomNavText: {
    color: '#a0a0a0',
    fontSize: 12,
    fontWeight: 'bold',
    marginTop: 4,
  },
  bottomNavTextActive: {
    color: '#00D084',
    fontSize: 12,
    fontWeight: 'bold',
    marginTop: 4,
  },
  // --- STANDINGS STYLES ---
  standingsCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1e1e1e',
    padding: 18,
    borderRadius: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#333'
  },
  standingsRank: { color: '#00D084', fontSize: 18, fontWeight: 'bold', marginRight: 15 },
  standingsName: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  standingsScore: { color: '#FFD700', fontSize: 18, fontWeight: 'bold' },
});