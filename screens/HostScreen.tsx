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
  
  // --- DUAL INBOX STATES ---
  const [proposals, setProposals] = useState<any[]>([]); 
  const [pendingPitches, setPendingPitches] = useState<any[]>([]); 
  
  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<any[]>([]);
  
  // Grading & Creation States
  const [gradeModalVisible, setGradeModalVisible] = useState(false);
  const [selectedBet, setSelectedBet] = useState<any>(null);
  const [isGrading, setIsGrading] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [activeProposalId, setActiveProposalId] = useState<string | null>(null);
  
  // Bet Type State
  const [betType, setBetType] = useState('prop'); 
  const [newQuestion, setNewQuestion] = useState('');
  const [newOptions, setNewOptions] = useState([
    { id: 1, label: '', odds: '2.0' },
    { id: 2, label: '', odds: '2.0' }
  ]);

  const [p2pOptionA, setP2pOptionA] = useState('Yes');
  const [p2pOptionB, setP2pOptionB] = useState('No');
  const [p2pWager, setP2pWager] = useState('100');
  const [p2pMultiplier, setP2pMultiplier] = useState('2.0');
  const [p2pPercent, setP2pPercent] = useState('50');
  
  // --- BLIND MATCH STATES ---
  const [blindBase, setBlindBase] = useState('100');
  const [blindMultiplier, setBlindMultiplier] = useState('2.0');
  const [blindPercent, setBlindPercent] = useState('50');
  const [blindMatchups, setBlindMatchups] = useState<any[]>([]); // NEW: State for blind matches

  const [pendingHouseBets, setPendingHouseBets] = useState<any[]>([]);
  const [pendingBlindBets, setPendingBlindBets] = useState<any[]>([]);

  // Sync Percent when Multiplier changes
  const updateMultiplier = (val: string) => {
    setBlindMultiplier(val);
    const num = parseFloat(val);
    if (num >= 1) {
      const p = (1 / num) * 100;
      setBlindPercent(p.toFixed(0)); // Round to nearest whole percent
    }
  };

  // Sync Multiplier when Percent changes
  const updatePercent = (val: string) => {
    setBlindPercent(val);
    const num = parseFloat(val);
    if (num > 0 && num <= 100) {
      const m = 100 / num;
      setBlindMultiplier(m.toFixed(2));
    }
  };

  // --- INPUT SANITIZER ---
  const sanitizeNumber = (value: string) => {
    let sanitized = value.replace(/[^0-9.]/g, '');
    if (sanitized.split('.').length > 2) {
      sanitized = sanitized.substring(0, sanitized.length - 1);
    }
    return sanitized;
  };

  const [walletBalance, setWalletBalance] = useState(0);

  useEffect(() => {
    fetchHostData();

    const proposalSub = supabase.channel('public:guest_proposals')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'guest_proposals' }, () => fetchHostData()).subscribe();

    const pitchSub = supabase.channel('public:p2p_prop_bets')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'p2p_prop_bets' }, () => fetchHostData()).subscribe();

    const blindSub = supabase.channel('public:blind_matchups_host')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'blind_matchups' }, () => fetchHostData()).subscribe();
    
      const betsSub = supabase.channel('public:bets_host')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bets' }, () => fetchHostData()).subscribe();

    return () => { 
      supabase.removeChannel(proposalSub); 
      supabase.removeChannel(pitchSub);
      supabase.removeChannel(blindSub);
      supabase.removeChannel(betsSub);
    };
  }, []);

  async function fetchHostData() {
    setLoading(true);
    try {
      const myUserId = await AsyncStorage.getItem('userId');
      setCurrentUserId(myUserId);
      const campaignId = await AsyncStorage.getItem('campaignId');
      setActiveCampaignId(campaignId); 
      
      const { data: participantData } = await supabase
        .from('campaign_participants')
        .select('global_point_balance')
        .eq('campaign_id', campaignId) 
        .eq('user_id', myUserId)
        .single();

      if (participantData) {
        setWalletBalance(participantData.global_point_balance);
      }
      
      const { data: eventData } = await supabase
        .from('events').select('id').eq('campaign_id', campaignId).eq('status', 'live').single();

      if (!eventData) return;
      setActiveEventId(eventData.id);

      // 1. Participants
      const { data: pData } = await supabase.from('campaign_participants').select('user_id, role, users(display_name)').eq('campaign_id', campaignId);
      setParticipants(pData ?? []);

      // 2. Fetch Regular House Bets (Active)
      const { data: betsData } = await supabase.from('bets').select(`id, question, status, bet_options!bet_options_bet_id_fkey ( id, label )`).eq('event_id', eventData.id).in('status', ['open', 'locked', 'graded']);

      // 3. Fetch Approved P2P Bets (Active)
      const { data: approvedP2P } = await supabase.from('p2p_prop_bets').select('*, users!p2p_prop_bets_proposer_id_fkey(display_name)').eq('campaign_id', campaignId).in('status', ['open', 'locked']);

      // 4. Fetch Blind Matchups (Active)
      const { data: blindData } = await supabase.from('blind_matchups').select('*').eq('campaign_id', campaignId).in('status', ['open', 'matched']);

      const safeBets = betsData ?? [];
      const safeP2P = (approvedP2P ?? []).map(p => ({ ...p, isP2P: true }));
      const safeBlind = (blindData ?? []).map(b => ({ ...b, isBlind: true }));
      setBets([...safeBlind, ...safeP2P, ...safeBets]);

      // 5. Fetch Inbox 1: Ideas
      const { data: propsData } = await supabase.from('guest_proposals').select('id, suggestion, users(display_name)').eq('event_id', eventData.id).eq('status', 'pending');
      setProposals(propsData ?? []);

      // 6. Fetch Inbox 2: Challenges
      const { data: pitchesData } = await supabase.from('p2p_prop_bets').select(`*, users!p2p_prop_bets_proposer_id_fkey ( display_name )`).eq('campaign_id', campaignId).eq('status', 'pending_approval');
      setPendingPitches(pitchesData ?? []);

      // --- 🚨 THE FIX: INBOX 3 (HOUSE BETS) ---
      // Adding explicit error logging to catch silent failures
      const { data: houseBetsData, error: houseError } = await supabase
        .from('bets')
        // 🚨 Add the users fetch to the select statement!
        .select('*, bet_options!bet_options_bet_id_fkey(*), users!creator_id(display_name)') 
        .eq('event_id', eventData.id)
        .eq('status', 'pending');

      if (houseError) console.error("House Bet Fetch Error:", houseError);
      setPendingHouseBets(houseBetsData ?? []);

      // --- 🚨 THE FIX: INBOX 4 (BLIND MATCHUPS) ---
      const { data: pendingBlindData, error: blindError } = await supabase
        .from('blind_matchups')
        .select('*, users!user_1_id(display_name)') 
        .eq('campaign_id', campaignId)
        .eq('status', 'pending_approval');

      // No fallback this time! We want to see if it actually succeeds.
      setPendingBlindBets(pendingBlindData ?? []);

    } catch (error: any) {
      console.error("Master Fetch Error:", error);
      if (Platform.OS !== 'web') Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  }
  
  // --- IDEA ACTIONS (INBOX 1) ---
  function convertProposalToBet(proposal: any) {
    setNewQuestion(proposal.suggestion);
    setActiveProposalId(proposal.id); 
    setCreateModalVisible(true);
  }

  async function rejectProposal(id: string) {
    await supabase.from('guest_proposals').update({ status: 'rejected' }).eq('id', id);
    fetchHostData();
  }

  // --- CHALLENGE ACTIONS (INBOX 2) ---
  async function handleApprovePitch(pitchId: string) {
    try {
      const { error } = await supabase.from('p2p_prop_bets').update({ status: 'open' }).eq('id', pitchId);
      if (error) throw error;
      Alert.alert('Approved!', 'The challenge is now live on the board.');
      fetchHostData(); 
    } catch (error: any) { Alert.alert('Error approving pitch', error.message); }
  }

  async function handleRejectPitch(pitchId: string) {
    try {
      const { error } = await supabase.from('p2p_prop_bets').delete().eq('id', pitchId);
      if (error) throw error;
      fetchHostData();
    } catch (error: any) { Alert.alert('Error rejecting pitch', error.message); }
  }

  async function handleApproveHouseBet(betId: string) {
    await supabase.from('bets').update({ status: 'open' }).eq('id', betId);
    fetchHostData(); // Call your fetch function to refresh the screen
  }

  async function handleRejectHouseBet(betId: string) {
    await supabase.from('bets').delete().eq('id', betId); // Trash it completely
    fetchHostData();
  }

  async function handleApproveBlindBet(blindId: string) {
    await supabase.from('blind_matchups').update({ status: 'open' }).eq('id', blindId);
    fetchHostData();
  }

  async function handleRejectBlindBet(blindId: string) {
    await supabase.from('blind_matchups').delete().eq('id', blindId);
    fetchHostData();
  }

  const updateP2PMultiplier = (val: string) => {
    const sanitized = sanitizeNumber(val);
    setP2pMultiplier(sanitized);
    const num = parseFloat(sanitized);
    if (num >= 1) setP2pPercent(((1 / num) * 100).toFixed(0));
  };

  const updateP2PPercent = (val: string) => {
    const sanitized = sanitizeNumber(val);
    setP2pPercent(sanitized);
    const num = parseFloat(sanitized);
    if (num > 0 && num <= 100) setP2pMultiplier((100 / num).toFixed(2));
  };

  // --- BET CREATION LOGIC ---
  function handleToggleBetType(type: string) {
    setBetType(type);
    if (type === 'over_under') {
      setNewOptions([{ id: 1, label: 'Over', odds: '2.0' }, { id: 2, label: 'Under', odds: '2.0' }]);
    } else if (type === 'prop') {
      setNewOptions([{ id: 1, label: '', odds: '2.0' }, { id: 2, label: '', odds: '2.0' }]);
    } else if (type === 'blind') {
      setNewQuestion(''); setP2pOptionA('Yes'); setP2pOptionB('No'); setBlindBase('100'); setBlindMultiplier('2.0');
    }
  }

  function handleAddOption() {
    if (betType === 'over_under') return; 
    setNewOptions([...newOptions, { id: Date.now(), label: '', odds: '1.0' }]);
  }

  function updateOption(id: number, field: string, value: string) {
    setNewOptions(newOptions.map(opt => opt.id === id ? { ...opt, [field]: value } : opt));
  }

  async function handlePublishBet() {
    // --- BLIND MATCH PUBLISH LOGIC ---
    if (betType === 'blind') {
      if (!newQuestion.trim() || !p2pOptionA.trim() || !p2pOptionB.trim()) {
        const msg = 'Fill out all fields.';
        return Platform.OS === 'web' ? window.alert(`Hold up\n\n${msg}`) : Alert.alert('Hold up', msg);
      }
      
      const baseAmt = parseInt(blindBase);
      const multiAmt = parseFloat(blindMultiplier);
      if (isNaN(baseAmt) || baseAmt <= 0) {
        const msg = 'Base Amount must be > 0';
        return Platform.OS === 'web' ? window.alert(`Invalid\n\n${msg}`) : Alert.alert('Invalid', msg);
      }
      if (isNaN(multiAmt) || multiAmt <= 1) {
        const msg = 'Multiplier must be greater than 1.0x';
        return Platform.OS === 'web' ? window.alert(`Invalid\n\n${msg}`) : Alert.alert('Invalid', msg);
      }

      setIsCreating(true);
      try {
        const { error } = await supabase.from('blind_matchups').insert([{
          campaign_id: activeCampaignId,
          event_id: activeEventId,
          question: newQuestion,
          side_a_label: p2pOptionA,
          side_b_label: p2pOptionB,
          base_amount: baseAmt,
          user_1_id: currentUserId,
          user_1_bid_multiplier: multiAmt,
          status: 'open'
        }]);

        if (error) throw error;
        
        setNewQuestion(''); setP2pOptionA('Yes'); setP2pOptionB('No'); setBlindBase('100'); setBlindMultiplier('2.0');
        setCreateModalVisible(false);
        fetchHostData(); 
      } catch (error: any) { 
        Platform.OS === 'web' ? window.alert(`Error\n\n${error.message}`) : Alert.alert('Error', error.message); 
      } finally { setIsCreating(false); }
      return;
    }

    // --- P2P PUBLISH LOGIC ---
    if (betType === 'p2p') {
      if (!newQuestion.trim() || !p2pOptionA.trim() || !p2pOptionB.trim()) {
        const msg = 'Fill out all fields.';
        return Platform.OS === 'web' ? window.alert(`Hold up\n\n${msg}`) : Alert.alert('Hold up', msg);
      }
      
      const wagerAmt = parseFloat(p2pWager);
      const multiAmt = parseFloat(p2pMultiplier);
      if (isNaN(wagerAmt) || wagerAmt <= 0) {
        const msg = 'Wager must be > 0';
        return Platform.OS === 'web' ? window.alert(`Invalid\n\n${msg}`) : Alert.alert('Invalid', msg);
      }
      // 🚨 FIX: Changed from <= 0 to <= 1
      if (isNaN(multiAmt) || multiAmt <= 1) {
        const msg = 'Multiplier must be greater than 1.0x';
        return Platform.OS === 'web' ? window.alert(`Invalid\n\n${msg}`) : Alert.alert('Invalid', msg);
      }

      setIsCreating(true);
      try {
        const { error } = await supabase.from('p2p_prop_bets').insert([{
          campaign_id: activeCampaignId,
          proposer_id: currentUserId,
          question: newQuestion,
          option_a_label: p2pOptionA,
          option_b_label: p2pOptionB,
          wager_amount: wagerAmt,
          multiplier: multiAmt,
          status: 'open' 
        }]);

        if (error) throw error;
        
        setNewQuestion(''); setP2pOptionA('Yes'); setP2pOptionB('No'); setP2pWager('100'); setP2pMultiplier('2.0');
        setCreateModalVisible(false);
        fetchHostData();
      } catch (error: any) { 
        Platform.OS === 'web' ? window.alert(`Error\n\n${error.message}`) : Alert.alert('Error', error.message); 
      } finally { setIsCreating(false); }
      return;
    }

    // --- STANDARD HOUSE BET PUBLISH LOGIC ---
    if (!newQuestion.trim()) {
      const msg = 'You need a question!';
      return Platform.OS === 'web' ? window.alert(`Hold up\n\n${msg}`) : Alert.alert('Hold up', msg);
    }
    const validOptions = newOptions.filter(opt => opt.label.trim() !== '');
    if (validOptions.length < 2) {
      const msg = 'You need at least two options.';
      return Platform.OS === 'web' ? window.alert(`Hold up\n\n${msg}`) : Alert.alert('Hold up', msg);
    }

    // 🚨 FIX: Added the odds validation loop for Host Prop/OU bets!
    for (const opt of validOptions) {
      const oddsValue = parseFloat(opt.odds);
      if (isNaN(oddsValue) || oddsValue <= 1) {
        setIsCreating(false);
        const msg = `Please enter valid odds (greater than 1.0) for "${opt.label}".`;
        return Platform.OS === 'web' ? window.alert(`Invalid Odds\n\n${msg}`) : Alert.alert('Invalid Odds', msg);
      }
    }

    setIsCreating(true);
    try {
      const { data: betData, error: betError } = await supabase
        .from('bets')
        .insert([{ 
          event_id: activeEventId, 
          type: betType, 
          question: newQuestion, 
          status: 'open',
          creator_id: currentUserId 
        }])
        .select().single();

      if (betError) throw betError;

      const optionsToInsert = validOptions.map(opt => ({
        bet_id: betData.id, label: opt.label, multiplier: parseFloat(opt.odds) || 1.0
      }));

      await supabase.from('bet_options').insert(optionsToInsert);

      if (activeProposalId) {
        await supabase.from('guest_proposals').update({ status: 'approved' }).eq('id', activeProposalId);
      }

      setNewQuestion(''); setActiveProposalId(null); handleToggleBetType('prop'); 
      setCreateModalVisible(false); fetchHostData(); 
    } catch (error: any) { 
      Platform.OS === 'web' ? window.alert(`Error\n\n${error.message}`) : Alert.alert('Error', error.message); 
    } finally { setIsCreating(false); }
  }

  // ==========================================
  // --- BET MANAGEMENT ACTIONS ---
  // ==========================================
  function openGradeModal(bet: any) { 
    if (bet.isP2P && (!bet.side_a_user_id || !bet.side_b_user_id)) {
      const msg = 'Both sides of this Prop Challenge must be claimed before it can be graded.\n\nYou can Re-Open it to allow claims, or Trash it to refund the lone player.';
      if (Platform.OS === 'web') return window.alert(`Cannot Grade\n\n${msg}`);
      return Alert.alert('Cannot Grade', msg);
    }

    if (bet.isBlind && bet.status === 'open') {
      const msg = 'You cannot grade a Blind Match until a challenger accepts the bid.';
      if (Platform.OS === 'web') return window.alert(`Cannot Grade\n\n${msg}`);
      return Alert.alert('Cannot Grade', msg);
    }

    setSelectedBet(bet); 
    setGradeModalVisible(true); 
  }
  
  async function toggleBetStatus(betId: string, newStatus: string) {
    const targetBet = bets.find(b => b.id === betId);

    try {
      if (targetBet?.isP2P && newStatus === 'open') {
        const { error } = await supabase.rpc('reset_p2p_bet', { p_bet_id: betId });
        if (error) throw error;
      } else {
        const table = targetBet?.isP2P ? 'p2p_prop_bets' : targetBet?.isBlind ? 'blind_matchups' : 'bets';
        await supabase.from(table).update({ status: newStatus }).eq('id', betId);
      }
      fetchHostData(); 
    } catch (error: any) { 
      Platform.OS === 'web' ? window.alert(error.message) : Alert.alert('Error', error.message); 
    }
  }

  async function handleDeleteBet(betId: string) {
    const targetBet = bets.find(b => b.id === betId);
    const title = 'Trash & Refund Bet?';
    const msg = 'Permanently delete and refund points?';

    const executeDelete = async () => {
      try {
        if (targetBet?.isP2P) {
          const { error } = await supabase.rpc('delete_p2p_bet_and_refund', { p_bet_id: betId });
          if (error) throw error;
        } else if (targetBet?.isBlind) {
          const { error } = await supabase.rpc('delete_blind_match_and_refund', { p_matchup_id: betId });
          if (error) throw error;
        } else {
          const { error } = await supabase.rpc('delete_bet_and_refund', { target_bet_id: betId });
          if (error) throw error;
        }
        fetchHostData(); 
      } catch (error: any) { 
        Platform.OS === 'web' ? window.alert(error.message) : Alert.alert('Error', error.message); 
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`${title}\n\n${msg}`)) executeDelete();
    } else {
      Alert.alert(title, msg, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete & Refund', style: 'destructive', onPress: executeDelete }
      ]);
    }
  }

  async function handleReverseGrading(betId: string) {
    const title = 'Reverse Grading?';
    const msg = 'Claw back payouts and unlock bet.';

    const executeReverse = async () => {
      try {
        await supabase.rpc('undo_resolve_bet', { target_bet_id: betId });
        fetchHostData();
      } catch (error: any) { 
        Platform.OS === 'web' ? window.alert(error.message) : Alert.alert('Error', error.message); 
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`${title}\n\n${msg}`)) executeReverse();
    } else {
      Alert.alert(title, msg, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reverse', style: 'destructive', onPress: executeReverse }
      ]);
    }
  }
  async function handleGradeBet(winningOptionId: string) {
    setIsGrading(true);
    try {
      // --- NEW: BLIND GRADING EXECUTION ---
      if (selectedBet.isBlind) {
        const winnerSide = winningOptionId === 'A' ? 'A' : 'B';
        const { error } = await supabase.rpc('grade_blind_match', { 
          p_matchup_id: selectedBet.id, 
          p_winning_side: winnerSide 
        });
        if (error) throw error;
      } 
      // --- EXISTING P2P & HOUSE GRADING ---
      else if (selectedBet.isP2P) {
        const winnerSide = winningOptionId === 'A' ? 'A' : 'B';
        const { error } = await supabase.rpc('resolve_p2p_bet', { 
          p_bet_id: selectedBet.id, 
          p_winner_side: winnerSide 
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.rpc('resolve_bet', { 
          target_bet_id: selectedBet.id, 
          winning_opt_id: winningOptionId 
        });
        if (error) throw error;
      }

      setGradeModalVisible(false); 
      fetchHostData(); 
      Alert.alert('Success', 'Bet resolved and points distributed.');
    } catch (error: any) { 
      Alert.alert('Error', error.message || 'Failed to grade bet.'); 
    } finally { 
      setIsGrading(false); 
    }
  }
  // --- MANAGE CREW LOGIC ---
  async function handleElevateHost(targetUserId: string, targetName: string) {
    const title = 'Elevate to Co-Host?';
    const msg = `Make ${targetName} a Co-Host?`;

    const executeElevate = async () => {
      try {
        const { error } = await supabase.rpc('update_participant_role', { 
          p_campaign_id: activeCampaignId, 
          p_target_user_id: targetUserId, 
          p_new_role: 'host' 
        });
        if (error) throw error;
        fetchHostData();
      } catch (error: any) { 
        Platform.OS === 'web' ? window.alert(error.message) : Alert.alert('Error', error.message); 
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`${title}\n\n${msg}`)) executeElevate();
    } else {
      Alert.alert(title, msg, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Make Host', style: 'destructive', onPress: executeElevate }
      ]);
    }
  }

  async function handleRevokeHost(targetUserId: string, targetName: string) {
    const title = 'Revoke Co-Host?';
    const msg = `Remove ${targetName}'s host powers?`;

    const executeRevoke = async () => {
      try {
        const { error } = await supabase.rpc('update_participant_role', { 
          p_campaign_id: activeCampaignId, 
          p_target_user_id: targetUserId, 
          p_new_role: 'guest' 
        });
        if (error) throw error;
        fetchHostData();
      } catch (error: any) { 
        Platform.OS === 'web' ? window.alert(error.message) : Alert.alert('Error', error.message); 
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`${title}\n\n${msg}`)) executeRevoke();
    } else {
      Alert.alert(title, msg, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Revoke', style: 'destructive', onPress: executeRevoke }
      ]);
    }
  }

  async function handleCloseBoard() {
    const title = 'Close Board Forever?';
    const msg = 'End game and lock the board. Any ungraded bets (Prop or House) will be fully refunded.';

    if (Platform.OS === 'web') {
      if (window.confirm(`${title}\n\n${msg}`)) executeClose();
    } else {
      Alert.alert(title, msg, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'End Event', style: 'destructive', onPress: executeClose }
      ]);
    }
  }

  async function executeClose() {
    try {
      const { error } = await supabase.rpc('close_board_and_refund', { 
        p_campaign_id: activeCampaignId 
      });
      if (error) throw error;
      navigation.reset({ index: 0, routes: [{ name: 'FinalResults' }] });
    } catch (error: any) { 
      Platform.OS === 'web' ? window.alert(error.message) : Alert.alert('Error', error.message); 
    }
  }

  if (loading) return <View style={styles.container}><ActivityIndicator size="large" color="#FFD700" /></View>;

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

      <FlatList
        data={bets}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 50 }}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
            {/* --- INBOX 1: IDEAS --- */}
            {proposals?.length > 0 && (
              <View style={styles.inboxContainer}>
                <Text style={styles.inboxTitle}>💡 Guest Ideas ({proposals.length})</Text>
                {proposals?.map(prop => (
                  <View key={prop.id} style={styles.ideaCard}>
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

            {/* --- INBOX 2: P2P CHALLENGES --- */}
            {pendingPitches?.length > 0 && (
              <View style={styles.queueContainer}>
                <Text style={styles.inboxTitle}>🥊 Pending Challenges ({pendingPitches.length})</Text>
                {pendingPitches?.map((pitch) => (
                  <View key={pitch.id} style={styles.pitchCard}>
                    <Text style={styles.pitchProposer}>Proposed by: {pitch.users?.display_name || 'Guest'}</Text>
                    <Text style={styles.pitchQuestion}>{pitch.question}</Text>
                    
                    <View style={styles.pitchMathBox}>
                      <Text style={styles.pitchMathText}>Side A (<Text style={{color: '#fff'}}>{pitch.option_a_label}</Text>): Risks {pitch.wager_amount} pts @ {pitch.multiplier}x</Text>
                      <Text style={styles.pitchMathText}>Side B (<Text style={{color: '#fff'}}>{pitch.option_b_label}</Text>): Must Risk {pitch.challenger_cost} pts</Text>
                      <Text style={styles.pitchPotText}>Total Pot: {pitch.total_pot} pts</Text>
                    </View>

                    <View style={styles.pitchActionRow}>
                      <TouchableOpacity style={[styles.pitchBtn, { backgroundColor: 'rgba(255, 68, 68, 0.2)', borderColor: '#ff4444' }]} onPress={() => handleRejectPitch(pitch.id)}>
                        <Text style={[styles.pitchBtnText, { color: '#ff4444' }]}>Trash</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.pitchBtn, { backgroundColor: 'rgba(0, 208, 132, 0.2)', borderColor: '#00D084' }]} onPress={() => handleApprovePitch(pitch.id)}>
                        <Text style={[styles.pitchBtnText, { color: '#00D084' }]}>Approve to Board</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}
            {/* --- INBOX 3: HOUSE BETS (PROPS & O/U) --- */}
            {pendingHouseBets?.length > 0 && (
              <View style={styles.queueContainer}>
                <Text style={styles.inboxTitle}>🏠 Pending House Bets ({pendingHouseBets.length})</Text>
                {pendingHouseBets?.map((bet) => (
                  <View key={bet.id} style={styles.pitchCard}>
                    {/* 🚨 Swap the hardcoded text for the dynamic user name! */}
                    <Text style={styles.pitchProposer}>Proposed by: {bet.users?.display_name || 'Guest'}</Text>
                    <Text style={styles.pitchQuestion}>{bet.question}</Text>
                    
                    <View style={styles.pitchMathBox}>
                      <Text style={styles.pitchMathText}>Type: <Text style={{color: '#fff', fontWeight: 'bold'}}>{bet.type === 'over_under' ? 'Over/Under' : 'Prop Bet'}</Text></Text>
                      {bet.bet_options?.map((opt: any) => (
                        <Text key={opt.id} style={styles.pitchMathText}>• {opt.label} @ {opt.multiplier}x</Text>
                      ))}
                    </View>

                    <View style={styles.pitchActionRow}>
                      <TouchableOpacity style={[styles.pitchBtn, { backgroundColor: 'rgba(255, 68, 68, 0.2)', borderColor: '#ff4444' }]} onPress={() => handleRejectHouseBet(bet.id)}>
                        <Text style={[styles.pitchBtnText, { color: '#ff4444' }]}>Trash</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.pitchBtn, { backgroundColor: 'rgba(0, 208, 132, 0.2)', borderColor: '#00D084' }]} onPress={() => handleApproveHouseBet(bet.id)}>
                        <Text style={[styles.pitchBtnText, { color: '#00D084' }]}>Approve to Board</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* --- INBOX 4: BLIND MATCHUPS --- */}
            {pendingBlindBets?.length > 0 && (
              <View style={styles.queueContainer}>
                <Text style={styles.inboxTitle}>🤝 Pending Blind Matchups ({pendingBlindBets.length})</Text>
                {pendingBlindBets?.map((blind) => (
                  <View key={blind.id} style={styles.pitchCard}>
                    <Text style={styles.pitchProposer}>Proposed by: {blind.users?.display_name || 'Guest'}</Text>
                    <Text style={styles.pitchQuestion}>{blind.question}</Text>
                    
                    <View style={styles.pitchMathBox}>
                      <Text style={styles.pitchMathText}>Side A: <Text style={{color: '#fff'}}>{blind.side_a_label}</Text></Text>
                      <Text style={styles.pitchMathText}>Side B: <Text style={{color: '#fff'}}>{blind.side_b_label}</Text></Text>
                      <Text style={styles.pitchPotText}>Base Unit: {blind.base_amount} pts | Bid: {blind.user_1_bid_multiplier}x</Text>
                    </View>

                    <View style={styles.pitchActionRow}>
                      <TouchableOpacity style={[styles.pitchBtn, { backgroundColor: 'rgba(255, 68, 68, 0.2)', borderColor: '#ff4444' }]} onPress={() => handleRejectBlindBet(blind.id)}>
                        <Text style={[styles.pitchBtnText, { color: '#ff4444' }]}>Trash</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.pitchBtn, { backgroundColor: 'rgba(0, 208, 132, 0.2)', borderColor: '#00D084' }]} onPress={() => handleApproveBlindBet(blind.id)}>
                        <Text style={[styles.pitchBtnText, { color: '#00D084' }]}>Approve to Board</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}
            
            <Text style={styles.sectionHeader}>Active Action (Needs Grading)</Text>
          </View>
        }
        ListEmptyComponent={<Text style={styles.emptyText}>No open bets right now.</Text>}
        renderItem={({ item }: { item: any }) => (
          <View style={[styles.betCard, item.status === 'graded' && { opacity: 0.6, borderColor: '#666' }]}>
            
            {/* Header & Status */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 }}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                {item.isBlind && <Text style={{ color: '#BB86FC', fontSize: 10, fontWeight: 'bold', marginBottom: 4 }}>🤝 BLIND MATCH</Text>}
                {item.isP2P && <Text style={{ color: '#FFD700', fontSize: 10, fontWeight: 'bold', marginBottom: 4 }}>🥊 P2P PROP</Text>}
                <Text style={styles.betQuestion}>{item.question}</Text>
              </View>
              <Text style={{ 
                color: item.status === 'open' ? '#00D084' : (item.status === 'locked' || item.status === 'matched') ? '#FFD700' : '#ff4444', 
                fontWeight: 'bold', fontSize: 12 
              }}>
                {item.status.toUpperCase()}
              </Text>
            </View>
            
            {/* Buttons */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 }}>
              
              {item.status === 'open' && !item.isBlind && (
                <TouchableOpacity style={styles.actionBtn} onPress={() => toggleBetStatus(item.id, 'locked')}>
                  <Text style={styles.actionBtnText}>🔒 Lock Betting</Text>
                </TouchableOpacity>
              )}

              {(item.status === 'locked' || item.status === 'matched') && (
                <>
                  {!item.isBlind && (
                    <TouchableOpacity style={styles.actionBtnSecondary} onPress={() => toggleBetStatus(item.id, 'open')}>
                      <Text style={styles.actionBtnTextSecondary}>🔓 Re-Open</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={styles.actionBtn} onPress={() => openGradeModal(item)}>
                    <Text style={styles.actionBtnText}>✅ Grade</Text>
                  </TouchableOpacity>
                </>
              )}

              {item.status === 'graded' && !item.isBlind && (
                <TouchableOpacity style={styles.actionBtnDanger} onPress={() => handleReverseGrading(item.id)}>
                  <Text style={styles.actionBtnTextDanger}>↩️ Reverse</Text>
                </TouchableOpacity>
              )}

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
      <Modal visible={createModalVisible} transparent={true} animationType="slide" statusBarTranslucent={true}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Push Live Bet</Text>
              <TouchableOpacity onPress={() => setCreateModalVisible(false)}><Text style={styles.closeText}>Cancel</Text></TouchableOpacity>
            </View>

            <View style={styles.typeSelectorRow}>
              <TouchableOpacity style={[styles.typeBtn, betType === 'prop' && styles.typeBtnActive]} onPress={() => handleToggleBetType('prop')}>
                <Text style={[styles.typeBtnText, betType === 'prop' && styles.typeBtnTextActive]}>Props</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.typeBtn, betType === 'over_under' && styles.typeBtnActive]} onPress={() => handleToggleBetType('over_under')}>
                <Text style={[styles.typeBtnText, betType === 'over_under' && styles.typeBtnTextActive]}>O/U</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.typeBtn, betType === 'p2p' && styles.typeBtnActive]} onPress={() => handleToggleBetType('p2p')}>
                <Text style={[styles.typeBtnText, betType === 'p2p' && styles.typeBtnTextActive]}>P2P</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.typeBtn, betType === 'blind' && { backgroundColor: '#BB86FC' }]} onPress={() => handleToggleBetType('blind')}>
                <Text style={[styles.typeBtnText, betType === 'blind' && { color: '#000', fontWeight: 'bold' }]}>Blind</Text>
              </TouchableOpacity>
            </View>
            
            <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false}>
              {betType === 'blind' ? (
                // --- BLIND MATCH UI ---
                <>
                  <Text style={{ color: '#BB86FC', fontSize: 14, fontWeight: 'bold', marginBottom: 5 }}>The Scenario</Text>
                  <TextInput style={styles.input} placeholder="e.g., PRX vs NRG" placeholderTextColor="#666" value={newQuestion} onChangeText={setNewQuestion} />

                  <View style={{ flexDirection: 'row', gap: 10, marginBottom: 5 }}>
                    <View style={{ flex: 1 }}><Text style={styles.label}>Team A</Text><TextInput style={styles.input} value={p2pOptionA} onChangeText={setP2pOptionA} placeholder="PRX" placeholderTextColor="#666" /></View>
                    <View style={{ flex: 1 }}><Text style={styles.label}>Team B</Text><TextInput style={styles.input} value={p2pOptionB} onChangeText={setP2pOptionB} placeholder="NRG" placeholderTextColor="#666" /></View>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 10, marginBottom: 5 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: '#BB86FC', fontSize: 14, fontWeight: 'bold', marginBottom: 5 }}>Base Unit</Text>
                      <TextInput style={styles.input} keyboardType="numeric" value={blindBase} onChangeText={setBlindBase} placeholder="100" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: '#BB86FC', fontSize: 14, fontWeight: 'bold', marginBottom: 5 }}>Odds (x)</Text>
                      <TextInput 
                        style={styles.input}
                        keyboardType="decimal-pad"
                        value={blindMultiplier}
                        onChangeText={updateMultiplier}
                      />
                    </View>
                    
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: '#BB86FC', fontSize: 14, fontWeight: 'bold', marginBottom: 5 }}>Win (%)</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <TextInput 
                          style={[styles.input, { flex: 1 }]}
                          keyboardType="number-pad"
                          value={blindPercent}
                          onChangeText={updatePercent}
                        />
                        <Text style={{ color: '#fff', marginLeft: -30, marginRight: 15, fontWeight: 'bold' }}>%</Text>
                      </View>
                    </View>
                  </View>
                  

                  {(() => {
                    const base = parseFloat(blindBase) || 0;
                    const multi = parseFloat(blindMultiplier) || 0;
                    const riskA = Math.trunc(base);
                    const riskB = Math.trunc((base * multi) - base);
                    const maxRisk = Math.max(riskA, riskB);
                    
                    const currentBalance = walletBalance || 0;
                    const isOverleveraged = maxRisk > currentBalance;
                    const pot = Math.trunc(base * multi);

                    return (
                      <View style={[styles.mathBox, { borderColor: isOverleveraged ? '#ff4444' : '#BB86FC', backgroundColor: isOverleveraged ? 'rgba(255, 68, 68, 0.05)' : 'rgba(187, 134, 252, 0.05)' }]}>
                        <Text style={{ color: isOverleveraged ? '#ff4444' : '#BB86FC', fontSize: 15, fontWeight: 'bold', marginBottom: 8, textAlign: 'center' }}>
                          {isOverleveraged ? '⚠️ INSUFFICIENT BALANCE' : 'How Your Bid Shapes the Market'}
                        </Text>
                        
                        <Text style={{ color: '#a0a0a0', fontSize: 12, marginBottom: 15, lineHeight: 18, textAlign: 'center' }}>
                          You are establishing the baseline odds at <Text style={{color: '#fff', fontWeight: 'bold'}}>{blindMultiplier || '0'}x</Text>. Assuming the final averaged odds land near your bid, here is the breakdown:
                        </Text>

                        {/* --- SCENARIO A: HOST GETS THE FAVORITE --- */}
                        <View style={{ borderLeftWidth: 3, borderLeftColor: '#00D084', paddingLeft: 12, marginBottom: 20 }}>
                          <Text style={{ color: '#00D084', fontWeight: 'bold', fontSize: 14, marginBottom: 6 }}>Scenario A: You secure {p2pOptionA || 'Team A'}</Text>
                          <Text style={{ color: '#a0a0a0', fontSize: 13, marginBottom: 3 }}>
                            • You Risk: <Text style={{color: (isOverleveraged && riskA > currentBalance) ? '#ff4444' : '#fff', fontWeight: 'bold'}}>{riskA} pts</Text>
                          </Text>
                          <Text style={{ color: '#a0a0a0', fontSize: 13, marginBottom: 3 }}>
                            • Challenger Risks: <Text style={{color: '#fff', fontWeight: 'bold'}}>{riskB} pts</Text>
                          </Text>
                          <Text style={{ color: '#FFD700', fontSize: 13, fontWeight: 'bold', marginTop: 4 }}>• Total Payout: {pot} pts</Text>
                        </View>

                        {/* --- SCENARIO B: HOST GETS THE UNDERDOG --- */}
                        <View style={{ borderLeftWidth: 3, borderLeftColor: '#ff4444', paddingLeft: 12 }}>
                          <Text style={{ color: '#ff4444', fontWeight: 'bold', fontSize: 14, marginBottom: 6 }}>Scenario B: You are pushed to {p2pOptionB || 'Team B'}</Text>
                          <Text style={{ color: '#a0a0a0', fontSize: 13, marginBottom: 3 }}>
                            • You Risk: <Text style={{color: (isOverleveraged && riskB > currentBalance) ? '#ff4444' : '#fff', fontWeight: 'bold'}}>{riskB} pts</Text>
                          </Text>
                          <Text style={{ color: '#a0a0a0', fontSize: 13, marginBottom: 3 }}>
                            • Challenger Risks: <Text style={{color: '#fff', fontWeight: 'bold'}}>{riskA} pts</Text>
                          </Text>
                          <Text style={{ color: '#FFD700', fontSize: 13, fontWeight: 'bold', marginTop: 4 }}>• Total Payout: {pot} pts</Text>
                        </View>

                        {isOverleveraged ? (
                          <Text style={{ color: '#ff4444', fontSize: 12, marginTop: 15, textAlign: 'center', fontWeight: 'bold' }}>
                            You need {maxRisk - currentBalance} more points to cover the worst-case scenario.
                          </Text>
                        ) : (
                          <Text style={{ color: '#666', fontSize: 11, fontStyle: 'italic', marginTop: 15, textAlign: 'center' }}>
                            *Remember: The final payout and underdog risk will shift slightly because the final odds are the average of your bid and the challenger's bid.
                          </Text>
                        )}
                      </View>
                    );
                  })()}
                </>
              ) : betType === 'p2p' ? (
                // --- P2P CHALLENGE UI ---
                <>
                  <Text style={styles.label}>The Scenario</Text>
                  <TextInput style={styles.input} placeholder="e.g., Will Chris spill his drink?" placeholderTextColor="#666" value={newQuestion} onChangeText={setNewQuestion} />

                  <View style={{ flexDirection: 'row', gap: 10, marginBottom: 5 }}>
                    <View style={{ flex: 1 }}><Text style={styles.label}>Option A</Text><TextInput style={styles.input} value={p2pOptionA} onChangeText={setP2pOptionA} placeholder="Yes" placeholderTextColor="#666" /></View>
                    <View style={{ flex: 1 }}><Text style={styles.label}>Option B</Text><TextInput style={styles.input} value={p2pOptionB} onChangeText={setP2pOptionB} placeholder="No" placeholderTextColor="#666" /></View>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 10, marginBottom: 5 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.label}>Risk</Text>
                      <TextInput style={styles.input} keyboardType="numeric" value={p2pWager} onChangeText={(text) => setP2pWager(sanitizeNumber(text))} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.label}>Odds (x)</Text>
                      <TextInput style={styles.input} keyboardType="decimal-pad" value={p2pMultiplier} onChangeText={updateP2PMultiplier} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.label}>Win (%)</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <TextInput style={[styles.input, { flex: 1 }]} keyboardType="number-pad" value={p2pPercent} onChangeText={updateP2PPercent} />
                        <Text style={{ color: '#fff', position: 'absolute', right: 15, top: 15, fontWeight: 'bold' }}>%</Text>
                      </View>
                    </View>
                  </View>
                  <View style={styles.mathBox}>
                    <Text style={{ color: '#a0a0a0', fontSize: 14, marginBottom: 8 }}>
                      Side A Risks: <Text style={{color: '#fff'}}>{Math.trunc(parseFloat(p2pWager) || 0)} pts</Text>
                    </Text>
                    
                    <Text style={{ color: '#a0a0a0', fontSize: 14, marginBottom: 8 }}>
                      Side B Must Risk: <Text style={{color: '#fff'}}>{Math.max(0, Math.trunc(((parseFloat(p2pWager) || 0) * (parseFloat(p2pMultiplier) || 0)) - (parseFloat(p2pWager) || 0)))} pts</Text>
                    </Text>
                    
                    <Text style={{ color: '#FFD700', fontSize: 18, fontWeight: 'bold', marginTop: 5 }}>
                      Total Pot: {Math.trunc((parseFloat(p2pWager) || 0) * (parseFloat(p2pMultiplier) || 0))} pts
                    </Text>
                  </View>
                </>
              ) : (
                // --- STANDARD HOUSE BET UI ---
                // --- STANDARD HOUSE BET UI ---
                <>
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
                      
                      {/* 🚨 THE FIX: Added conditional styling to grey out the box! */}
                      <TextInput 
                        style={[
                          styles.input, 
                          { flex: 2, marginRight: 10, marginBottom: 0 },
                          betType === 'over_under' && { color: '#888', backgroundColor: '#2a2a2a', borderColor: '#222' }
                        ]} 
                        placeholder="e.g., William" 
                        placeholderTextColor="#666" 
                        value={opt.label} 
                        onChangeText={(text) => updateOption(opt.id, 'label', text)} 
                        editable={betType !== 'over_under'} 
                        selectTextOnFocus={betType !== 'over_under'}
                      />
                      
                      {/* 🚨 BONUS FIX: Added sanitizeNumber and decimal-pad to protect the Odds! */}
                      <TextInput 
                        style={[styles.input, { flex: 1, marginBottom: 0 }]} 
                        keyboardType="decimal-pad" 
                        placeholder="2.0" 
                        placeholderTextColor="#666" 
                        value={opt.odds} 
                        onChangeText={(text) => updateOption(opt.id, 'odds', sanitizeNumber(text))} 
                      />
                    </View>
                  ))}

                  {betType === 'prop' && (
                    <TouchableOpacity style={styles.addOptionBtn} onPress={handleAddOption}>
                      <Text style={styles.addOptionText}>+ Add Another Option</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
            </ScrollView>

            {(() => {
              let isOverleveraged = false;
              const currentBalance = walletBalance || 0;

              if (betType === 'p2p') {
                isOverleveraged = Math.trunc(parseFloat(p2pWager) || 0) > currentBalance;
              } else if (betType === 'blind') {
                const base = parseFloat(blindBase) || 0;
                const multi = parseFloat(blindMultiplier) || 0;
                isOverleveraged = Math.max(Math.trunc(base), Math.trunc((base * multi) - base)) > currentBalance;
              }

              return (
                <TouchableOpacity 
                  style={[styles.submitBtn, (isCreating || isOverleveraged) && { opacity: 0.5, backgroundColor: '#444' }]} 
                  onPress={handlePublishBet} 
                  disabled={isCreating || isOverleveraged}
                >
                  <Text style={styles.submitBtnText}>{isCreating ? 'Creating...' : 'Create Bet'}</Text>
                </TouchableOpacity>
              );
            })()}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Grade Modal */}
      <Modal visible={gradeModalVisible} transparent={true} animationType="fade" statusBarTranslucent={true}>
        <View style={styles.modalOverlayCenter}>
          <View style={styles.gradeModalContent}>
            <Text style={styles.modalTitle}>Who Won?</Text>
            <Text style={styles.modalSubtitle}>{selectedBet?.question}</Text>
            
            {selectedBet?.isP2P || selectedBet?.isBlind ? (
              // --- P2P & BLIND WINNER BUTTONS ---
              <>
                <TouchableOpacity 
                  style={styles.winnerButton} 
                  onPress={() => handleGradeBet('A')} 
                  disabled={isGrading || (selectedBet.isP2P && !selectedBet.side_a_user_id) || (selectedBet.isBlind && !selectedBet.user_2_id)}
                >
                  <Text style={styles.winnerButtonText}>
                    {isGrading ? 'Processing...' : `Winner: ${selectedBet.isBlind ? selectedBet.side_a_label : selectedBet.option_a_label}`}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.winnerButton} 
                  onPress={() => handleGradeBet('B')} 
                  disabled={isGrading || (selectedBet.isP2P && !selectedBet.side_b_user_id) || (selectedBet.isBlind && !selectedBet.user_2_id)}
                >
                  <Text style={styles.winnerButtonText}>
                    {isGrading ? 'Processing...' : `Winner: ${selectedBet.isBlind ? selectedBet.side_b_label : selectedBet.option_b_label}`}
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              // --- STANDARD BET WINNER BUTTONS ---
              selectedBet?.bet_options?.map((option: any) => (
                <TouchableOpacity key={option.id} style={styles.winnerButton} onPress={() => handleGradeBet(option.id)} disabled={isGrading}>
                  <Text style={styles.winnerButtonText}>{isGrading ? 'Processing...' : `Winner: ${option.label}`}</Text>
                </TouchableOpacity>
              ))
            )}
            
            <TouchableOpacity style={{ marginTop: 10, alignItems: 'center' }} onPress={() => setGradeModalVisible(false)}>
              <Text style={styles.closeText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212', padding: 20 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 25 },
  title: { fontSize: 32, fontWeight: 'bold', color: '#FFD700' },
  subtitle: { color: '#a0a0a0' },
  createButton: { backgroundColor: '#FFD700', paddingVertical: 10, paddingHorizontal: 15, borderRadius: 8 },
  createButtonText: { color: '#000', fontWeight: 'bold', fontSize: 16 },
  sectionHeader: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 15, marginTop: 10 },
  emptyText: { color: '#666', textAlign: 'center', marginTop: 20, marginBottom: 20 },
  betCard: { backgroundColor: '#1e1e1e', padding: 20, borderRadius: 10, marginBottom: 15, borderWidth: 1, borderColor: '#333' },
  betQuestion: { fontSize: 18, color: '#fff', fontWeight: 'bold', marginBottom: 10 },
  
  // DUAL INBOX STYLES
  inboxContainer: { marginBottom: 15, backgroundColor: '#2a2a2a', padding: 15, borderRadius: 10, borderWidth: 1, borderColor: '#00D084' },
  queueContainer: { marginBottom: 25, backgroundColor: '#2a2a2a', padding: 15, borderRadius: 10, borderWidth: 1, borderColor: '#FFD700' },
  inboxTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginBottom: 15 },
  ideaCard: { backgroundColor: '#121212', padding: 15, borderRadius: 8, marginBottom: 10, borderWidth: 1, borderColor: '#333' },
  pitchCard: { backgroundColor: '#121212', padding: 15, borderRadius: 10, borderWidth: 1, borderColor: '#333', marginBottom: 10 },
  pitchProposer: { color: '#00D084', fontSize: 12, fontWeight: 'bold', marginBottom: 5, textTransform: 'uppercase' },
  pitchQuestion: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 15 },
  pitchText: { color: '#fff', fontStyle: 'italic', fontSize: 16, marginBottom: 5 },
  pitchAuthor: { color: '#a0a0a0', fontSize: 14, marginBottom: 15 },
  pitchActions: { flexDirection: 'row', justifyContent: 'space-between' },
  approveText: { color: '#00D084', fontWeight: 'bold' },
  rejectText: { color: '#ff4444', fontWeight: 'bold' },
  pitchMathBox: { backgroundColor: '#1e1e1e', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#444', marginBottom: 15 },
  pitchMathText: { color: '#a0a0a0', fontSize: 14, marginBottom: 4 },
  pitchPotText: { color: '#FFD700', fontSize: 14, fontWeight: 'bold', marginTop: 5 },
  pitchActionRow: { flexDirection: 'row', gap: 10 },
  pitchBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
  pitchBtnText: { fontWeight: 'bold', fontSize: 14 },

  // MODAL & FORM STYLES
  typeSelectorRow: { flexDirection: 'row', marginBottom: 15, backgroundColor: '#121212', borderRadius: 8, padding: 4 },
  typeBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 6 },
  typeBtnActive: { backgroundColor: '#FFD700' },
  typeBtnText: { color: '#a0a0a0', fontWeight: 'bold' },
  typeBtnTextActive: { color: '#000' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.7)' },
  modalOverlayCenter: { flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.8)', padding: 20 },
  modalContent: { 
    backgroundColor: '#1e1e1e', 
    padding: 25, 
    width: '100%', 
    
    // Round the top corners
    borderTopLeftRadius: 25, 
    borderTopRightRadius: 25,
    
    // Keep the bottom padding so buttons aren't blocked by the home bar
    paddingBottom: Platform.OS === 'ios' ? 40 : Platform.OS === 'android' ? 35 : 25,
  },
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
  actionBtnTextDanger: { color: '#fff', fontWeight: 'bold' },
  mathBox: { backgroundColor: 'rgba(0, 208, 132, 0.05)', padding: 15, borderRadius: 8, borderWidth: 1, borderColor: '#00D084', marginVertical: 15 },
});