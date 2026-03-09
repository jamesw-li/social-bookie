import React, { useEffect, useState } from 'react';
import { 
  StyleSheet, Text, View, FlatList, TouchableOpacity, 
  ActivityIndicator, Alert, Modal, TextInput, KeyboardAvoidingView, Platform 
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';
import * as Clipboard from 'expo-clipboard';

export default function DashboardScreen({ route, navigation }: any) {
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [walletBalance, setWalletBalance] = useState(0);
  const [activeEvent, setActiveEvent] = useState<any>(null);
  const [userRole, setUserRole] = useState<string>('guest');
  
  const [bets, setBets] = useState<any[]>([]);
  const [p2pBets, setP2pBets] = useState<any[]>([]);
  const [blindMatchups, setBlindMatchups] = useState<any[]>([]); // NEW
  const [myWagers, setMyWagers] = useState<any[]>([]);
  const [myBets, setMyBets] = useState<any[]>([]);
  const [standings, setStandings] = useState<any[]>([]);

  const [modalVisible, setModalVisible] = useState(false);
  const [selectedBet, setSelectedBet] = useState<any>(null);
  const [selectedOption, setSelectedOption] = useState<any>(null);
  const [wagerAmount, setWagerAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [suggestModalVisible, setSuggestModalVisible] = useState(false);
  const [pitchMode, setPitchMode] = useState<'idea' | 'challenge'>('idea'); 
  const [suggestionText, setSuggestionText] = useState('');
  const [pitchOptionA, setPitchOptionA] = useState('Yes');
  const [pitchOptionB, setPitchOptionB] = useState('No');
  const [pitchWager, setPitchWager] = useState('100');
  const [pitchMultiplier, setPitchMultiplier] = useState('2.0');

  const [myBetsModalVisible, setMyBetsModalVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<'action' | 'standings'>('action');
  const [joinCode, setJoinCode] = useState<string>('');
  const [shareModalVisible, setShareModalVisible] = useState(false);

  // --- NEW: BLIND BID STATES ---
  const [blindModalVisible, setBlindModalVisible] = useState(false);
  const [selectedMatchup, setSelectedMatchup] = useState<any>(null);
  const [blindBid, setBlindBid] = useState('2.0');

  useEffect(() => {
    let walletSub: any;
    let betsSub: any;
    let campaignSub: any;
    let p2pSub: any;
    let blindSub: any; // NEW

    async function setupRealtime() {
      const storedUserId = await AsyncStorage.getItem('userId');
      const storedCampaignId = await AsyncStorage.getItem('campaignId'); 

      walletSub = supabase.channel('public:campaign_participants_dashboard')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'campaign_participants', filter: `user_id=eq.${storedUserId}` }, () => loadBoard()).subscribe();
      betsSub = supabase.channel('public:bets_dashboard')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'bets' }, () => loadBoard()).subscribe();
      campaignSub = supabase.channel(`campaign_status_${storedCampaignId}`) 
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'campaigns', filter: `id=eq.${storedCampaignId}` }, 
          (payload) => { if (payload.new.status === 'closed') navigation.reset({ index: 0, routes: [{ name: 'FinalResults' }] }); }
        ).subscribe();
      p2pSub = supabase.channel('public:p2p_dashboard')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'p2p_prop_bets' }, () => loadBoard()).subscribe();
      blindSub = supabase.channel('public:blind_dashboard') // NEW
        .on('postgres_changes', { event: '*', schema: 'public', table: 'blind_matchups' }, () => loadBoard()).subscribe();
    }

    loadBoard();
    setupRealtime();

    return () => {
      if (walletSub) supabase.removeChannel(walletSub);
      if (betsSub) supabase.removeChannel(betsSub);
      if (campaignSub) supabase.removeChannel(campaignSub);
      if (p2pSub) supabase.removeChannel(p2pSub);
      if (blindSub) supabase.removeChannel(blindSub);
    };
  }, []);

  async function copyToClipboard() {
    if (!joinCode) return;
    await Clipboard.setStringAsync(joinCode);
    Alert.alert('Copied!', 'Room code copied to clipboard. Send it to your friends!');
    setShareModalVisible(false); 
  }

  async function loadBoard() {
    try {
      const storedUserId = await AsyncStorage.getItem('userId');
      const storedCampaignId = await AsyncStorage.getItem('campaignId');
      if (!storedUserId || !storedCampaignId) throw new Error("Missing user data.");
      
      setUserId(storedUserId); setCampaignId(storedCampaignId);
      
      const { data: campaignData } = await supabase.from('campaigns').select('join_code, status').eq('id', storedCampaignId).single();
      if (campaignData?.status === 'closed') {
        setLoading(false);
        return navigation.reset({ index: 0, routes: [{ name: 'FinalResults' }] });
      }
      if (campaignData?.join_code) setJoinCode(campaignData.join_code);

      const { data: participantData } = await supabase.from('campaign_participants').select('global_point_balance, role').eq('user_id', storedUserId).eq('campaign_id', storedCampaignId).single();
      if (participantData) { setWalletBalance(participantData.global_point_balance); setUserRole(participantData.role); }

      const { data: eventData } = await supabase.from('events').select('*').eq('campaign_id', storedCampaignId).eq('status', 'live').single();
      if (!eventData) return setLoading(false);
      setActiveEvent(eventData);

      const { data: betsData } = await supabase.from('bets').select(`id, question, status, bet_options!bet_options_bet_id_fkey ( id, label, multiplier )`).eq('event_id', eventData.id).in('status', ['open', 'locked']);
      if (betsData) setBets(betsData);

      const { data: p2pData } = await supabase.from('p2p_prop_bets').select('*').eq('campaign_id', storedCampaignId).in('status', ['open', 'locked', 'resolved']);
      if (p2pData) setP2pBets(p2pData);

      // --- NEW: FETCH BLIND MATCHUPS ---
      const { data: blindData } = await supabase.from('blind_matchups').select('*').eq('campaign_id', storedCampaignId).in('status', ['open', 'matched', 'resolved']);
      if (blindData) setBlindMatchups(blindData);

      const { data: wagersData } = await supabase.from('wagers').select(`id, bet_id, points_risked, status, created_at, bet_options!wagers_option_id_fkey ( label, multiplier ), bets ( question, event_id ) `).eq('user_id', storedUserId);
      if (wagersData) {
        const eventWagers = wagersData.filter((w: any) => w.bets?.event_id === eventData.id);
        setMyWagers(eventWagers.filter((w: any) => w.status === 'pending'));
        setMyBets(eventWagers.reverse());
      }
      
      const { data: standingsData } = await supabase.from('campaign_participants').select('user_id, global_point_balance, users(display_name)').eq('campaign_id', storedCampaignId).order('global_point_balance', { ascending: false }); 
      if (standingsData) setStandings(standingsData);

    } catch (error: any) { console.error(error.message); } finally { setLoading(false); }
  }

  // ... (Keep existing openBetSlip, submitWager, handleClaimP2P, executeClaim, submitSuggestion, handleSwitchEvent intact) ...
  function openBetSlip(bet: any, option?: any) {
    const cleanBetId = String(bet.id).toLowerCase().trim();
    const existingWager = myWagers.find((w: any) => String(w.bet_id).toLowerCase().trim() === cleanBetId);

    if (bet.status === 'locked') {
      const lockMsg = 'The host has locked betting for this action. No more changes allowed.';
      if (Platform.OS === 'web') return window.alert(`Board Locked 🔒\n${lockMsg}`);
      return Alert.alert('Board Locked 🔒', lockMsg);
    }

    if (existingWager) {
      if (Platform.OS === 'web') {
        const confirmRefund = window.confirm('You already have action on this bet. Want to cancel your ticket, refund your points, and pick again?');
        if (confirmRefund) {
          (async () => {
            try {
              await supabase.rpc('cancel_wager', { target_wager_id: existingWager.id });
              window.alert('Refunded! Your points have been returned.');
              loadBoard();
            } catch (error: any) { window.alert(`Error: ${error.message}`); }
          })();
        }
        return;
      }

      Alert.alert('Bet Already Placed', 'Want to cancel your ticket, refund your points, and pick again?', [
          { text: 'Keep Ticket', style: 'cancel' },
          { text: 'Refund & Edit', style: 'destructive', onPress: async () => {
              try { await supabase.rpc('cancel_wager', { target_wager_id: existingWager.id }); loadBoard(); } 
              catch (error: any) { Alert.alert('Error', error.message); }
            }
          }
        ]);
      return;
    }

    setSelectedBet(bet); setWagerAmount(''); setSelectedOption(option || null); setModalVisible(true);
  }

  async function submitWager() {
    const pointsToRisk = parseInt(wagerAmount);
    if (isNaN(pointsToRisk) || pointsToRisk <= 0) return Alert.alert('Invalid', 'Enter a valid amount.');
    if (pointsToRisk > walletBalance) return Alert.alert('Insufficient Funds', 'Not enough points!');

    setIsSubmitting(true);
    try {
      const { error: wagerError } = await supabase.from('wagers').insert([{ user_id: userId, bet_id: selectedBet.id, option_id: selectedOption.id, points_risked: pointsToRisk, status: 'pending' }]);
      if (wagerError) throw wagerError;

      const newBalance = walletBalance - pointsToRisk;
      await supabase.from('campaign_participants').update({ global_point_balance: newBalance }).eq('user_id', userId).eq('campaign_id', campaignId);

      setWalletBalance(newBalance); setModalVisible(false); loadBoard(); 
    } catch (error: any) {
      if (error.code === '23505') Alert.alert('Hold Up', 'You already placed a wager on this bet!');
      else Alert.alert('Error', error.message);
    } finally { setIsSubmitting(false); }
  }

  async function handleClaimP2P(betId: string, side: 'A' | 'B', cost: number) {
    if (cost > walletBalance) {
      const msg = 'You do not have enough points for this side.';
      if (Platform.OS === 'web') return window.alert(msg);
      return Alert.alert('Insufficient Funds', msg);
    }

    const title = 'Lock in Side?'; const message = `This will cost ${cost} pts.`;

    if (Platform.OS === 'web') {
      if (window.confirm(`${title}\n${message}`)) executeClaim(betId, side, cost);
    } else {
      Alert.alert(title, message, [{ text: 'Cancel', style: 'cancel' }, { text: 'Lock It In', onPress: () => executeClaim(betId, side, cost) }]);
    }
  }

  async function executeClaim(betId: string, side: 'A' | 'B', cost: number) {
    setIsSubmitting(true);
    setP2pBets(prev => prev.map(bet => {
      if (bet.id === betId) {
        return { ...bet, side_a_user_id: side === 'A' ? userId : bet.side_a_user_id, side_b_user_id: side === 'B' ? userId : bet.side_b_user_id, status: (side === 'A' && bet.side_b_user_id) || (side === 'B' && bet.side_a_user_id) ? 'locked' : bet.status };
      }
      return bet;
    }));
    setWalletBalance(prev => prev - cost);

    try {
      const { error } = await supabase.rpc('claim_p2p_side', { p_bet_id: betId, p_user_id: userId, p_side: side, p_cost: cost });
      if (error) throw error;
      loadBoard(); 
    } catch (err: any) {
      if (Platform.OS === 'web') window.alert(err.message); else Alert.alert('Error', err.message);
      loadBoard(); 
    } finally { setIsSubmitting(false); }
  }

  

  // --- NEW: BLIND MATCH LOGIC ---
  async function submitBlindBid() {
    const bidValue = parseFloat(blindBid);
    if (isNaN(bidValue) || bidValue <= 1) return Alert.alert("Invalid", "Multiplier bid must be greater than 1.0x");
    
    // Safety check for wallet balance (worst case scenario: they are the underdog and have to pay riskIfUnderdog)
    const base = selectedMatchup.base_amount;
    const maxRisk = Math.max(base, (base * bidValue) - base);
    if (maxRisk > walletBalance) {
      return Alert.alert("Insufficient Funds", `You need at least ${Math.floor(maxRisk)} pts to safely place this blind bid.`);
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase.rpc('match_blind_p2p', {
        p_matchup_id: selectedMatchup.id,
        p_user_2_id: userId,
        p_user_2_bid: bidValue
      });
      
      if (error) throw error;
      
      setBlindModalVisible(false);
      setBlindBid('2.0');
      loadBoard();
    } catch (err: any) {
      Alert.alert("Match Failed", err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function submitSuggestion() {
    if (pitchMode === 'idea') {
      if (!suggestionText.trim()) return Alert.alert('Error', 'Type an idea first!');
      setIsSubmitting(true);
      try {
        await supabase.from('guest_proposals').insert([{
          event_id: activeEvent?.id,
          user_id: userId,
          suggestion: suggestionText,
          status: 'pending'
        }]);
        setSuggestionText('');
        setSuggestModalVisible(false);
        Alert.alert('Sent!', 'Your idea was sent to the host.');
      } catch (error: any) { 
        Alert.alert('Error', error.message); 
      } finally {
        setIsSubmitting(false);
      }
    } 
    else {
      if (!suggestionText.trim() || !pitchOptionA.trim() || !pitchOptionB.trim()) {
        return Alert.alert('Error', 'Please fill out the scenario and both options.');
      }
      
      const wagerAmt = parseFloat(pitchWager);
      const multiAmt = parseFloat(pitchMultiplier);

      if (isNaN(wagerAmt) || wagerAmt <= 0) return Alert.alert('Invalid', 'Wager must be > 0');
      if (isNaN(multiAmt) || multiAmt <= 0) return Alert.alert('Invalid', 'Multiplier must be > 0');

      setIsSubmitting(true);
      try {
        const { error } = await supabase.from('p2p_prop_bets').insert([{
          campaign_id: campaignId,
          proposer_id: userId,
          question: suggestionText,
          option_a_label: pitchOptionA,
          option_b_label: pitchOptionB,
          wager_amount: wagerAmt,
          multiplier: multiAmt,
          status: 'pending_approval' 
        }]);

        if (error) throw error;

        setSuggestionText('');
        setPitchOptionA('Yes');
        setPitchOptionB('No');
        setPitchWager('100');
        setPitchMultiplier('2.0');
        setPitchMode('idea'); 
        
        setSuggestModalVisible(false);
        Alert.alert('Sent!', 'Your challenge was sent to the host for approval.');
      } catch (error: any) {
        Alert.alert('Error', error.message);
      } finally {
        setIsSubmitting(false);
      }
    }
  }

  async function handleSwitchEvent() {
    try {
      const savedUserId = await AsyncStorage.getItem('userId');
      const savedUserName = await AsyncStorage.getItem('userName');
      
      // Clear the active lobby data
      await AsyncStorage.removeItem('campaignId');
      await AsyncStorage.removeItem('campaignName');
      
      // Use replace() for a smoother, crash-free transition on Native Android
      if (navigation.replace) {
        navigation.replace('Campaigns', { userId: savedUserId, userName: savedUserName });
      } else {
        // Fallback for Web if replace isn't supported by the router version
        navigation.reset({ 
          index: 0, 
          routes: [{ name: 'Campaigns', params: { userId: savedUserId, userName: savedUserName } }] 
        });
      }
    } catch (error: any) {
      // Force Android to show us the error instead of failing silently
      Alert.alert("Navigation Error", error.message || "Failed to leave the board.");
      console.error("Error switching events:", error);
    }
  }

  const potentialWin = wagerAmount ? Math.floor(parseInt(wagerAmount) * (selectedOption?.multiplier || 1)) : 0;
  
  // Blind Math Preview values
  const blindBase = selectedMatchup?.base_amount || 100;
  const myBlindBid = parseFloat(blindBid) || 2.0;
  const riskIfFav = blindBase;
  const riskIfDog = Math.trunc((blindBase * myBlindBid) - blindBase);

  const renderBetCard = ({ item }: { item: any }) => {
    const existingWager = myWagers.find(w => String(w.bet_id) === String(item.id));
    const isOpen = item.status === 'open';
    const isLocked = item.status === 'locked';

    // Helper function to find the user's name from our Standings data
    const getPlayerName = (uid: string) => {
      const player = standings.find(s => s.user_id === uid);
      return player?.users?.display_name || 'Someone';
    };

    // --- BLIND BET RENDERER ---
    if (item.isBlind) {
      const isCreator = item.user_1_id === userId;
      const isMatched = item.status === 'matched' || item.status === 'resolved';

      return (
        <View style={[styles.betCard, { borderColor: '#BB86FC', borderWidth: 2 }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 }}>
            <Text style={[styles.betQuestion, { flex: 1 }]}>{item.question}</Text>
            <View style={{ backgroundColor: '#BB86FC', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, height: 24 }}>
              <Text style={{ color: '#000', fontWeight: 'bold', fontSize: 10 }}>🤝 BLIND</Text>
            </View>
          </View>

          {isMatched ? (
            <View style={{ backgroundColor: 'rgba(187, 134, 252, 0.1)', padding: 15, borderRadius: 8, borderWidth: 1, borderColor: '#BB86FC' }}>
              <Text style={{ color: '#BB86FC', fontWeight: 'bold', textAlign: 'center', marginBottom: 10, fontSize: 16 }}>
                Match Made! Final Odds: {Number(item.final_multiplier).toFixed(2)}x
              </Text>
              
              {/* --- NEW: BLIND TICKET SUMMARY --- */}
              {item.side_a_user_id === userId || item.side_b_user_id === userId ? (
                (() => {
                  const isA = item.side_a_user_id === userId;
                  const oppId = isA ? item.side_b_user_id : item.side_a_user_id;
                  const oppName = getPlayerName(oppId);
                  const myWager = isA ? item.base_amount : Math.trunc((item.base_amount * item.final_multiplier) - item.base_amount);
                  const myPick = isA ? item.side_a_label : item.side_b_label;
                  const pot = Math.trunc(item.base_amount * item.final_multiplier);

                  return (
                    <>
                      <View style={{ width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, borderTopWidth: 1, borderTopColor: 'rgba(187, 134, 252, 0.3)', paddingTop: 10 }}>
                        <Text style={{ color: '#BB86FC', fontWeight: 'bold', fontSize: 14 }}>🎯 Your Ticket</Text>
                        <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>VS. {oppName.toUpperCase()}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%' }}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.lockedDetails}>Pick: <Text style={{color: '#fff', fontWeight: 'bold'}}>{myPick}</Text></Text>
                          <Text style={styles.lockedDetails}>Wager: <Text style={{color: '#fff', fontWeight: 'bold'}}>{myWager} pts</Text></Text>
                        </View>
                        <View style={{ flex: 1, alignItems: 'flex-end', justifyContent: 'flex-end' }}>
                          <Text style={[styles.lockedDetails, { color: '#FFD700', fontWeight: 'bold', fontSize: 16 }]}>
                            Payout: {Math.trunc(item.total_pot)} pts
                          </Text>
                        </View>
                      </View>
                    </>
                  );
                })()
              ) : (
                <Text style={{ color: '#fff', textAlign: 'center', fontSize: 14 }}>
                  {getPlayerName(item.side_a_user_id)} vs {getPlayerName(item.side_b_user_id)}
                </Text>
              )}
            </View>
          ) : (
            <TouchableOpacity 
              style={[styles.optionButton, isCreator && { backgroundColor: '#121212', borderColor: '#333' }]}
              disabled={isCreator}
              onPress={() => { setSelectedMatchup(item); setBlindModalVisible(true); }}
            >
              <Text style={[styles.optionLabel, isCreator && { color: '#666' }]}>
                {isCreator ? "Waiting for Challenger..." : "Challenge with Blind Bid"}
              </Text>
              <Text style={{ color: '#a0a0a0', fontSize: 10, marginTop: 4 }}>Base Unit: {item.base_amount} pts</Text>
            </TouchableOpacity>
          )}
        </View>
      );
    }

    // --- P2P BET RENDERER ---
    if (item.isP2P) {
      const iClaimedA = item.side_a_user_id === userId;
      const iClaimedB = item.side_b_user_id === userId;
      const hasAction = iClaimedA || iClaimedB;
      
      return (
        <View style={[styles.betCard, { borderColor: '#FFD700', borderWidth: 2 }, isLocked && { opacity: 0.8 }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 }}>
            <Text style={[styles.betQuestion, { flex: 1 }]}>{item.question}</Text>
            <View style={{ backgroundColor: '#FFD700', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, height: 24 }}>
              <Text style={{ color: '#000', fontWeight: 'bold', fontSize: 10 }}>🥊 PROP</Text>
            </View>
          </View>
          
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {/* SIDE A */}
            <TouchableOpacity style={[ styles.optionButton, { flex: 1, paddingVertical: 12 }, (item.side_a_user_id || isLocked) && { backgroundColor: '#121212', borderColor: '#333' } ]} disabled={!!item.side_a_user_id || isLocked || iClaimedB} onPress={() => handleClaimP2P(item.id, 'A', item.wager_amount)} >
              <Text style={item.side_a_user_id ? { color: '#666', fontWeight: 'bold', textAlign: 'center' } : [styles.optionLabel, { textAlign: 'center' }]}>
                {item.side_a_user_id ? (iClaimedA ? `✅ You locked` : `🔒 ${getPlayerName(item.side_a_user_id)} locked`) : item.option_a_label}
              </Text>
              {!item.side_a_user_id && (
                <View style={{ alignItems: 'center', marginTop: 4 }}>
                  <Text style={styles.optionOdds}>{Number(item.multiplier).toFixed(2)}x</Text>
                  <Text style={{ color: '#a0a0a0', fontSize: 10, marginTop: 4 }}>{item.wager_amount} pts</Text>
                </View>
              )}
              {item.side_a_user_id && ( <Text style={{ color: iClaimedA ? '#00D084' : '#666', fontSize: 12, marginTop: 4, textAlign: 'center', fontWeight: 'bold' }}> {item.option_a_label} </Text> )}
            </TouchableOpacity>

            {/* SIDE B */}
            <TouchableOpacity style={[ styles.optionButton, { flex: 1, paddingVertical: 12 }, (item.side_b_user_id || isLocked) && { backgroundColor: '#121212', borderColor: '#333' } ]} disabled={!!item.side_b_user_id || isLocked || iClaimedA} onPress={() => handleClaimP2P(item.id, 'B', item.challenger_cost)} >
              <Text style={item.side_b_user_id ? { color: '#666', fontWeight: 'bold', textAlign: 'center' } : [styles.optionLabel, { textAlign: 'center' }]}>
                {item.side_b_user_id ? (iClaimedB ? `✅ You locked` : `🔒 ${getPlayerName(item.side_b_user_id)} locked`) : item.option_b_label}
              </Text>
              {!item.side_b_user_id && (
                <View style={{ alignItems: 'center', marginTop: 4 }}>
                  <Text style={styles.optionOdds}> {item.challenger_cost > 0 ? (Number(item.total_pot) / Number(item.challenger_cost)).toFixed(2) : '1.00'}x </Text>
                  <Text style={{ color: '#a0a0a0', fontSize: 10, marginTop: 4 }}>{item.challenger_cost} pts</Text>
                </View>
              )}
              {item.side_b_user_id && ( <Text style={{ color: iClaimedB ? '#00D084' : '#666', fontSize: 12, marginTop: 4, textAlign: 'center', fontWeight: 'bold' }}> {item.option_b_label} </Text> )}
            </TouchableOpacity>
          </View>

          {/* --- NEW: P2P TICKET SUMMARY --- */}
          {hasAction && (
            <View style={[styles.lockedWagerCard, { borderColor: '#FFD700', marginTop: 15 }]}>
              <View style={{ width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <Text style={{ color: '#FFD700', fontWeight: 'bold', fontSize: 14 }}>🎯 Your Ticket</Text>
                <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>
                  VS. { (iClaimedA && item.side_b_user_id) ? getPlayerName(item.side_b_user_id).toUpperCase() : 
                         (iClaimedB && item.side_a_user_id) ? getPlayerName(item.side_a_user_id).toUpperCase() : 
                         'WAITING...' }
                </Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%' }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.lockedDetails}>Pick: <Text style={{color: '#fff', fontWeight: 'bold'}}>{iClaimedA ? item.option_a_label : item.option_b_label}</Text></Text>
                  <Text style={styles.lockedDetails}>Wager: <Text style={{color: '#fff', fontWeight: 'bold'}}>{iClaimedA ? item.wager_amount : item.challenger_cost} pts</Text></Text>
                </View>
                <View style={{ flex: 1, alignItems: 'flex-end', justifyContent: 'flex-end' }}>
                  <Text style={[styles.lockedDetails, { color: '#FFD700', fontWeight: 'bold', fontSize: 16 }]}>
                    Payout: {item.total_pot} pts
                  </Text>
                </View>
              </View>
            </View>
          )}

        </View>
      );
    }
    
    // --- HOUSE BET RENDERER ---
    return (
      <View style={[styles.betCard, isLocked && { opacity: 0.9, borderColor: '#444' }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
          <Text style={styles.betQuestion}>{item.question}</Text>
          <View style={[ styles.statusBadge, isOpen ? { backgroundColor: 'rgba(0, 208, 132, 0.2)' } : { backgroundColor: 'rgba(255, 68, 68, 0.2)' } ]}>
            <Text style={{ color: isOpen ? '#00D084' : '#ff4444', fontWeight: 'bold', fontSize: 10 }}> {isOpen ? '🟢 OPEN' : '🔒 LOCKED'} </Text>
          </View>
        </View>
        
        {existingWager ? (
          <TouchableOpacity style={[styles.lockedWagerCard, isLocked && { borderColor: '#666' }]} onPress={() => openBetSlip(item)} disabled={isLocked} >
            <View style={{ width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={styles.lockedText}>{isLocked ? '🔒 Ticket Locked' : '✅ Ticket Placed'}</Text>
              {isOpen && <Text style={{color: '#00D084', fontSize: 12, fontStyle: 'italic'}}>Tap to Edit</Text>}
            </View>
            <View style={{ marginTop: 12, flexDirection: 'row', justifyContent: 'space-between', width: '100%' }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.lockedDetails}>Pick: <Text style={{color: '#fff', fontWeight: 'bold'}}>{existingWager.bet_options?.label}</Text></Text>
                <Text style={styles.lockedDetails}>Odds: <Text style={{color: '#00D084', fontWeight: 'bold'}}>{existingWager.bet_options?.multiplier}x</Text></Text>
              </View>
              <View style={{ flex: 1, alignItems: 'flex-end' }}>
                <Text style={styles.lockedDetails}>Wager: <Text style={{color: '#fff', fontWeight: 'bold'}}>{existingWager.points_risked} pts</Text></Text>
                <Text style={[styles.lockedDetails, { color: '#00D084', fontWeight: 'bold' }]}> Win: {Math.floor(existingWager.points_risked * (existingWager.bet_options?.multiplier || 1))} pts </Text>
              </View>
            </View>
          </TouchableOpacity>
        ) : (
          <View style={styles.optionsRow}>
            {item.bet_options?.map((option: any) => (
              <TouchableOpacity key={option.id} style={[styles.optionButton, isLocked && { opacity: 0.5 }]} onPress={() => openBetSlip(item, option)} disabled={isLocked} >
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

  // Combine lists for My Live Tickets Modal (NOW INCLUDES BLIND BETS)
  const combinedTickets = [
    ...blindMatchups
      .filter(b => String(b.user_1_id) === String(userId) || String(b.user_2_id) === String(userId))
      .map(b => ({ ...b, type: 'blind' })),
    ...p2pBets
      .filter(b => String(b.side_a_user_id) === String(userId) || String(b.side_b_user_id) === String(userId))
      .map(b => ({ ...b, type: 'p2p' })),
    ...myBets.map(w => ({ ...w, type: 'house' }))
  ].sort((a, b) => {
    const getWeight = (status: string) => { if (status === 'won' || status === 'lost' || status === 'resolved') return 2; return 1; };
    const weightA = getWeight(a.status || 'pending'); const weightB = getWeight(b.status || 'pending');
    if (weightA !== weightB) return weightA - weightB; 
    const dateA = a.created_at ? new Date(a.created_at).getTime() : 0; const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
    return dateB - dateA; 
  });

  return (
    <View style={styles.container}>
      {/* --- HEADER --- */}
      <View style={styles.headerContainer}>
        {/* ... (Existing Header UI) ... */}
        <View style={styles.topNavRow}>
          <TouchableOpacity style={styles.navPillLeave} onPress={handleSwitchEvent}><Text style={styles.navPillLeaveText}>← Leave</Text></TouchableOpacity>
          <View style={styles.rightNavGroup}>
            {joinCode ? ( <TouchableOpacity style={styles.navPillShare} onPress={() => setShareModalVisible(true)}><Text style={styles.navPillShareText}>📤 Share</Text></TouchableOpacity> ) : null}
            <TouchableOpacity style={styles.navPillMyBets} onPress={() => setMyBetsModalVisible(true)}><Text style={styles.navPillMyBetsText}>🧾 My Bets</Text></TouchableOpacity>
            {userRole === 'host' && ( <TouchableOpacity style={styles.navPillHost} onPress={() => navigation.navigate('Host')}><Text style={styles.navPillHostText}>👑 Host</Text></TouchableOpacity> )}
          </View>
        </View>

        {activeTab === 'action' ? (
          <View style={styles.mainHeaderRow}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={styles.title}>The Action</Text>
              <Text style={styles.subtitle}>{activeEvent ? `Live: ${activeEvent.name}` : 'Waiting for host...'}</Text>
              <Text style={styles.balanceText}>Wallet: {walletBalance.toLocaleString()} pts</Text>
            </View>
            <TouchableOpacity style={styles.pitchButton} onPress={() => setSuggestModalVisible(true)}><Text style={styles.pitchButtonText}>+ Pitch Bet</Text></TouchableOpacity>
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

      {/* --- CONTENT AREA --- */}
      {activeTab === 'action' ? (
        <FlatList
          style={{ flex: 1 }}
          data={[
            ...blindMatchups.filter(b => b.status === 'open' || b.status === 'matched').map(b => ({ ...b, isBlind: true })),
            ...p2pBets.filter(b => b.status === 'open' || b.status === 'locked').map(b => ({ ...b, isP2P: true })), 
            ...bets
          ]}
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
            if (index === 0) rankColor = '#FFD700'; else if (index === 1) rankColor = '#C0C0C0'; else if (index === 2) rankColor = '#CD7F32'; 
            return (
              <View style={[styles.standingsCard, index === 0 && { borderColor: '#FFD700', borderWidth: 2 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={[styles.standingsRank, { color: rankColor }]}>#{index + 1}</Text>
                  <Text style={styles.standingsName}>{item.users?.display_name || 'Unknown Player'}<Text style={{ color: '#a0a0a0', fontWeight: 'normal', fontSize: 14 }}>{item.user_id === userId ? ' (You)' : ''}</Text></Text>
                </View>
                <Text style={[styles.standingsScore, { color: rankColor }]}>{item.global_point_balance.toLocaleString()} pts</Text>
              </View>
            );
          }}
        />
      )}

      {/* --- BOTTOM NAV --- */}
      <View style={styles.bottomNavBar}>
        <TouchableOpacity style={activeTab === 'action' ? styles.bottomNavBtnActive : styles.bottomNavBtn} onPress={() => setActiveTab('action')}>
          <Text style={{ fontSize: 20 }}>🎲</Text>
          <Text style={activeTab === 'action' ? styles.bottomNavTextActive : styles.bottomNavText}>The Action</Text>
        </TouchableOpacity>
        <TouchableOpacity style={activeTab === 'standings' ? styles.bottomNavBtnActive : styles.bottomNavBtn} onPress={() => setActiveTab('standings')}>
          <Text style={{ fontSize: 20 }}>🏆</Text>
          <Text style={activeTab === 'standings' ? styles.bottomNavTextActive : styles.bottomNavText}>Standings</Text>
        </TouchableOpacity>
      </View>

      {/* --- NEW: BLIND BID MODAL --- */}
      <Modal visible={blindModalVisible} transparent={true} animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlayCenter}>
          <View style={styles.gradeModalContent}>
            {/* Grab the labels dynamically */}
            {(() => {
              const sideA = selectedMatchup?.side_a_label || 'Team A';
              const sideB = selectedMatchup?.side_b_label || 'Team B';
              
              return (
                <>
                  <Text style={[styles.modalTitle, { color: '#BB86FC' }]}>Place Your Blind Bid</Text>
                  <Text style={{ color: '#fff', fontSize: 18, textAlign: 'center', fontWeight: 'bold', marginBottom: 5 }}>{selectedMatchup?.question}</Text>
                  
                  {/* Explicitly show the matchup */}
                  <Text style={{ color: '#BB86FC', fontSize: 16, textAlign: 'center', fontWeight: 'bold', marginBottom: 20 }}>
                    {sideA} <Text style={{color: '#666', fontWeight: 'normal'}}>vs</Text> {sideB}
                  </Text>
                  
                  <View style={{ backgroundColor: '#121212', padding: 15, borderRadius: 8, borderWidth: 1, borderColor: '#333', marginBottom: 20 }}>
                    <Text style={{ color: '#a0a0a0', textAlign: 'center', marginBottom: 10, fontSize: 14 }}>
                      Host's Base Unit: <Text style={{ color: '#fff', fontWeight: 'bold' }}>{blindBase} pts</Text>
                    </Text>
                    
                    {/* The vital instructional text */}
                    <Text style={{ color: '#a0a0a0', textAlign: 'center', fontSize: 12, lineHeight: 18 }}>
                      Bid LOWER than the hidden creator to claim <Text style={{ color: '#fff', fontWeight: 'bold' }}>{sideA}</Text>.{"\n"}
                      Bid HIGHER and you will get pushed to <Text style={{ color: '#fff', fontWeight: 'bold' }}>{sideB}</Text>.
                    </Text>
                  </View>

                  <Text style={{ color: '#BB86FC', fontSize: 14, fontWeight: 'bold', marginBottom: 5 }}>Your Multiplier Bid for {sideA}</Text>
                  <TextInput 
                    style={styles.p2pInput}
                    keyboardType="decimal-pad"
                    value={blindBid}
                    onChangeText={setBlindBid}
                    autoFocus
                  />

                  {/* --- DYNAMIC PREVIEW --- */}
                  <View style={styles.previewContainer}>
                    <Text style={styles.previewTitle}>Potential Outcomes:</Text>
                    
                    <View style={styles.previewRow}>
                      <Text style={styles.previewText}>If you get {sideA} (Lower Bid):</Text>
                      <Text style={styles.previewRisk}>Risk {riskIfFav} pts</Text>
                    </View>
                    
                    <View style={styles.previewRow}>
                      <Text style={styles.previewText}>If you get {sideB} (Higher Bid):</Text>
                      <Text style={styles.previewRisk}>Risk ~{riskIfDog} pts*</Text>
                    </View>
                    
                    <Text style={styles.disclaimer}>*Actual {sideB} risk depends on the averaged odds.</Text>
                  </View>

                  <TouchableOpacity style={[styles.confirmButton, { backgroundColor: '#BB86FC' }, isSubmitting && { opacity: 0.7 }]} onPress={submitBlindBid} disabled={isSubmitting}>
                    <Text style={[styles.confirmButtonText, { color: '#000' }]}>{isSubmitting ? 'Locking...' : 'Lock In Blind Bid'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={{ marginTop: 15, alignItems: 'center' }} onPress={() => setBlindModalVisible(false)}>
                    <Text style={styles.closeSlipText}>Cancel</Text>
                  </TouchableOpacity>
                </>
              );
            })()}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* --- SHARE MODAL --- */}
      <Modal visible={shareModalVisible} transparent={true} animationType="fade">
        <View style={styles.centeredModalOverlay}>
          <View style={styles.shareModalContainer}>
            <Text style={styles.shareModalTitle}>Invite Players</Text>
            <Text style={styles.shareModalSub}>Give this code to your friends so they can join the action.</Text>
            <View style={styles.codeDisplayBox}>
              <Text style={styles.hugeCodeText}>{joinCode}</Text>
            </View>
            <TouchableOpacity style={styles.copyButton} onPress={copyToClipboard}>
              <Text style={styles.copyButtonText}>📋 Copy Code</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.closeModalBtn} onPress={() => setShareModalVisible(false)}>
              <Text style={styles.closeModalText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* --- BET SLIP MODAL (HOUSE BETS) --- */}
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

      {/* --- PITCH BET / SUGGESTION MODAL --- */}
      <Modal visible={suggestModalVisible} transparent={true} animationType="fade">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlayCenter}>
          <View style={styles.gradeModalContent}>
            <View style={styles.typeSelectorRow}>
              <TouchableOpacity style={[styles.typeBtn, pitchMode === 'idea' && styles.typeBtnActive]} onPress={() => setPitchMode('idea')}>
                <Text style={[styles.typeBtnText, pitchMode === 'idea' && styles.typeBtnTextActive]}>💡 Suggest Idea</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.typeBtn, pitchMode === 'challenge' && styles.typeBtnActive]} onPress={() => setPitchMode('challenge')}>
                <Text style={[styles.typeBtnText, pitchMode === 'challenge' && styles.typeBtnTextActive]}>🥊 Create Challenge</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.modalTitle}>{pitchMode === 'idea' ? 'Pitch an Idea' : 'Set the Terms'}</Text>
            {pitchMode === 'idea' ? (
              <TextInput style={[styles.pitchInput, { minHeight: 100 }]} placeholder="e.g., Will Chris go all-in blind?" placeholderTextColor="#666" value={suggestionText} onChangeText={setSuggestionText} multiline={true} />
            ) : (
              <>
                <Text style={{ color: '#00D084', fontSize: 14, fontWeight: 'bold', marginBottom: 5 }}>The Scenario</Text>
                <TextInput style={[styles.pitchInput, { minHeight: 60, marginBottom: 15 }]} placeholder="e.g., Will Chris spill his drink?" placeholderTextColor="#666" value={suggestionText} onChangeText={setSuggestionText} multiline={true} />
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 15 }}>
                  <View style={{ flex: 1 }}><Text style={{ color: '#00D084', fontSize: 14, fontWeight: 'bold', marginBottom: 5 }}>Option A</Text><TextInput style={styles.p2pInput} value={pitchOptionA} onChangeText={setPitchOptionA} placeholder="Yes" placeholderTextColor="#666" /></View>
                  <View style={{ flex: 1 }}><Text style={{ color: '#00D084', fontSize: 14, fontWeight: 'bold', marginBottom: 5 }}>Option B</Text><TextInput style={styles.p2pInput} value={pitchOptionB} onChangeText={setPitchOptionB} placeholder="No" placeholderTextColor="#666" /></View>
                </View>
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 5 }}>
                  <View style={{ flex: 1 }}><Text style={{ color: '#00D084', fontSize: 14, fontWeight: 'bold', marginBottom: 5 }}>Risk (Side A)</Text><TextInput style={styles.p2pInput} keyboardType="numeric" value={pitchWager} onChangeText={setPitchWager} /></View>
                  <View style={{ flex: 1 }}><Text style={{ color: '#00D084', fontSize: 14, fontWeight: 'bold', marginBottom: 5 }}>Odds (Side A)</Text><TextInput style={styles.p2pInput} keyboardType="decimal-pad" value={pitchMultiplier} onChangeText={setPitchMultiplier} /></View>
                </View>
                <View style={styles.mathBox}>
                  <Text style={{ color: '#a0a0a0', fontSize: 14, marginBottom: 8 }}>Side A Risks: <Text style={{color: '#fff'}}>{Math.trunc(parseFloat(pitchWager) || 0)} pts</Text></Text>
                  <Text style={{ color: '#a0a0a0', fontSize: 14, marginBottom: 8 }}>Side B Must Risk: <Text style={{color: '#fff'}}>{Math.trunc((parseFloat(pitchWager) || 0) * (parseFloat(pitchMultiplier) || 0)).toFixed(0)} pts</Text></Text>
                  <Text style={{ color: '#FFD700', fontSize: 18, fontWeight: 'bold', marginTop: 5 }}>Total Pot: {Math.trunc((parseFloat(pitchWager) || 0) + ((parseFloat(pitchWager) || 0) * (parseFloat(pitchMultiplier) || 0))).toFixed(0)} pts</Text>
                </View>
              </>
            )}
            <TouchableOpacity style={[styles.confirmButton, isSubmitting && { opacity: 0.7 }]} onPress={submitSuggestion} disabled={isSubmitting}>
              <Text style={styles.confirmButtonText}>{isSubmitting ? 'Sending...' : 'Send to Host'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ marginTop: 15, alignItems: 'center' }} onPress={() => setSuggestModalVisible(false)}><Text style={styles.closeSlipText}>Cancel</Text></TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* --- MY BETS (LIVE RECEIPTS) MODAL --- */}
      <Modal visible={myBetsModalVisible} transparent={true} animationType="slide">
        <View style={styles.modalOverlayCenter}>
          <View style={[styles.gradeModalContent, { maxHeight: '80%', width: '100%' }]}>
            <Text style={styles.modalTitle}>My Live Tickets</Text>
            <FlatList
              data={combinedTickets}
              keyExtractor={(item, index) => item.id ? `${item.type}-${item.id}` : index.toString()}
              ListEmptyComponent={<Text style={{ color: '#666', textAlign: 'center', marginTop: 20 }}>No bets placed yet. Get in the action!</Text>}
              renderItem={({ item }) => {
                const isP2P = item.type === 'p2p';
                const isBlind = item.type === 'blind'; // NEW
                let wagerStatus = item.status || 'pending'; 
                let question, pick, odds, wagerAmt, potentialWin, opponentName;
                let isA: boolean = false;
                let oppId: string | null | undefined = null;

                // --- BLIND TICKET LOGIC ---
                if (isBlind) {
                  isA = String(item.side_a_user_id) === String(userId);
                  oppId = isA ? item.side_b_user_id : item.side_a_user_id;

                  if (!item.user_2_id) {
                    opponentName = 'Waiting for challenger...';
                    question = item.question; pick = "Pending Match"; odds = "?"; wagerAmt = item.base_amount; potentialWin = "???";
                  } else {
                    const opponentProfile = standings.find(s => String(s.user_id) === String(oppId));
                    opponentName = opponentProfile?.users?.display_name || 'Unknown Player';
                    question = item.question;
                    pick = isA ? item.side_a_label : item.side_b_label;
                    odds = Number(item.final_multiplier).toFixed(2);
                    wagerAmt = isA ? item.base_amount : Math.floor((item.base_amount * item.final_multiplier) - item.base_amount);
                    potentialWin = Math.floor(item.base_amount * item.final_multiplier);
                  }
                } 
                // --- EXISTING P2P & HOUSE TICKET LOGIC ---
                else if (isP2P) {
                  isA = String(item.side_a_user_id) === String(userId);
                  oppId = isA ? item.side_b_user_id : item.side_a_user_id;
                  if (oppId) {
                    const opponentProfile = standings.find(s => String(s.user_id) === String(oppId));
                    opponentName = opponentProfile?.users?.display_name || 'Unknown Player';
                  } else { opponentName = 'Waiting for opponent...'; }

                  question = item.question;
                  pick = isA ? item.option_a_label : item.option_b_label;
                  odds = isA ? Number(item.multiplier).toFixed(2) : (item.challenger_cost > 0 ? (Number(item.total_pot) / Number(item.challenger_cost)).toFixed(2) : '1.00');
                  wagerAmt = isA ? item.wager_amount : item.challenger_cost;
                  potentialWin = item.total_pot;
                } else {
                  question = item.bets?.question || 'Unknown Bet'; pick = item.bet_options?.label || 'Unknown Pick'; odds = item.bet_options?.multiplier || 1;
                  wagerAmt = item.points_risked || 0; potentialWin = Math.floor(wagerAmt * odds);
                }

                let statusText = '🟡 PENDING'; let statusColor = '#FFD700'; let statusBg = 'rgba(255, 215, 0, 0.2)';
                if (wagerStatus === 'won' || ((isP2P || isBlind) && wagerStatus === 'resolved')) {
                  statusText = '🟢 ' + ((isP2P || isBlind) ? 'RESOLVED' : 'WON'); statusColor = '#00D084'; statusBg = 'rgba(0, 208, 132, 0.2)';
                } else if (wagerStatus === 'lost') {
                  statusText = '🔴 LOST'; statusColor = '#ff4444'; statusBg = 'rgba(255, 68, 68, 0.2)';
                }

                return (
                  <View style={[styles.receiptCard, { borderColor: statusColor, opacity: wagerStatus === 'pending' || wagerStatus === 'open' || wagerStatus === 'locked' || wagerStatus === 'matched' ? 1 : 0.6 }]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                      <View style={{ flex: 1, paddingRight: 10 }}>
                        {isBlind && <Text style={{ color: '#BB86FC', fontSize: 10, fontWeight: 'bold', marginBottom: 4 }}>🤝 BLIND VS. {opponentName?.toUpperCase()}</Text>}
                        {isP2P && <Text style={{ color: '#FFD700', fontSize: 10, fontWeight: 'bold', marginBottom: 4 }}>🥊 P2P VS. {opponentName?.toUpperCase()}</Text>}
                        <Text style={styles.receiptQuestion}>{question}</Text>
                      </View>
                      <View style={[styles.statusBadge, { backgroundColor: statusBg, borderColor: statusColor, borderWidth: 1 }]}>
                        <Text style={[styles.statusText, { color: statusColor }]}>{statusText}</Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.receiptAmount}>Pick: <Text style={styles.receiptPick}>{pick}</Text></Text>
                        <Text style={styles.receiptAmount}>Odds: <Text style={styles.receiptOdds}>{odds}x</Text></Text>
                      </View>
                      <View style={{ flex: 1, alignItems: 'flex-end' }}>
                        <Text style={styles.receiptAmount}>Wager: <Text style={{ color: '#fff', fontWeight: 'bold' }}>{wagerAmt} pts</Text></Text>
                        <Text style={[ statusColor === '#FFD700' ? styles.receiptToWin : (statusColor === '#00D084' ? styles.receiptWon : styles.receiptLost), { marginTop: 4 } ]}>
                          {statusColor === '#00D084' ? `Payout: ${potentialWin} pts` : `Win: ${potentialWin} pts`}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              }}
            />
            <TouchableOpacity style={{ marginTop: 20, alignItems: 'center', padding: 10 }} onPress={() => setMyBetsModalVisible(false)}><Text style={styles.closeSlipText}>Close</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  // --- BASE LAYOUT ---
  container: { flex: 1, backgroundColor: '#121212', padding: 15, paddingTop: 50 },
  headerContainer: { marginBottom: 15 },
  topNavRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  rightNavGroup: { flexDirection: 'row', gap: 10 },
  mainHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  title: { fontSize: 32, fontWeight: 'bold', color: '#fff' },
  subtitle: { fontSize: 16, color: '#00D084', marginTop: 5, fontWeight: '600' },
  balanceText: { fontSize: 16, color: '#a0a0a0', marginTop: 5 },

  // --- NAV PILLS ---
  navPillLeave: { backgroundColor: '#2a2a2a', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: '#444' },
  navPillLeaveText: { color: '#ff4444', fontWeight: 'bold', fontSize: 14 },
  navPillHost: { backgroundColor: 'rgba(255, 215, 0, 0.1)', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: '#FFD700' },
  navPillHostText: { color: '#FFD700', fontWeight: 'bold', fontSize: 14 },
  navPillShare: { backgroundColor: 'rgba(0, 208, 132, 0.1)', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: '#00D084' },
  navPillShareText: { color: '#00D084', fontWeight: 'bold', fontSize: 14 },
  navPillMyBets: { backgroundColor: 'rgba(52, 152, 219, 0.1)', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: '#3498db' },
  navPillMyBetsText: { color: '#3498db', fontWeight: 'bold', fontSize: 14 },
  pitchButton: { backgroundColor: '#00D084', paddingVertical: 12, paddingHorizontal: 15, borderRadius: 8, shadowColor: '#00D084', shadowOpacity: 0.3, shadowRadius: 5, shadowOffset: { width: 0, height: 2 } },
  pitchButtonText: { color: '#000', fontWeight: 'bold', fontSize: 16 }, 

  // --- BET CARDS ---
  betCard: { backgroundColor: '#1e1e1e', borderRadius: 12, padding: 16, marginBottom: 15, borderWidth: 1, borderColor: '#333' },
  betQuestion: { fontSize: 18, color: '#fff', fontWeight: 'bold', marginBottom: 15 },
  optionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  optionButton: { flex: 1, minWidth: '45%', backgroundColor: '#2a2a2a', paddingVertical: 12, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#444' },
  optionLabel: { color: '#fff', fontSize: 14, fontWeight: '600', marginBottom: 4 },
  optionOdds: { color: '#00D084', fontSize: 12, fontWeight: 'bold' },
  lockedWagerCard: { backgroundColor: '#121212', padding: 15, borderRadius: 8, borderWidth: 1, borderColor: '#00D084', alignItems: 'center' },
  lockedText: { color: '#00D084', fontWeight: 'bold', fontSize: 16, marginBottom: 5 },
  lockedDetails: { color: '#a0a0a0', fontSize: 14 },
  statusBadge: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6, height: 22, justifyContent: 'center' },
  statusText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },

  // --- BOTTOM NAV & STANDINGS ---
  bottomNavBar: { flexDirection: 'row', backgroundColor: '#1e1e1e', borderTopWidth: 1, borderTopColor: '#333', marginHorizontal: -15, marginBottom: -15, paddingBottom: Platform.OS === 'ios' ? 25 : 0 },
  bottomNavBtn: { flex: 1, alignItems: 'center', paddingVertical: 15 },
  bottomNavBtnActive: { flex: 1, alignItems: 'center', paddingVertical: 15, backgroundColor: 'rgba(0, 208, 132, 0.05)', borderTopWidth: 3, borderTopColor: '#00D084', marginTop: -1 },
  bottomNavText: { color: '#a0a0a0', fontSize: 12, fontWeight: 'bold', marginTop: 4 },
  bottomNavTextActive: { color: '#00D084', fontSize: 12, fontWeight: 'bold', marginTop: 4 },
  standingsCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1e1e1e', padding: 18, borderRadius: 10, marginBottom: 10, borderWidth: 1, borderColor: '#333' },
  standingsRank: { color: '#00D084', fontSize: 18, fontWeight: 'bold', marginRight: 15 },
  standingsName: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  standingsScore: { color: '#FFD700', fontSize: 18, fontWeight: 'bold' },

  // --- MODALS (COMMON) ---
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  modalOverlayCenter: { flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.8)', padding: 20 },
  centeredModalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0, 0, 0, 0.7)' },
  closeSlipText: { color: '#ff4444', fontSize: 16, fontWeight: 'bold' },
  confirmButton: { backgroundColor: '#00D084', padding: 18, borderRadius: 10, alignItems: 'center' },
  confirmButtonText: { color: '#000', fontSize: 18, fontWeight: 'bold' },

  // --- BET SLIP MODAL (HOUSE BETS) ---
  betSlipContainer: { backgroundColor: '#1e1e1e', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 25 },
  slipHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  slipTitle: { fontSize: 22, fontWeight: 'bold', color: '#fff' },
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

  // --- PITCH/SUGGEST MODAL ---
  gradeModalContent: { backgroundColor: '#1e1e1e', padding: 25, borderRadius: 15 },
  modalTitle: { fontSize: 24, fontWeight: 'bold', color: '#fff', marginBottom: 20, textAlign: 'center' },
  typeSelectorRow: { flexDirection: 'row', marginBottom: 15, backgroundColor: '#121212', borderRadius: 8, padding: 4, borderWidth: 1, borderColor: '#333' },
  typeBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 6 },
  typeBtnActive: { backgroundColor: '#FFD700' },
  typeBtnText: { color: '#a0a0a0', fontWeight: 'bold' },
  typeBtnTextActive: { color: '#000' },
  pitchInput: { backgroundColor: '#121212', color: '#fff', fontSize: 18, borderRadius: 8, padding: 15, borderWidth: 1, borderColor: '#333', marginBottom: 20, minHeight: 100, textAlignVertical: 'top' },
  p2pInput: { backgroundColor: '#121212', borderWidth: 1, borderColor: '#333', borderRadius: 8, color: '#fff', fontSize: 18, paddingHorizontal: 15, height: 50, marginBottom: 10 },
  mathBox: { backgroundColor: 'rgba(0, 208, 132, 0.05)', padding: 15, borderRadius: 8, borderWidth: 1, borderColor: '#00D084', marginVertical: 15 },

  // --- SHARE MODAL ---
  shareModalContainer: { backgroundColor: '#1e1e1e', padding: 25, borderRadius: 15, width: '85%', alignItems: 'center', borderWidth: 1, borderColor: '#333' },
  shareModalTitle: { color: '#fff', fontSize: 24, fontWeight: 'bold', marginBottom: 10 },
  shareModalSub: { color: '#a0a0a0', fontSize: 14, textAlign: 'center', marginBottom: 25 },
  codeDisplayBox: { backgroundColor: '#121212', paddingVertical: 20, paddingHorizontal: 40, borderRadius: 10, borderWidth: 2, borderColor: '#00D084', marginBottom: 25, width: '100%', alignItems: 'center' },
  hugeCodeText: { color: '#00D084', fontSize: 40, fontWeight: 'bold', letterSpacing: 5 },
  copyButton: { backgroundColor: '#00D084', width: '100%', paddingVertical: 15, borderRadius: 10, alignItems: 'center', marginBottom: 15 },
  copyButtonText: { color: '#000', fontSize: 16, fontWeight: 'bold' },
  closeModalBtn: { paddingVertical: 10, width: '100%', alignItems: 'center' },
  closeModalText: { color: '#a0a0a0', fontSize: 16, fontWeight: 'bold' },

  // --- MY BETS / RECEIPTS MODAL ---
  receiptCard: { backgroundColor: '#121212', padding: 15, borderRadius: 10, marginBottom: 15, borderWidth: 1, borderColor: '#333' },
  receiptQuestion: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginBottom: 10 },
  receiptPick: { color: '#FFD700', fontSize: 14, fontWeight: 'bold' },
  receiptAmount: { color: '#a0a0a0', fontSize: 14 },
  receiptOdds: { color: '#a0a0a0', fontSize: 14, fontWeight: 'bold' },
  receiptToWin: { color: '#FFD700', fontSize: 14, fontWeight: 'bold' },
  receiptWon: { color: '#00D084', fontSize: 14, fontWeight: 'bold' },
  receiptLost: { color: '#ff4444', fontSize: 14, fontWeight: 'bold' },

  // --- BLIND MATCH PREVIEW ---
  previewContainer: { backgroundColor: 'rgba(187, 134, 252, 0.05)', padding: 15, borderRadius: 8, borderWidth: 1, borderColor: '#BB86FC', marginVertical: 15 },
  previewTitle: { color: '#BB86FC', fontWeight: 'bold', marginBottom: 10 },
  previewRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  previewText: { color: '#a0a0a0' },
  previewRisk: { color: '#fff', fontWeight: 'bold' },
  disclaimer: { color: '#666', fontSize: 10, fontStyle: 'italic', marginTop: 10, textAlign: 'center' }
});