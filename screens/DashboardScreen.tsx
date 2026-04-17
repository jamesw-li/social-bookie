import React, { useEffect, useLayoutEffect, useState } from 'react';
import {
  StyleSheet, Text, View, FlatList, TouchableOpacity,
  ActivityIndicator, Alert, Modal, TextInput, KeyboardAvoidingView, Platform, ScrollView
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';
import * as Clipboard from 'expo-clipboard';
import EventSwitcher, { EventItem } from '../components/EventSwitcher';
import LedgerTab from '../components/LedgerTab';
import ActionTab from '../components/ActionTab';
import StandingsTab from '../components/StandingsTab';
import MyBetsTab from '../components/MyBetsTab';
import BackButton from '../components/BackButton';
import BetCountdown from '../components/BetCountdown';

export default function DashboardScreen({ route, navigation }: any) {
  const [loading, setLoading] = useState(true);
  const [eventsList, setEventsList] = useState<EventItem[]>([]);
  const [activeEventSwitchId, setActiveEventSwitchId] = useState('2');
  const [userId, setUserId] = useState<string | null>(null);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [walletBalance, setWalletBalance] = useState(0);
  const [activeEvent, setActiveEvent] = useState<any>(null);
  const [userRole, setUserRole] = useState<string>('guest');

  const [boardData, setBoardData] = useState<{
    bets: any[],
    p2pBets: any[],
    blindMatchups: any[]
  }>({ bets: [], p2pBets: [], blindMatchups: [] });

  const [myWagers, setMyWagers] = useState<any[]>([]);
  const [myBets, setMyBets] = useState<any[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<any[]>([]);
  const [standings, setStandings] = useState<any[]>([]);

  const [modalVisible, setModalVisible] = useState(false);
  const [selectedBet, setSelectedBet] = useState<any>(null);
  const [selectedOption, setSelectedOption] = useState<any>(null);
  const [wagerAmount, setWagerAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [suggestModalVisible, setSuggestModalVisible] = useState(false);
  const [pitchEventScope, setPitchEventScope] = useState<string | null>(null);
  const [pitchBetType, setPitchBetType] = useState<'prop' | 'over_under' | 'p2p' | 'blind'>('prop');
  const [pitchQuestion, setPitchQuestion] = useState('');
  const [pitchOptions, setPitchOptions] = useState([{ id: '1', label: '', odds: '' }, { id: '2', label: '', odds: '' }]);
  const [pitchOptionA, setPitchOptionA] = useState('Yes');
  const [pitchOptionB, setPitchOptionB] = useState('No');
  const [pitchWager, setPitchWager] = useState('100');
  const [pitchMultiplier, setPitchMultiplier] = useState('2.0');
  const [pitchBlindBase, setPitchBlindBase] = useState('100');
  const [pitchBlindMultiplier, setPitchBlindMultiplier] = useState('2.0');
  const [pitchBlindPercent, setPitchBlindPercent] = useState('50');
  const [pitchP2PPercent, setPitchP2PPercent] = useState('50');

  const [activeTab, setActiveTab] = useState<'action' | 'standings' | 'ledger' | 'bets'>('action');
  const [joinCode, setJoinCode] = useState<string>('');
  const [shareModalVisible, setShareModalVisible] = useState(false);

  const [blindModalVisible, setBlindModalVisible] = useState(false);
  const [selectedMatchup, setSelectedMatchup] = useState<any>(null);
  const [blindBid, setBlindBid] = useState('2.0');
  const [blindBidPercent, setBlindBidPercent] = useState('50');

  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  const handleTogglePitchBetType = (type: any) => {
    setPitchBetType(type);
    if (type === 'over_under') {
      setPitchOptions([{ id: '1', label: 'Over', odds: '' }, { id: '2', label: 'Under', odds: '' }]);
    } else if (type === 'prop') {
      setPitchOptions([{ id: '1', label: '', odds: '' }, { id: '2', label: '', odds: '' }]);
    }
  };

  const sanitizeNumber = (value: string) => {
    let sanitized = value.replace(/[^0-9.]/g, '');
    if (sanitized.split('.').length > 2) sanitized = sanitized.substring(0, sanitized.length - 1);
    return sanitized;
  };

  const updatePitchP2PMultiplier = (val: string) => {
    const sanitized = sanitizeNumber(val);
    setPitchMultiplier(sanitized);
    const num = parseFloat(sanitized);
    if (num >= 1) setPitchP2PPercent(((1 / num) * 100).toFixed(0));
  };

  const updatePitchP2PPercent = (val: string) => {
    const sanitized = sanitizeNumber(val);
    setPitchP2PPercent(sanitized);
    const num = parseFloat(sanitized);
    if (num > 0 && num <= 100) setPitchMultiplier((100 / num).toFixed(2));
  };

  const handleAddPitchOption = () => {
    setPitchOptions([...pitchOptions, { id: Date.now().toString(), label: '', odds: '' }]);
  };

  const updatePitchOption = (id: string, field: 'label' | 'odds', value: string) => {
    if (field === 'odds') {
      let sanitized = value.replace(/[^0-9.]/g, '');
      if (sanitized.split('.').length > 2) sanitized = sanitized.substring(0, sanitized.length - 1);
      setPitchOptions(pitchOptions.map(o => o.id === id ? { ...o, [field]: sanitized } : o));
    } else {
      setPitchOptions(pitchOptions.map(o => o.id === id ? { ...o, [field]: value } : o));
    }
  };

  const updatePitchBlindMultiplier = (val: string) => {
    const sanitized = sanitizeNumber(val);
    setPitchBlindMultiplier(sanitized);
    const num = parseFloat(sanitized);
    if (num >= 1) setPitchBlindPercent(((1 / num) * 100).toFixed(0));
  };

  const updatePitchBlindPercent = (val: string) => {
    const sanitized = sanitizeNumber(val);
    setPitchBlindPercent(sanitized);
    const num = parseFloat(sanitized);
    if (num > 0 && num <= 100) setPitchBlindMultiplier((100 / num).toFixed(2));
  };

  const syncBidFromMulti = (val: string) => {
    setBlindBid(val);
    const num = parseFloat(val);
    if (num >= 1) setBlindBidPercent(((1 / num) * 100).toFixed(0));
  };

  const syncBidFromPercent = (val: string) => {
    setBlindBidPercent(val);
    const num = parseFloat(val);
    if (num > 0 && num <= 100) setBlindBid((100 / num).toFixed(2));
  };

  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <BackButton onPress={handleSwitchEvent} />
      ),
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 15 }}>
          {userRole === 'host' && (
            <View style={{ position: 'relative' }}>
              <TouchableOpacity style={styles.navPillHost} onPress={() => navigation.navigate('Host')}>
                <MaterialCommunityIcons name="shield-crown-outline" size={14} color="#FFD700" />
                <Text style={[styles.navPillHostText, { marginLeft: 4 }]}>Host</Text>
              </TouchableOpacity>
              {pendingApprovals > 0 && (
                <View style={styles.badgeContainer}>
                  <Text style={styles.badgeText}>{pendingApprovals > 9 ? '9+' : pendingApprovals}</Text>
                </View>
              )}
            </View>
          )}
          <TouchableOpacity onPress={() => setActiveTab('ledger')} style={styles.walletBadge}>
            <MaterialCommunityIcons name="wallet-outline" size={14} color="#00D084" />
            <Text style={[styles.walletText, { marginLeft: 4 }]}>{walletBalance.toLocaleString()}</Text>
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation, userRole, walletBalance, pendingApprovals]);

  useEffect(() => {
    const channels: any[] = [];
    async function setupRealtime() {
      const storedUserId = await AsyncStorage.getItem('userId');
      const storedCampaignId = await AsyncStorage.getItem('campaignId');
      if (!storedCampaignId) return;

      const walletSub = supabase.channel(`public:campaign_participants_${storedCampaignId}_${storedUserId}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'campaign_participants', filter: `user_id=eq.${storedUserId}` }, () => loadBoard()).subscribe();
      const betsSub = supabase.channel(`public:bets_${storedCampaignId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'bets', filter: `campaign_id=eq.${storedCampaignId}` }, () => loadBoard()).subscribe();
      const eventsSub = supabase.channel(`public:events_${storedCampaignId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'events', filter: `campaign_id=eq.${storedCampaignId}` }, () => loadBoard()).subscribe();
      const campaignSub = supabase.channel(`campaign_status_${storedCampaignId}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'campaigns', filter: `id=eq.${storedCampaignId}` },
          (payload) => { if (payload.new.status === 'closed') navigation.reset({ index: 0, routes: [{ name: 'FinalResults' }] }); }
        ).subscribe();
      const p2pSub = supabase.channel(`public:p2p_${storedCampaignId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'p2p_prop_bets', filter: `campaign_id=eq.${storedCampaignId}` }, () => loadBoard()).subscribe();
      const blindSub = supabase.channel(`public:blind_${storedCampaignId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'blind_matchups', filter: `campaign_id=eq.${storedCampaignId}` }, () => loadBoard()).subscribe();
      const proposalSub = supabase.channel(`public:proposal_${storedCampaignId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'guest_proposals', filter: `campaign_id=eq.${storedCampaignId}` }, () => loadBoard()).subscribe();

      channels.push(walletSub, betsSub, eventsSub, campaignSub, p2pSub, blindSub, proposalSub);
    }
    loadBoard();
    setupRealtime();
    return () => {
      channels.forEach(ch => supabase.removeChannel(ch));
    };
  }, []);

  async function copyToClipboard() {
    if (!joinCode) return;
    await Clipboard.setStringAsync(joinCode);
    Alert.alert('Copied!', 'Room code copied to clipboard.');
    setShareModalVisible(false);
  }

  async function loadBoard(overrideEventId?: string | null) {
    try {
      const storedUserId = await AsyncStorage.getItem('userId');
      const storedCampaignId = await AsyncStorage.getItem('campaignId');
      if (!storedUserId || !storedCampaignId) throw new Error("Missing user data.");

      if (isInitialLoad) setLoading(true);

      await Promise.all([
        supabase.rpc('open_expired_auto_events'),
        supabase.rpc('lock_expired_auto_bets')
      ]);

      setUserId(storedUserId);
      setCampaignId(storedCampaignId);

      const { data: campaignData } = await supabase.from('campaigns').select('join_code, status').eq('id', storedCampaignId).single();
      if (campaignData?.status === 'closed') {
        setLoading(false);
        return navigation.reset({ index: 0, routes: [{ name: 'FinalResults' }] });
      }
      if (campaignData?.join_code) setJoinCode(campaignData.join_code);

      const { data: participantData } = await supabase.from('campaign_participants').select('global_point_balance, role').eq('user_id', storedUserId).eq('campaign_id', storedCampaignId).single();
      if (participantData) {
        setWalletBalance(participantData.global_point_balance);
        setUserRole(participantData.role);
      }

      const { data: campaignEvents } = await supabase.from('events').select('id, name, status, start_time, trigger_type').eq('campaign_id', storedCampaignId).order('start_time', { ascending: true });
      const eventsDataList = campaignEvents || [];
      setEventsList(eventsDataList);

      let targetEventId = overrideEventId !== undefined ? overrideEventId : activeEventSwitchId;
      if (!eventsDataList.some((e: any) => e.id === targetEventId)) {
        const fallbackEvent = eventsDataList.find((e: any) => e.status === 'live') || eventsDataList[0];
        if (fallbackEvent) {
          targetEventId = fallbackEvent.id;
          setActiveEventSwitchId(targetEventId as string);
        } else {
          setLoading(false);
          return;
        }
      }
      setActiveEvent(eventsDataList.find((e: any) => e.id === targetEventId));

      const orFilter = `event_id.is.null${targetEventId ? `,event_id.eq.${targetEventId}` : ''}`;

      const { count: pendingProps } = await supabase.from('bets').select('id', { count: 'exact' }).eq('campaign_id', storedCampaignId).eq('status', 'pending');
      const { count: pendingP2P } = await supabase.from('p2p_prop_bets').select('id', { count: 'exact' }).eq('campaign_id', storedCampaignId).eq('status', 'pending_approval');
      const { count: pendingBlind } = await supabase.from('blind_matchups').select('id', { count: 'exact' }).eq('campaign_id', storedCampaignId).eq('status', 'pending_approval');
      setPendingApprovals((pendingProps || 0) + (pendingP2P || 0) + (pendingBlind || 0));

      const sortBets = (list: any[]) => {
        return list.sort((a, b) => {
          const statusOrder = { open: 0, matched: 1, locked: 2, resolved: 3, graded: 3, canceled: 4 };
          const orderA = (statusOrder as any)[a.status] ?? 99;
          const orderB = (statusOrder as any)[b.status] ?? 99;
          if (orderA !== orderB) return orderA - orderB;
          if (a.status === 'open') {
            const hasTimerA = a.trigger_type === 'auto' && a.lock_at;
            const hasTimerB = b.trigger_type === 'auto' && b.lock_at;
            if (hasTimerA && !hasTimerB) return -1;
            if (!hasTimerA && hasTimerB) return 1;
            if (hasTimerA && hasTimerB) return new Date(a.lock_at).getTime() - new Date(b.lock_at).getTime();
          }
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });
      };

      const [betsRes, p2pRes, blindRes, wagersRes, standingsRes, ledgerRes] = await Promise.all([
        supabase.from('bets').select(`id, question, status, wager_count, trigger_type, lock_at, created_at, bet_options!bet_options_bet_id_fkey ( id, label, multiplier )`).eq('campaign_id', storedCampaignId).in('status', ['open', 'locked']).or(orFilter),
        supabase.from('p2p_prop_bets').select('*, trigger_type, lock_at').eq('campaign_id', storedCampaignId).in('status', ['open', 'locked', 'resolved']).or(orFilter),
        supabase.from('blind_matchups').select('*, trigger_type, lock_at').eq('campaign_id', storedCampaignId).in('status', ['open', 'matched', 'resolved']).or(orFilter),
        supabase.from('wagers').select(`id, bet_id, points_risked, status, created_at, bet_options!wagers_option_id_fkey ( label, multiplier ), bets ( question, event_id ) `).eq('user_id', storedUserId),
        supabase.from('campaign_participants').select('user_id, global_point_balance, users(display_name)').eq('campaign_id', storedCampaignId).order('global_point_balance', { ascending: false }),
        supabase.from('ledger_entries').select('id, transaction_type, amount, memo, running_balance, created_at').eq('user_id', storedUserId).eq('campaign_id', storedCampaignId).order('created_at', { ascending: false })
      ]);

      const newBoardData = {
        bets: sortBets(betsRes.data ?? []),
        p2pBets: sortBets(p2pRes.data ?? []),
        blindMatchups: sortBets(blindRes.data ?? [])
      };

      setBoardData(newBoardData);
      
      if (wagersRes.data) {
        const activeWagers = wagersRes.data.filter((w: any) => w.status !== 'canceled');
        setMyWagers(activeWagers.filter((w: any) => w.status === 'pending'));
        setMyBets(activeWagers.reverse());
      }
      if (standingsRes.data) setStandings(standingsRes.data);
      if (ledgerRes.data) setLedgerEntries(ledgerRes.data);

    } catch (error: any) { console.error(error.message); } finally { 
      setLoading(false); 
      setIsInitialLoad(false);
    }
  }

  function openBetSlip(bet: any, option?: any) {
    if (bet.status === 'locked') {
      const lockMsg = 'The host has locked betting for this action.';
      if (Platform.OS === 'web') return window.alert(lockMsg);
      return Alert.alert('Board Locked', lockMsg);
    }
    const existingWager = myWagers.find((w: any) => String(w.bet_id) === String(bet.id));
    if (existingWager) {
      const askEdit = async () => {
        const { error } = await supabase.rpc('cancel_wager', { target_wager_id: existingWager.id });
        if (!error) loadBoard();
      };
      if (Platform.OS === 'web') { if (window.confirm('Cancel existing ticket and pick again?')) askEdit(); }
      else { Alert.alert('Bet Placed', 'Pick again?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Refund & Edit', style: 'destructive', onPress: askEdit }]); }
      return;
    }
    setSelectedBet(bet); setWagerAmount(''); setSelectedOption(option || null); setModalVisible(true);
  }

  async function submitWager() {
    const points = parseInt(wagerAmount);
    if (isNaN(points) || points <= 0 || points > walletBalance) return;
    setIsSubmitting(true);
    try {
      const { error } = await supabase.rpc('place_wager', { p_user_id: userId, p_bet_id: selectedBet.id, p_option_id: selectedOption.id, p_campaign_id: campaignId, p_points: points });
      if (!error) { setWalletBalance(prev => prev - points); setModalVisible(false); loadBoard(); }
    } finally { setIsSubmitting(false); }
  }

  async function handleClaimP2P(betId: string, side: 'A' | 'B', cost: number) {
    if (cost > walletBalance) return;
    const execute = async () => {
      setIsSubmitting(true);
      try {
        const { error } = await supabase.rpc('claim_p2p_side', { p_bet_id: betId, p_user_id: userId, p_side: side, p_cost: cost });
        if (!error) loadBoard();
      } finally { setIsSubmitting(false); }
    };
    if (Platform.OS === 'web') { if (window.confirm(`Lock in side for ${cost} pts?`)) execute(); }
    else { Alert.alert('Lock in Side?', `Cost: ${cost} pts`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Lock It In', onPress: execute }]); }
  }

  async function submitBlindBid() {
    const bid = parseFloat(blindBid);
    if (isNaN(bid) || bid <= 1) return;
    setIsSubmitting(true);
    try {
      const { error } = await supabase.rpc('match_blind_p2p', { p_matchup_id: selectedMatchup.id, p_user_2_id: userId, p_user_2_bid: bid });
      if (!error) { setBlindModalVisible(false); setBlindBid('2.0'); loadBoard(); }
    } finally { setIsSubmitting(false); }
  }

  const resetPitchState = () => {
    setPitchQuestion('');
    setPitchOptions([{ id: '1', label: '', odds: '' }, { id: '2', label: '', odds: '' }]);
    setPitchOptionA('Yes');
    setPitchOptionB('No');
    setPitchWager('100');
    setPitchMultiplier('2.0');
    setPitchBlindBase('100');
    setPitchBlindMultiplier('2.0');
    setPitchBlindPercent('50');
    setPitchP2PPercent('50');
    setPitchBetType('prop');
    setPitchEventScope(activeEventSwitchId);
  };

  async function handleSubmitPitch() {
    if (!pitchQuestion.trim()) return;
    setIsSubmitting(true);
    try {
      if (pitchBetType === 'prop' || pitchBetType === 'over_under') {
        const validOptions = pitchOptions.filter(o => o.label.trim() !== '');
        const { data: betData, error: betError } = await supabase.from('bets').insert([{ campaign_id: campaignId, event_id: pitchEventScope, question: pitchQuestion, type: pitchBetType, status: 'pending', creator_id: userId }]).select().single();
        if (!betError) {
          const opts = validOptions.map(o => ({ bet_id: betData.id, label: o.label, multiplier: parseFloat(o.odds) || 2.0 }));
          await supabase.from('bet_options').insert(opts);
        }
      } else if (pitchBetType === 'p2p') {
        await supabase.from('p2p_prop_bets').insert([{ campaign_id: campaignId, event_id: pitchEventScope, proposer_id: userId, question: pitchQuestion, option_a_label: pitchOptionA, option_b_label: pitchOptionB, wager_amount: parseFloat(pitchWager), multiplier: parseFloat(pitchMultiplier), status: 'pending_approval' }]);
      } else if (pitchBetType === 'blind') {
        await supabase.from('blind_matchups').insert([{ campaign_id: campaignId, event_id: pitchEventScope, user_1_id: userId, question: pitchQuestion, side_a_label: pitchOptionA, side_b_label: pitchOptionB, base_amount: parseFloat(pitchBlindBase), user_1_bid_multiplier: parseFloat(pitchBlindMultiplier), status: 'pending_approval' }]);
      }
      setSuggestModalVisible(false); 
      resetPitchState();
      loadBoard();
    } finally { setIsSubmitting(false); }
  }

  async function handleSwitchEvent() {
    const uid = await AsyncStorage.getItem('userId');
    const uname = await AsyncStorage.getItem('userName');
    await AsyncStorage.removeItem('campaignId');
    navigation.reset({ index: 0, routes: [{ name: 'Campaigns', params: { userId: uid, userName: uname } }] });
  }

  const renderBetCard = ({ item }: { item: any }) => {
    const existingWager = myWagers.find(w => String(w.bet_id) === String(item.id));
    const isOpen = item.status === 'open';
    const isLocked = item.status === 'locked' || (item.event_id !== null && activeEvent?.status !== 'live');

    const renderLockInfo = (bet: any) => {
      if (bet.trigger_type !== 'auto' || !bet.lock_at) return null;
      const d = new Date(bet.lock_at);
      const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const dateStr = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
      return <Text numberOfLines={1} style={{ color: '#666', fontSize: 9 }}>Ends {dateStr} {timeStr}</Text>;
    };

    const renderStatus = (bet: any) => {
      if (bet.status !== 'open') {
        return (
          <View style={[styles.statusBadge, { backgroundColor: 'rgba(255, 68, 68, 0.2)', flexDirection: 'row', alignItems: 'center' }]}>
            <Text style={{ color: '#ff4444', fontWeight: 'bold', fontSize: 10 }}>🔒 LOCKED</Text>
            {bet.trigger_type === 'auto' && bet.lock_at && <BetCountdown bet={bet} mode="status-only" color="#ff4444" />}
          </View>
        );
      }
      return (
        <View style={[styles.statusBadge, { backgroundColor: 'rgba(0, 208, 132, 0.2)', flexDirection: 'row', alignItems: 'center' }]}>
          <Text style={{ color: '#00D084', fontWeight: 'bold', fontSize: 10 }}>🟢</Text>
          {bet.trigger_type === 'auto' && bet.lock_at ? <BetCountdown bet={bet} mode="status-only" onZero={() => loadBoard(activeEventSwitchId)} /> : <Text style={{ color: '#00D084', fontWeight: 'bold', fontSize: 10, marginLeft: 4 }}>OPEN</Text>}
        </View>
      );
    };

    if (item.isBlind) {
      const isMatched = item.status === 'matched' || item.status === 'resolved';
      return (
        <View style={[styles.betCard, { borderColor: '#BB86FC', borderWidth: 2 }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={styles.betQuestion}>{item.question}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ backgroundColor: '#BB86FC', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}>
                <Text style={{ color: '#000', fontWeight: 'bold', fontSize: 10 }}>🤝 BLIND</Text>
              </View>
              {!isMatched && renderStatus(item)}
            </View>
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Text style={{ color: '#666', fontSize: 11, fontWeight: 'bold' }}>
              🎟️ {(item.user_1_id ? 1 : 0) + (item.user_2_id ? 1 : 0)} PLACED
            </Text>
            {renderLockInfo(item)}
          </View>

          {isMatched ? (
            <View style={{ backgroundColor: 'rgba(187, 134, 252, 0.1)', padding: 15, borderRadius: 8, borderWidth: 1, borderColor: '#BB86FC' }}>
              <Text style={{ color: '#BB86FC', fontWeight: 'bold', textAlign: 'center', fontSize: 14 }}>Match Made! {Number(item.final_multiplier).toFixed(2)}x</Text>
            </View>
          ) : (
            <TouchableOpacity style={[styles.optionButton, (item.user_1_id === userId || isLocked) && { backgroundColor: '#121212', borderColor: '#333' }]} disabled={item.user_1_id === userId || isLocked} onPress={() => { setSelectedMatchup(item); setBlindModalVisible(true); }}>
              <Text style={styles.optionLabel}>{item.user_1_id === userId ? "Waiting for Challenger..." : isLocked ? "🔒 Locked" : "Challenge"}</Text>
            </TouchableOpacity>
          )}
        </View>
      );
    }

    if (item.isP2P) {
      return (
        <View style={[styles.betCard, { borderColor: '#FFD700', borderWidth: 2 }, isLocked && { opacity: 0.8 }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={styles.betQuestion}>{item.question}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ backgroundColor: '#FFD700', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}>
                <Text style={{ color: '#000', fontWeight: 'bold', fontSize: 10 }}>🥊 PROP</Text>
              </View>
              {renderStatus(item)}
            </View>
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Text style={{ color: '#666', fontSize: 11, fontWeight: 'bold' }}>
              🎟️ {(item.side_a_user_id ? 1 : 0) + (item.side_b_user_id ? 1 : 0)} PLACED
            </Text>
            {renderLockInfo(item)}
          </View>

          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity style={styles.optionButton} disabled={isLocked} onPress={() => handleClaimP2P(item.id, 'A', item.wager_amount)}><Text style={styles.optionLabel}>{item.side_a_user_id ? "🔒 Claimed" : item.option_a_label}</Text></TouchableOpacity>
            <TouchableOpacity style={styles.optionButton} disabled={isLocked} onPress={() => handleClaimP2P(item.id, 'B', item.challenger_cost)}><Text style={styles.optionLabel}>{item.side_b_user_id ? "🔒 Claimed" : item.option_b_label}</Text></TouchableOpacity>
          </View>
        </View>
      );
    }

    return (
      <View style={[styles.betCard, isLocked && { opacity: 0.9, borderColor: '#444' }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
          <View style={{ flex: 1, paddingRight: 10 }}>
            <Text style={styles.betQuestion}>{item.question}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ backgroundColor: '#00D084', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}>
              <Text style={{ color: '#000', fontWeight: 'bold', fontSize: 10 }}>🎲 HOUSE</Text>
            </View>
            {renderStatus(item)}
          </View>
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <Text style={{ color: '#666', fontSize: 11, fontWeight: 'bold' }}>
            🎟️ {item.wager_count || 0} PLACED
          </Text>
          {renderLockInfo(item)}
        </View>

        {existingWager ? (
          <View style={styles.lockedWagerCard}><Text style={styles.lockedText}>✅ Ticket Placed</Text></View>
        ) : (
          <View style={styles.optionsRow}>
            {item.bet_options?.map((o: any) => (
              <TouchableOpacity key={o.id} style={styles.optionButton} onPress={() => openBetSlip(item, o)} disabled={isLocked}>
                <Text style={styles.optionLabel}>{o.label}</Text>
                <Text style={styles.optionOdds}>{o.multiplier}x</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    );
  };

  if (loading) return <View style={styles.container}><ActivityIndicator size="large" color="#00D084" /></View>;

  const combinedTickets = [
    ...boardData.blindMatchups.filter((b: any) => String(b.user_1_id) === String(userId) || String(b.user_2_id) === String(userId)).map((b: any) => ({ ...b, type: 'blind' })),
    ...boardData.p2pBets.filter((b: any) => String(b.side_a_user_id) === String(userId) || String(b.side_b_user_id) === String(userId)).map((b: any) => ({ ...b, type: 'p2p' })),
    ...myBets.map(w => ({ ...w, type: 'house' }))
  ].sort((a, b) => (new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));

  return (
    <View style={{ flex: 1, backgroundColor: '#121212' }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {activeTab === 'action' && (
          <ActionTab 
            bets={boardData.bets} 
            p2pBets={boardData.p2pBets} 
            blindMatchups={boardData.blindMatchups} 
            eventsList={eventsList} 
            activeEventSwitchId={activeEventSwitchId} 
            onSelectEvent={(id) => { setActiveEventSwitchId(id); loadBoard(id); }} 
            onPitchPress={() => { 
              resetPitchState();
              setSuggestModalVisible(true); 
            }} 
            renderBetCard={renderBetCard} 
            onRefreshRequest={() => loadBoard(activeEventSwitchId)} 
          />
        )}
        {activeTab === 'standings' && <StandingsTab standings={standings} userId={userId} />}
        {activeTab === 'ledger' && <LedgerTab userId={userId} campaignId={campaignId} initialEntries={ledgerEntries} />}
        {activeTab === 'bets' && <MyBetsTab combinedTickets={combinedTickets} userId={userId} eventsList={eventsList} activeEventSwitchId={activeEventSwitchId} onSelectEvent={(id) => { setActiveEventSwitchId(id); loadBoard(id); }} onRefreshRequest={() => loadBoard(activeEventSwitchId)} />}

        <View style={styles.bottomNavBar}>
          <TouchableOpacity style={activeTab === 'action' ? styles.bottomNavBtnActive : styles.bottomNavBtn} onPress={() => setActiveTab('action')}><Text>🎲</Text><Text style={styles.bottomNavText}>Action</Text></TouchableOpacity>
          <TouchableOpacity style={activeTab === 'bets' ? styles.bottomNavBtnActive : styles.bottomNavBtn} onPress={() => setActiveTab('bets')}><Text>🧾</Text><Text style={styles.bottomNavText}>Bets</Text></TouchableOpacity>
          <TouchableOpacity style={activeTab === 'ledger' ? styles.bottomNavBtnActive : styles.bottomNavBtn} onPress={() => setActiveTab('ledger')}><Text>📒</Text><Text style={styles.bottomNavText}>Ledger</Text></TouchableOpacity>
          <TouchableOpacity style={activeTab === 'standings' ? styles.bottomNavBtnActive : styles.bottomNavBtn} onPress={() => setActiveTab('standings')}><Text>🏆</Text><Text style={styles.bottomNavText}>Ranks</Text></TouchableOpacity>
        </View>

        <Modal visible={blindModalVisible} animationType="slide" transparent={true}>
          <View style={styles.modalOverlay}><View style={styles.betSlipContainer}><Text style={styles.modalTitle}>Blind Bid</Text><TouchableOpacity onPress={() => setBlindModalVisible(false)}><Text style={styles.closeSlipText}>Cancel</Text></TouchableOpacity></View></View>
        </Modal>

        <Modal visible={modalVisible} transparent={true} animationType="slide">
          <View style={styles.modalOverlay}><View style={styles.betSlipContainer}><Text style={styles.slipTitle}>Bet Slip</Text><TouchableOpacity onPress={() => setModalVisible(false)}><Text style={styles.closeSlipText}>Cancel</Text></TouchableOpacity></View></View>
        </Modal>

        <Modal visible={suggestModalVisible} transparent={true} animationType="slide">
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Pitch Bet</Text>
                <TouchableOpacity onPress={() => { setSuggestModalVisible(false); resetPitchState(); }}>
                  <Text style={styles.closeSlipText}>Cancel</Text>
                </TouchableOpacity>
              </View>

              <View style={{ marginBottom: 15 }}>
                <Text style={styles.specSectionLabel}>Link to Action:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row' }}>
                  {eventsList.map((e: any) => (
                    <TouchableOpacity
                      key={e.id}
                      style={[styles.scopePill, pitchEventScope === e.id && styles.scopePillActive]}
                      onPress={() => setPitchEventScope(e.id)}
                    >
                      <Text style={[styles.scopePillText, pitchEventScope === e.id && styles.scopePillTextActive]}>{e.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              <View style={styles.specTypeSelectorRow}>
                <TouchableOpacity style={[styles.specTypeBtn, pitchBetType === 'prop' && styles.specTypeBtnActive]} onPress={() => handleTogglePitchBetType('prop')}>
                  <Text style={[styles.specTypeBtnText, pitchBetType === 'prop' && styles.specTypeBtnTextActive]}>Props</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.specTypeBtn, pitchBetType === 'over_under' && styles.specTypeBtnActive]} onPress={() => handleTogglePitchBetType('over_under')}>
                  <Text style={[styles.specTypeBtnText, pitchBetType === 'over_under' && styles.specTypeBtnTextActive]}>O/U</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.specTypeBtn, pitchBetType === 'p2p' && styles.specTypeBtnActive]} onPress={() => handleTogglePitchBetType('p2p')}>
                  <Text style={[styles.specTypeBtnText, pitchBetType === 'p2p' && styles.specTypeBtnTextActive]}>P2P</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.specTypeBtn, pitchBetType === 'blind' && { backgroundColor: '#BB86FC' }]} onPress={() => handleTogglePitchBetType('blind')}>
                  <Text style={[styles.specTypeBtnText, pitchBetType === 'blind' && { color: '#000', fontWeight: 'bold' }]}>Blind</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                {pitchBetType === 'blind' ? (
                  <>
                    <Text style={[styles.specSectionLabel, { color: '#BB86FC' }]}>The Scenario</Text>
                    <TextInput style={styles.specInput} placeholder="e.g., PRX vs NRG" placeholderTextColor="#666" value={pitchQuestion} onChangeText={setPitchQuestion} />
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8, marginBottom: 5 }}>
                      <View style={{ flex: 1, minWidth: 120 }}><Text style={styles.specSectionLabel}>Side A</Text><TextInput style={styles.specInput} value={pitchOptionA} onChangeText={setPitchOptionA} placeholder="PRX" placeholderTextColor="#666" /></View>
                      <View style={{ flex: 1, minWidth: 120 }}><Text style={styles.specSectionLabel}>Side B</Text><TextInput style={styles.specInput} value={pitchOptionB} onChangeText={setPitchOptionB} placeholder="NRG" placeholderTextColor="#666" /></View>
                    </View>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 5 }}>
                      <View style={{ flex: 1, minWidth: 80 }}><Text style={{ color: '#BB86FC', fontSize: 13, fontWeight: 'bold', marginBottom: 5 }}>Base Unit</Text><TextInput style={styles.specInput} keyboardType="numeric" value={pitchBlindBase} onChangeText={setPitchBlindBase} placeholder="100" /></View>
                      <View style={{ flex: 1, minWidth: 80 }}><Text style={{ color: '#BB86FC', fontSize: 13, fontWeight: 'bold', marginBottom: 5 }}>Odds (x)</Text><TextInput style={styles.specInput} keyboardType="decimal-pad" value={pitchBlindMultiplier} onChangeText={updatePitchBlindMultiplier}/></View>
                      <View style={{ flex: 1, minWidth: 80 }}><Text style={{ color: '#BB86FC', fontSize: 13, fontWeight: 'bold', marginBottom: 5 }}>Win (%)</Text><TextInput style={styles.specInput} keyboardType="number-pad" value={pitchBlindPercent} onChangeText={updatePitchBlindPercent}/></View>
                    </View>
                  </>
                ) : pitchBetType === 'p2p' ? (
                  <>
                    <Text style={[styles.specSectionLabel, { color: '#fff' }]}>The Scenario</Text>
                    <TextInput style={styles.specInput} placeholder="e.g., Will Chris spill his drink?" placeholderTextColor="#666" value={pitchQuestion} onChangeText={setPitchQuestion} />
                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 8, marginBottom: 5 }}>
                      <View style={{ flex: 1 }}><Text style={styles.specSectionLabel}>Option A</Text><TextInput style={styles.specInput} value={pitchOptionA} onChangeText={setPitchOptionA} placeholder="Yes" placeholderTextColor="#666" /></View>
                      <View style={{ flex: 1 }}><Text style={styles.specSectionLabel}>Option B</Text><TextInput style={styles.specInput} value={pitchOptionB} onChangeText={setPitchOptionB} placeholder="No" placeholderTextColor="#666" /></View>
                    </View>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 5 }}>
                      <View style={{ flex: 1, minWidth: 80 }}><Text style={styles.specSectionLabel}>Risk</Text><TextInput style={styles.specInput} keyboardType="numeric" value={pitchWager} onChangeText={(text) => setPitchWager(sanitizeNumber(text))} /></View>
                      <View style={{ flex: 1, minWidth: 80 }}><Text style={styles.specSectionLabel}>Odds (x)</Text><TextInput style={styles.specInput} keyboardType="decimal-pad" value={pitchMultiplier} onChangeText={updatePitchP2PMultiplier} /></View>
                      <View style={{ flex: 1, minWidth: 80 }}><Text style={styles.specSectionLabel}>Win (%)</Text><TextInput style={styles.specInput} keyboardType="number-pad" value={pitchP2PPercent} onChangeText={updatePitchP2PPercent} /></View>
                    </View>
                  </>
                ) : (
                  <>
                    <Text style={[styles.specSectionLabel, { color: '#fff' }]}>The Question</Text>
                    <TextInput style={styles.specInput} placeholder={pitchBetType === 'over_under' ? "e.g., Number of foul calls: 4.5" : "e.g., Who wins the first hand of poker?"} placeholderTextColor="#666" value={pitchQuestion} onChangeText={setPitchQuestion} />
                    <Text style={{ color: '#00D084', fontSize: 13, fontWeight: 'bold', marginBottom: 10, marginTop: 10 }}>Options & Payouts</Text>
                    {pitchOptions.map((opt) => (
                      <View key={opt.id} style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
                        <TextInput 
                          style={[styles.specInput, { flex: 3 }]} 
                          value={opt.label} 
                          onChangeText={(text) => updatePitchOption(opt.id, 'label', text)} 
                          editable={pitchBetType !== 'over_under'} 
                          placeholder="Option Name"
                          placeholderTextColor="#666"
                        />
                        <TextInput 
                          style={[styles.specInput, { flex: 1, textAlign: 'center' }]} 
                          keyboardType="decimal-pad" 
                          value={opt.odds} 
                          onChangeText={(text) => updatePitchOption(opt.id, 'odds', text)} 
                          placeholder="2.0"
                          placeholderTextColor="#666"
                        />
                      </View>
                    ))}
                    {pitchBetType === 'prop' && <TouchableOpacity style={{ alignItems: 'center', paddingVertical: 10 }} onPress={handleAddPitchOption}><Text style={{ color: '#00D084', fontWeight: 'bold', fontSize: 13 }}>+ Add Another Option</Text></TouchableOpacity>}
                  </>
                )}
              </ScrollView>

              <TouchableOpacity 
                style={styles.specSubmitBtn} 
                onPress={handleSubmitPitch}
                disabled={isSubmitting}
              >
                <Text style={styles.specSubmitBtnText}>{isSubmitting ? 'PITCHING...' : 'PITCH TO HOST'}</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212', padding: 20 },
  headerContainer: { marginBottom: 15 },
  navPillHost: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255, 215, 0, 0.1)', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: '#FFD700' },
  navPillHostText: { color: '#FFD700', fontWeight: 'bold', fontSize: 12 },
  walletBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0, 208, 132, 0.1)', borderWidth: 1, borderColor: '#00D084', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  walletText: { color: '#00D084', fontWeight: 'bold', fontSize: 13 },
  badgeContainer: { position: 'absolute', top: -5, right: -5, backgroundColor: '#ff4444', borderRadius: 12, minWidth: 24, height: 24, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#121212' },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  betCard: { backgroundColor: '#1e1e1e', borderRadius: 12, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: '#333' },
  betQuestion: { fontSize: 16, color: '#fff', fontWeight: 'bold', marginBottom: 2 },
  optionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  optionButton: { flex: 1, minWidth: '45%', backgroundColor: '#2a2a2a', paddingVertical: 10, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#444' },
  optionLabel: { color: '#fff', fontSize: 14, fontWeight: '600' },
  optionOdds: { color: '#00D084', fontSize: 12, fontWeight: 'bold', marginTop: 4 },
  statusBadge: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6, height: 22, justifyContent: 'center' },
  bottomNavBar: { flexDirection: 'row', backgroundColor: '#1e1e1e', borderTopWidth: 1, borderTopColor: '#333' },
  bottomNavBtn: { flex: 1, alignItems: 'center', paddingVertical: 10 },
  bottomNavBtnActive: { flex: 1, alignItems: 'center', paddingVertical: 10, borderTopWidth: 3, borderTopColor: '#00D084' },
  bottomNavText: { color: '#fff', fontSize: 10, marginTop: 4 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  betSlipContainer: { backgroundColor: '#1e1e1e', padding: 25, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  modalContent: { backgroundColor: '#1e1e1e', padding: 25, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  slipTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  closeSlipText: { color: '#ff4444', fontWeight: 'bold' },
  lockedWagerCard: { backgroundColor: '#121212', padding: 15, borderRadius: 8, borderWidth: 1, borderColor: '#00D084', marginTop: 10 },
  lockedText: { color: '#00D084', fontWeight: 'bold', textAlign: 'center' },
  typeSelectorRow: { flexDirection: 'row', backgroundColor: '#121212', padding: 4, borderRadius: 8, marginBottom: 15 },
  typeBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 6 },
  typeBtnActive: { backgroundColor: '#FFD700' },
  typeBtnText: { color: '#a0a0a0', fontWeight: 'bold' },
  typeBtnTextActive: { color: '#000' },
  p2pInput: { backgroundColor: '#121212', borderRadius: 8, color: '#fff', padding: 12, borderWidth: 1, borderColor: '#333', marginBottom: 10 },
  scopePill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 15, backgroundColor: '#2a2a2a', marginRight: 8 },
  scopePillActive: { backgroundColor: '#FFD700' },
  scopePillText: { color: '#fff', fontSize: 12 },
  scopePillTextActive: { color: '#000' },
  mathBox: { padding: 15, borderRadius: 8, borderWidth: 1, borderColor: '#00D084', marginTop: 10 },
  specSectionLabel: { color: '#e0e0e0', fontSize: 13, fontWeight: 'bold', marginBottom: 8 },
  specInput: { backgroundColor: '#121212', color: '#fff', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: '#333', fontSize: 14 },
  specTypeSelectorRow: { flexDirection: 'row', backgroundColor: '#121212', padding: 4, borderRadius: 8, marginBottom: 15 },
  specTypeBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 6 },
  specTypeBtnActive: { backgroundColor: '#FFD700' },
  specTypeBtnText: { color: '#a0a0a0', fontWeight: 'bold', fontSize: 12 },
  specTypeBtnTextActive: { color: '#121212' },
  specSubmitBtn: { backgroundColor: '#00D084', borderRadius: 10, paddingVertical: 15, alignItems: 'center', justifyContent: 'center', marginTop: 15 },
  specSubmitBtnText: { color: '#000', fontWeight: 'bold', fontSize: 16 },
});
