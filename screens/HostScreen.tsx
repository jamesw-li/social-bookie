import React, { useEffect, useState, useLayoutEffect } from 'react';
import {
  StyleSheet, Text, View, FlatList, TouchableOpacity,
  ActivityIndicator, Alert, Modal, TextInput, KeyboardAvoidingView, Platform, ScrollView, Dimensions
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';
import EventSwitcher, { EventItem } from '../components/EventSwitcher';
import HostEventController, { HostEvent } from '../components/HostEventController';
import HostBetController, { HostBet } from '../components/HostBetController';
import EventFormModal from '../components/EventFormModal';
import GradeModal from '../components/GradeModal';
import LedgerTab from '../components/LedgerTab';
import BackButton from '../components/BackButton';

export default function HostScreen({ navigation }: any) {
  const [loading, setLoading] = useState(true);
  const [eventsList, setEventsList] = useState<EventItem[]>([]);
  const [activeEventSwitchId, setActiveEventSwitchId] = useState('2');
  const [eventFormVisible, setEventFormVisible] = useState(false);
  const [editingEvent, setEditingEvent] = useState<HostEvent | null>(null);
  const [hostEventScope, setHostEventScope] = useState<string | null>(null);

  const [activeEventId, setActiveEventId] = useState<string | null>(null);
  const [bets, setBets] = useState<any[]>([]);

  // --- DUAL INBOX STATES ---
  const [proposals, setProposals] = useState<any[]>([]);
  const [pendingPitches, setPendingPitches] = useState<any[]>([]);

  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(null);
  const [activeCampaignName, setActiveCampaignName] = useState<string>('');
  const [participants, setParticipants] = useState<any[]>([]);
  const [deleteCampaignModalVisible, setDeleteCampaignModalVisible] = useState(false);
  const [confirmCampaignName, setConfirmCampaignName] = useState('');
  const [campaignJoinCode, setCampaignJoinCode] = useState('');

  // Grading & Creation States
  const [gradeModalVisible, setGradeModalVisible] = useState(false);
  const [selectedBet, setSelectedBet] = useState<any>(null);
  const [isGrading, setIsGrading] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [selectedParticipant, setSelectedParticipant] = useState<any>(null);
  const [playerActionSheetVisible, setPlayerActionSheetVisible] = useState(false);
  const [viewingPlayerLedger, setViewingPlayerLedger] = useState(false);
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

  const [activeView, setActiveView] = useState<'dashboard' | 'events' | 'bets' | 'grading' | 'pitches' | 'participants' | 'campaign'>('dashboard');
  const [drillDownEventId, setDrillDownEventId] = useState<string | null>(null);

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
  const [editingPitch, setEditingPitch] = useState<any>(null);

  const getGlobalEventId = () => {
    const g = eventsList.find(e => e.name === 'Global');
    return g ? g.id : null;
  };

  // Initialize drillDownEventId to Global once events are loaded
  useEffect(() => {
    if (!drillDownEventId && eventsList.length > 0) {
      const gId = getGlobalEventId();
      if (gId) setDrillDownEventId(gId);
    }
  }, [eventsList, drillDownEventId]);

  useEffect(() => {
    fetchHostData();
  }, []);

  // Header sync - must be reactive to activeView
  useLayoutEffect(() => {
    const getViewTitle = (view: string) => {
      switch(view) {
        case 'events': return 'Manage Events';
        case 'bets': return 'Manage Bets';
        case 'grading': return 'Ready for Grading';
        case 'pitches': return 'Master Inbox';
        case 'participants': return 'Manage Participants';
        case 'campaign': return 'Campaign Settings';
        default: return 'Host Control';
      }
    };

    navigation.setOptions({
      title: getViewTitle(activeView),
      headerBackTitle: '',
      headerLeft: () => (
        <BackButton
          onPress={() => {
            if (activeView === 'dashboard') {
              navigation.goBack();
            } else {
              setActiveView('dashboard');
            }
          }}
        />
      ),
    });
  }, [navigation, activeView]);

  useEffect(() => {

    const proposalSub = supabase.channel('public:guest_proposals')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'guest_proposals' }, () => fetchHostData(undefined, true)).subscribe();

    const pitchSub = supabase.channel('public:p2p_prop_bets')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'p2p_prop_bets' }, () => fetchHostData(undefined, true)).subscribe();

    const blindSub = supabase.channel('public:blind_matchups_host')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'blind_matchups' }, () => fetchHostData(undefined, true)).subscribe();

    const betsSub = supabase.channel('public:bets_host')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bets' }, () => fetchHostData(undefined, true)).subscribe();

    AsyncStorage.getItem('campaignJoinCode').then(code => setCampaignJoinCode(code || ''));

    return () => {
      supabase.removeChannel(proposalSub);
      supabase.removeChannel(pitchSub);
      supabase.removeChannel(blindSub);
      supabase.removeChannel(betsSub);
    };
  }, []);

  async function fetchHostData(overrideEventId?: string | null, silent: boolean = false) {
    if (!silent) setLoading(true);
    try {
      const myUserId = await AsyncStorage.getItem('userId');
      setCurrentUserId(myUserId);
      const campaignId = await AsyncStorage.getItem('campaignId');
      const storedCampaignName = await AsyncStorage.getItem('campaignName');
      setActiveCampaignId(campaignId);
      setActiveCampaignName(storedCampaignName || '');

      const { data: campaignData } = await supabase.from('campaigns').select('join_code').eq('id', campaignId).single();
      if (campaignData?.join_code) {
        setCampaignJoinCode(campaignData.join_code);
        await AsyncStorage.setItem('campaignJoinCode', campaignData.join_code);
      }

      const { data: participantData } = await supabase
        .from('campaign_participants')
        .select('global_point_balance')
        .eq('campaign_id', campaignId)
        .eq('user_id', myUserId)
        .single();

      if (participantData) {
        setWalletBalance(participantData.global_point_balance);
      }

      const { data: campaignEvents } = await supabase.from('events').select('id, name, status, start_time, trigger_type, description').eq('campaign_id', campaignId).order('start_time', { ascending: true });
      const eventsDataList = campaignEvents || [];
      setEventsList(eventsDataList);

      let targetEventId = overrideEventId !== undefined ? overrideEventId : activeEventSwitchId;
      if (!eventsDataList.some((e: any) => e.id === targetEventId)) {
        const fallbackEvent = eventsDataList.find((e: any) => e.status === 'live') || eventsDataList[0];
        if (fallbackEvent) {
          targetEventId = fallbackEvent.id;
          setActiveEventSwitchId(targetEventId);
        } else {
          setLoading(false);
          return;
        }
      }

      setActiveEventId(targetEventId);


      // 1. Participants
      const { data: pData } = await supabase.from('campaign_participants').select('user_id, role, users(display_name)').eq('campaign_id', campaignId);
      setParticipants(pData ?? []);

      // 2. Fetch Regular House Bets (Active & History)
      const { data: betsData } = await supabase
        .from('bets')
        .select(`id, question, status, event_id, created_at, bet_options!bet_options_bet_id_fkey ( id, label )`)
        .eq('campaign_id', campaignId)
        .in('status', ['open', 'locked', 'graded', 'canceled']);

      // 3. Fetch Approved P2P Bets (Active & History)
      const { data: approvedP2P } = await supabase
        .from('p2p_prop_bets')
        .select('*, users!p2p_prop_bets_proposer_id_fkey(display_name)')
        .eq('campaign_id', campaignId)
        .in('status', ['open', 'locked', 'resolved', 'canceled']);

      // 4. Fetch Blind Matchups (Active & History)
      const { data: blindData } = await supabase
        .from('blind_matchups')
        .select('*')
        .eq('campaign_id', campaignId)
        .in('status', ['open', 'matched', 'resolved', 'canceled']);

      const globalId = eventsDataList.find((e: any) => e.name === 'Global')?.id;
      const safeBets = (betsData ?? []).map(b => ({ ...b, event_id: b.event_id || globalId }));
      const safeP2P = (approvedP2P ?? []).map(p => ({ ...p, isP2P: true, event_id: p.event_id || globalId }));
      const safeBlind = (blindData ?? []).map(b => ({ ...b, isBlind: true, event_id: b.event_id || globalId }));
      const allBets = [...safeBlind, ...safeP2P, ...safeBets];
      
      // Sort by creation time to keep order stable, fallback to ID for deterministic sorting
      setBets(allBets.sort((a, b) => {
        const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
        if (timeA !== timeB) return timeA - timeB;
        return a.id.localeCompare(b.id);
      }));

      // 5. Fetch Inbox 1: Ideas
      const { data: propsData } = await supabase.from('guest_proposals').select('id, suggestion, event_id, created_at, users(display_name)').eq('campaign_id', campaignId).eq('status', 'pending');
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
        .eq('campaign_id', campaignId)
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

  const getUnifiedPitches = () => {
    const list: any[] = [];

    // Props from guest_proposals
    proposals.forEach(p => {
      list.push({
        id: p.id,
        type: 'prop',
        question: p.suggestion,
        proposer: p.users?.display_name || 'Guest',
        created_at: p.created_at,
        sourceTable: 'guest_proposals',
        raw: p,
        event_id: p.event_id
      });
    });

    // House Pushes from bets
    pendingHouseBets.forEach(b => {
      list.push({
        id: b.id,
        type: b.type, // 'prop' or 'over_under'
        question: b.question,
        proposer: b.users?.display_name || 'Host',
        created_at: b.created_at,
        options: b.bet_options,
        sourceTable: 'bets',
        raw: b,
        event_id: b.event_id
      });
    });

    // P2P Challenges
    pendingPitches.forEach(p => {
      list.push({
        id: p.id,
        type: 'p2p',
        question: p.question,
        proposer: p.users?.display_name || 'Guest',
        created_at: p.created_at,
        sourceTable: 'p2p_prop_bets',
        raw: p,
        event_id: p.event_id
      });
    });

    // Blind Matchups
    pendingBlindBets.forEach(b => {
      list.push({
        id: b.id,
        type: 'blind',
        question: b.question,
        proposer: b.users?.display_name || 'Guest',
        created_at: b.created_at,
        sourceTable: 'blind_matchups',
        raw: b,
        event_id: b.event_id
      });
    });

    return list.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  };

  // --- UNIFIED PITCH ACTIONS ---
  async function handleApproveUnifiedPitch(pitch: any) {
    try {
      const { sourceTable, id } = pitch;
      const { error } = await supabase.from(sourceTable).update({ status: 'open' }).eq('id', id);
      if (error) throw error;
      fetchHostData(activeEventId, true);
    } catch (err: any) {
      Alert.alert('Approval Failed', err.message);
    }
  }

  async function handleRejectUnifiedPitch(pitch: any) {
    try {
      const { sourceTable, id } = pitch;
      const { error } = await supabase.from(sourceTable).update({ status: 'rejected' }).eq('id', id);
      if (error) throw error;
      fetchHostData(activeEventId, true);
    } catch (err: any) {
      Alert.alert('Rejection Failed', err.message);
    }
  }

  function handleEditUnifiedPitch(pitch: any) {
    // Reset form first
    setNewQuestion(pitch.question || '');
    setBetType(pitch.type);
    setHostEventScope(pitch.event_id || getGlobalEventId());
    setEditingPitch(pitch);
    setEditingEvent(null);

    if (pitch.sourceTable === 'bets') {
      const opts = (pitch.raw.bet_options || []).map((o: any, idx: number) => ({ 
        id: idx + 1, 
        label: o.label, 
        odds: String(o.multiplier || '2.0') 
      }));
      setNewOptions(opts.length > 0 ? opts : [{ id: 1, label: '', odds: '2.0' }, { id: 2, label: '', odds: '2.0' }]);
    } else if (pitch.sourceTable === 'p2p_prop_bets' || pitch.sourceTable === 'blind_matchups') {
      setP2pOptionA(pitch.raw.option_a_label || pitch.raw.side_a_label || '');
      setP2pOptionB(pitch.raw.option_b_label || pitch.raw.side_b_label || '');
      setP2pWager(String(pitch.raw.wager_amount || pitch.raw.base_amount || ''));
      setP2pMultiplier(String(pitch.raw.multiplier || pitch.raw.user_1_bid_multiplier || ''));
    }

    setCreateModalVisible(true);
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
        if (editingPitch && editingPitch.sourceTable === 'blind_matchups') {
          // --- UPDATE EXISTING BLIND PITCH ---
          const { error } = await supabase.from('blind_matchups').update({
            event_id: hostEventScope,
            question: newQuestion,
            side_a_label: p2pOptionA,
            side_b_label: p2pOptionB,
            base_amount: baseAmt,
            user_1_bid_multiplier: multiAmt,
            status: 'open'
          }).eq('id', editingPitch.id);
          if (error) throw error;
        } else {
          // --- INSERT NEW BLIND BET ---
          const { error } = await supabase.from('blind_matchups').insert([{
            campaign_id: activeCampaignId,
            event_id: hostEventScope,
            question: newQuestion,
            side_a_label: p2pOptionA,
            side_b_label: p2pOptionB,
            base_amount: baseAmt,
            user_1_id: currentUserId,
            user_1_bid_multiplier: multiAmt,
            status: 'open'
          }]);
          if (error) throw error;
        }

        setNewQuestion(''); setP2pOptionA('Yes'); setP2pOptionB('No'); setBlindBase('100'); setBlindMultiplier('2.0');
        setEditingPitch(null);
        setCreateModalVisible(false);
        fetchHostData(activeEventId, true);
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
        if (editingPitch && editingPitch.sourceTable === 'p2p_prop_bets') {
          // --- UPDATE EXISTING P2P PITCH ---
          const { error } = await supabase.from('p2p_prop_bets').update({
            event_id: hostEventScope,
            question: newQuestion,
            option_a_label: p2pOptionA,
            option_b_label: p2pOptionB,
            wager_amount: wagerAmt,
            multiplier: multiAmt,
            status: 'open'
          }).eq('id', editingPitch.id);
          if (error) throw error;
        } else {
          // --- INSERT NEW P2P BET ---
          const { error } = await supabase.from('p2p_prop_bets').insert([{
            campaign_id: activeCampaignId,
            event_id: hostEventScope,
            proposer_id: currentUserId,
            question: newQuestion,
            option_a_label: p2pOptionA,
            option_b_label: p2pOptionB,
            wager_amount: wagerAmt,
            multiplier: multiAmt,
            status: 'open'
          }]);
          if (error) throw error;
        }

        setNewQuestion(''); setP2pOptionA('Yes'); setP2pOptionB('No'); setP2pWager('100'); setP2pMultiplier('2.0');
        setEditingPitch(null);
        setCreateModalVisible(false);
        fetchHostData(activeEventId, true);
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
        const currentCampId = activeCampaignId || await AsyncStorage.getItem('campaignId');
        let finalBetId: string;

        if (editingPitch && editingPitch.sourceTable === 'bets') {
          // --- UPDATE EXISTING HOUSE PITCH ---
          const { error: betUpdateError } = await supabase
            .from('bets')
            .update({
              event_id: hostEventScope,
              type: betType,
              question: newQuestion,
              status: 'open'
            })
            .eq('id', editingPitch.id);
          if (betUpdateError) throw betUpdateError;
          finalBetId = editingPitch.id;
          
          // Delete old options and re-insert
          await supabase.from('bet_options').delete().eq('bet_id', finalBetId);
        } else {
          // --- INSERT NEW HOUSE BET ---
          const { data: betData, error: betError } = await supabase
            .from('bets')
            .insert([{
              event_id: hostEventScope,
              type: betType,
              question: newQuestion,
              status: 'open',
              campaign_id: currentCampId,
              creator_id: currentUserId
            }])
            .select().single();
          if (betError) throw betError;
          finalBetId = betData.id;

          if (editingPitch && editingPitch.sourceTable === 'guest_proposals') {
             await supabase.from('guest_proposals').update({ status: 'approved' }).eq('id', editingPitch.id);
          }
        }

      const optionsToInsert = validOptions.map(opt => ({
        bet_id: finalBetId, label: opt.label, multiplier: parseFloat(opt.odds) || 1.0
      }));

      await supabase.from('bet_options').insert(optionsToInsert);

      setNewQuestion(''); setEditingPitch(null); handleToggleBetType('prop');
      setCreateModalVisible(false); fetchHostData(activeEventId, true);
    } catch (error: any) {
      Platform.OS === 'web' ? window.alert(`Error\n\n${error.message}`) : Alert.alert('Error', error.message);
    } finally { setIsCreating(false); }
  }

  // ==========================================
  // --- BET MANAGEMENT ACTIONS ---
  // ==========================================
  async function handleVoidBet(betId: string) {
    const targetBet = bets.find(b => b.id === betId);
    if (!targetBet) return;
    const title = 'Void & Refund Bet?';
    const msg = 'Keep the record but refund all points to players?';

    const executeVoid = async () => {
      try {
        if (targetBet.isP2P) {
          const { error } = await supabase.rpc('void_p2p_bet_and_refund', { p_bet_id: betId });
          if (error) throw error;
        } else if (targetBet.isBlind) {
          const { error } = await supabase.rpc('void_blind_match_and_refund', { p_matchup_id: betId });
          if (error) throw error;
        } else {
          const { error } = await supabase.rpc('void_bet_and_refund', { p_bet_id: betId });
          if (error) throw error;
        }
        fetchHostData();
      } catch (error: any) {
        if (Platform.OS === 'web') window.alert(error.message);
        else Alert.alert('Error Voiding Bet', error.message);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`${title}\n\n${msg}`)) executeVoid();
    } else {
      Alert.alert(title, msg, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Void & Refund', style: 'destructive', onPress: executeVoid }
      ]);
    }
  }

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
      fetchHostData(activeEventId, true); // Silent refresh
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
          p_winning_option_id: winningOptionId,
          p_campaign_id: activeCampaignId,
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

  async function handleDeleteCampaign() {
    if (Platform.OS === 'web') {
      if (window.confirm(`DELETE CAMPAIGN FOREVER\n\n"${activeCampaignName}" and ALL its data will be permanently erased. There is NO undo.\n\nAre you absolutely sure?`)) {
        try {
          const { error } = await supabase.rpc('delete_campaign', { p_campaign_id: activeCampaignId });
          if (error) throw error;
          await AsyncStorage.removeItem('campaignId');
          await AsyncStorage.removeItem('campaignName');
          navigation.reset({ index: 0, routes: [{ name: 'Campaigns' }] });
        } catch (err: any) {
        window.alert(err.message);
        }
      }
    } else {
      setConfirmCampaignName('');
      setDeleteCampaignModalVisible(true);
    }
  }

  // --- SUB-VIEW RENDERERS ---

  const renderEventsView = () => (
    <View style={styles.subViewContainer}>
      <View style={styles.subViewHeader}>
        <TouchableOpacity 
          style={styles.addEventBtnSmall} 
          onPress={() => { setEditingEvent(null); setEventFormVisible(true); }}
        >
          <Text style={styles.addEventBtnTextSmall}>+ New Event</Text>
        </TouchableOpacity>
      </View>

      {eventsList.length > 0 ? (
        eventsList.map(event => (
          <HostEventController
            key={event.id}
            event={event as any}
            onEventChanged={(silent) => fetchHostData(activeEventId, silent)}
            onEditRequest={() => { setEditingEvent(event as any); setEventFormVisible(true); }}
          />
        ))
      ) : (
        <Text style={styles.emptyText}>No events created yet.</Text>
      )}
    </View>
  );

  const renderBetsView = () => {
    const globalId = getGlobalEventId();
    const currentFilterId = drillDownEventId || globalId;
    // Unified management: show all bets except pending ideas
    const activeBets = bets.filter(b => ['open', 'locked', 'matched', 'graded', 'resolved', 'canceled'].includes(b.status));
    
    return (
      <View style={styles.subViewContainer}>
        <View style={styles.subViewHeader}>
          <TouchableOpacity 
            style={styles.addBetBtnSmall} 
            onPress={() => { setNewQuestion(''); setHostEventScope(currentFilterId); setCreateModalVisible(true); }}
          >
            <Text style={styles.addBetBtnTextSmall}>+ Push Bet</Text>
          </TouchableOpacity>
        </View>

        <View style={{ marginBottom: 20 }}>
          <Text style={styles.filterLabel}>Filter by Event:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row' }}>
            {eventsList.map((e: any) => (
              <TouchableOpacity
                key={e.id}
                style={[styles.scopePill, drillDownEventId === e.id && styles.scopePillActive]}
                onPress={() => setDrillDownEventId(e.id)}
              >
                <Text style={[styles.scopePillText, drillDownEventId === e.id && styles.scopePillTextActive]}>{e.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {activeBets.filter(b => b.event_id === currentFilterId).length > 0 ? (
          activeBets.filter(b => b.event_id === currentFilterId).map(item => (
            <HostBetController
              key={item.id}
              bet={{
                ...item,
                event_name: eventsList.find((e: any) => e.id === item.event_id)?.name
              } as any}
              onStatusToggle={toggleBetStatus}
              onGradeRequest={openGradeModal}
              onDeleteRequest={() => handleDeleteBet(item.id)}
              onRefundRequest={() => handleVoidBet(item.id)}
            />
          ))
        ) : (
          <Text style={styles.emptyText}>Nothing to manage for this event scope.</Text>
        )}
      </View>
    );
  };


  const renderPitchesView = () => {
    const allPitches = getUnifiedPitches();
    const globalId = getGlobalEventId();
    const currentFilterId = drillDownEventId || globalId;
    
    // Filter by Event
    const filteredPitches = allPitches.filter(p => !p.event_id || p.event_id === currentFilterId);

    const renderPitchItem = (pitch: any) => {
      const isMenuOpen = editingPitch?.id === pitch.id;
      
      return (
        <View key={`${pitch.sourceTable}-${pitch.id}`} style={styles.pitchCard}>
          <View style={styles.pitchDetails}>
            <View style={styles.pitchHeaderRow}>
              <Text style={styles.pitchProposer}>👤 {pitch.proposer.toUpperCase()}</Text>
              <Text style={styles.pitchTime}>{new Date(pitch.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
            </View>
            <Text style={styles.pitchQuestion}>{pitch.question}</Text>
            
            {(pitch.options && pitch.options.length > 0) || (pitch.sourceTable === 'p2p_prop_bets' || pitch.sourceTable === 'blind_matchups') ? (
              <View style={styles.pitchOptions}>
                {pitch.options ? pitch.options.map((opt: any, idx: number) => (
                  <Text key={idx} style={styles.pitchOptionText}>
                    {opt.label}{opt.multiplier ? ` (${opt.multiplier}x)` : ''}{idx < pitch.options.length - 1 ? ' • ' : ''}
                  </Text>
                )) : (
                  <Text style={styles.pitchOptionText}>
                    {pitch.raw.option_a_label || pitch.raw.side_a_label} vs {pitch.raw.option_b_label || pitch.raw.side_b_label}
                  </Text>
                )}
              </View>
            ) : null}

            {(pitch.type === 'p2p' || pitch.type === 'blind') && (
              <Text style={styles.pitchTypeTag}>🏷️ {pitch.type.toUpperCase()}</Text>
            )}
          </View>

          <View style={styles.pitchActions}>
            <View style={{ width: '100%', alignItems: 'flex-end', position: 'relative', zIndex: 10 }}>
              <TouchableOpacity onPress={() => setEditingPitch(editingPitch?.id === pitch.id ? null : pitch)} style={styles.pitchMenuBtn}>
                <MaterialCommunityIcons name="dots-horizontal" size={20} color="#888" />
              </TouchableOpacity>
              
              {isMenuOpen && (
                <View style={styles.pitchPopupMenu}>
                  <TouchableOpacity style={styles.pitchMenuItem} onPress={() => { handleEditUnifiedPitch(pitch); }}>
                    <Text style={styles.pitchMenuItemText}>✏️ Edit Pitch</Text>
                  </TouchableOpacity>
                  <View style={styles.pitchMenuDivider} />
                  <TouchableOpacity style={styles.pitchMenuItem} onPress={() => { handleRejectUnifiedPitch(pitch); setEditingPitch(null); }}>
                    <Text style={styles.pitchMenuItemRed}>🗑️ Delete Pitch</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            <TouchableOpacity 
              style={styles.approveBtn} 
              onPress={() => handleApproveUnifiedPitch(pitch)}
            >
              <Text style={styles.approveBtnText}>APPROVE</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    };

    const renderGroup = (title: string, typeFilters: string[]) => {
      const items = filteredPitches.filter(p => typeFilters.includes(p.type));
      if (items.length === 0) return null;
      return (
        <View style={{ marginBottom: 25 }}>
          <Text style={styles.groupTitle}>{title}</Text>
          {items.map(renderPitchItem)}
        </View>
      );
    };

    return (
      <View style={styles.subViewContainer}>
        <View style={{ marginBottom: 20 }}>
          <Text style={styles.filterLabel}>Filter by Event:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row' }}>
            {eventsList.map((e: any) => (
              <TouchableOpacity
                key={e.id}
                style={[styles.scopePill, currentFilterId === e.id && styles.scopePillActive]}
                onPress={() => setDrillDownEventId(e.id)}
              >
                <Text style={[styles.scopePillText, currentFilterId === e.id && styles.scopePillTextActive]}>{e.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {filteredPitches.length === 0 ? (
          <Text style={styles.emptyText}>No pending pitches for this event.</Text>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false}>
            {renderGroup('PROPS', ['prop'])}
            {renderGroup('OVER / UNDER', ['over_under'])}
            {renderGroup('P2P CHALLENGES', ['p2p'])}
            {renderGroup('BLIND MATCHUPS', ['blind'])}
          </ScrollView>
        )}
      </View>
    );
  };

  const renderParticipantsView = () => (
    <View style={styles.subViewContainer}>
      <View style={styles.crewContainer}>
        {participants.map(p => (
          <TouchableOpacity
            key={p.user_id}
            style={styles.crewCard}
            onPress={() => { setSelectedParticipant(p); setViewingPlayerLedger(false); setPlayerActionSheetVisible(true); }}
          >
            <View>
              <Text style={styles.crewName}>{p.users.display_name}</Text>
              <Text style={p.role === 'host' ? styles.crewRoleHost : styles.crewRoleGuest}>
                {p.role.toUpperCase()}
              </Text>
            </View>
            <Text style={{ color: '#555', fontSize: 18 }}>›</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderCampaignView = () => (
    <View style={styles.subViewContainer}>
      <View style={styles.settingsGroup}>
        <Text style={styles.label}>Campaign Join Code</Text>
        <View style={styles.codeRow}>
          <Text style={styles.joinCodeText}>{campaignJoinCode}</Text>
        </View>
        <Text style={styles.joinCodeSub}>Players enter this to join your event.</Text>
      </View>

        <TouchableOpacity style={styles.closeBoardBtn} onPress={handleCloseBoard}>
          <Text style={styles.closeBoardBtnText}>🛑 Close Board & End Event</Text>
          <Text style={styles.closeBoardBtnSub}>Refunds all ungraded bets and locks results.</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.deleteCampaignBtn} onPress={handleDeleteCampaign}>
          <Text style={styles.deleteCampaignBtnText}>🗑️ Delete Campaign Forever</Text>
          <Text style={styles.deleteCampaignBtnSub}>Permanent erase. NO UNDO.</Text>
        </TouchableOpacity>
      </View>
    );

  // --- DASHBOARD RENDERERS ---
  const renderDashboard = () => {
    const tiles = [
      { id: 'events', title: 'Manage Events', icon: '📅', color: '#00D084', desc: 'Timing & Status' },
      { id: 'bets', title: 'Manage Bets', icon: '🎲', color: '#FFD700', desc: 'Lock & Settle' },
      { id: 'pitches', title: 'Manage Pitches', icon: '📥', color: '#03DAC6', desc: 'Guest Ideas' },
      { id: 'participants', title: 'Manage Participants', icon: '👥', color: '#CF6679', desc: 'Roles & Ledger' },
      { id: 'campaign', title: 'Manage Campaign', icon: '⚙️', color: '#a0a0a0', desc: 'Settings & Nuke' },
    ];

    return (
      <ScrollView contentContainerStyle={styles.dashboardGrid}>
        {tiles.map(tile => (
          <TouchableOpacity 
            key={tile.id} 
            style={styles.tile} 
            onPress={() => setActiveView(tile.id as any)}
          >
            <View style={[styles.tileIconContainer, { backgroundColor: tile.color + '20' }]}>
              <Text style={styles.tileIcon}>{tile.icon}</Text>
            </View>
            <Text style={styles.tileTitle}>{tile.title}</Text>
            <Text style={styles.tileDesc}>{tile.desc}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    );
  };

  // --- SHARED MODAL COMPONENTS ---
  const PlayerActionSheet = () => (
    <Modal visible={playerActionSheetVisible} transparent animationType="slide" onRequestClose={() => setPlayerActionSheetVisible(false)}>
      <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }} activeOpacity={1} onPress={() => !viewingPlayerLedger && setPlayerActionSheetVisible(false)}>
        <View style={{ 
          backgroundColor: '#1e1e1e', 
          borderTopLeftRadius: 20, 
          borderTopRightRadius: 20, 
          padding: 20, 
          minHeight: viewingPlayerLedger ? '80%' : 'auto',
          maxHeight: Dimensions.get('window').height * 0.85 // 🚨 THE FIX: Constrain height to 85% of screen
        }}>
          {!viewingPlayerLedger ? (
            <>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>{selectedParticipant?.users?.display_name}</Text>
                <Text style={{ color: '#a0a0a0', fontSize: 13 }}>{selectedParticipant?.role?.toUpperCase()}</Text>
              </View>
              <TouchableOpacity
                style={{ backgroundColor: '#121212', padding: 16, borderRadius: 10, borderWidth: 1, borderColor: '#333', marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 12 }}
                onPress={() => setViewingPlayerLedger(true)}
              >
                <Text style={{ fontSize: 20 }}>📜</Text>
                <View>
                  <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 15 }}>View Ledger</Text>
                  <Text style={{ color: '#666', fontSize: 12, marginTop: 2 }}>Full transaction history</Text>
                </View>
              </TouchableOpacity>
              {selectedParticipant?.role === 'guest' && (
                <TouchableOpacity
                  style={{ backgroundColor: '#121212', padding: 16, borderRadius: 10, borderWidth: 1, borderColor: '#333', marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 12 }}
                  onPress={() => { setPlayerActionSheetVisible(false); handleElevateHost(selectedParticipant.user_id, selectedParticipant.users.display_name); }}
                >
                  <Text style={{ fontSize: 20 }}>👑</Text>
                  <View>
                    <Text style={{ color: '#FFD700', fontWeight: 'bold', fontSize: 15 }}>Make Co-Host</Text>
                    <Text style={{ color: '#666', fontSize: 12, marginTop: 2 }}>Grant host permissions</Text>
                  </View>
                </TouchableOpacity>
              )}
              {selectedParticipant?.role === 'host' && selectedParticipant?.user_id !== currentUserId && (
                <TouchableOpacity
                  style={{ backgroundColor: '#121212', padding: 16, borderRadius: 10, borderWidth: 1, borderColor: '#ff4444', marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 12 }}
                  onPress={() => { setPlayerActionSheetVisible(false); handleRevokeHost(selectedParticipant.user_id, selectedParticipant.users.display_name); }}
                >
                  <Text style={{ fontSize: 20 }}>🚫</Text>
                  <View>
                    <Text style={{ color: '#ff4444', fontWeight: 'bold', fontSize: 15 }}>Revoke Host</Text>
                    <Text style={{ color: '#666', fontSize: 12, marginTop: 2 }}>Remove host permissions</Text>
                  </View>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => setPlayerActionSheetVisible(false)} style={{ marginTop: 6, padding: 14, alignItems: 'center' }}>
                <Text style={{ color: '#666', fontSize: 15 }}>Cancel</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                <TouchableOpacity onPress={() => setViewingPlayerLedger(false)} style={{ marginRight: 12, marginLeft: -5 }}>
                  <MaterialCommunityIcons name="chevron-left" size={32} color="#00D084" />
                </TouchableOpacity>
                <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>{selectedParticipant?.users?.display_name}'s Ledger</Text>
              </View>
              <LedgerTab
                userId={selectedParticipant?.user_id}
                campaignId={activeCampaignId}
                displayName={selectedParticipant?.users?.display_name}
                hideHeader={true}
              />
            </>
          )}
        </View>
      </TouchableOpacity>
    </Modal>
  );

  if (loading) return <View style={styles.container}><ActivityIndicator size="large" color="#FFD700" /></View>;

  return (
    <View style={{ flex: 1, backgroundColor: '#121212' }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {activeView === 'dashboard' ? renderDashboard() : (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ flexGrow: 1 }}
            keyboardShouldPersistTaps="handled"
          >
             {activeView === 'events' && renderEventsView()}
             {activeView === 'bets' && renderBetsView()}
             {activeView === 'grading' && renderGradingView()}
             {activeView === 'pitches' && renderPitchesView()}
             {activeView === 'participants' && renderParticipantsView()}
             {activeView === 'campaign' && renderCampaignView()}
          </ScrollView>
        )}
      </KeyboardAvoidingView>

      {/* Shared Modals */}
      <PlayerActionSheet />
      <EventFormModal
        visible={eventFormVisible}
        existingEvent={editingEvent}
        campaignId={activeCampaignId}
        onClose={() => setEventFormVisible(false)}
        onSaveComplete={() => setEventFormVisible(false)}
      />
      
      <Modal visible={createModalVisible} transparent={true} animationType="slide" statusBarTranslucent={true}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Push Live Bet</Text>
              <TouchableOpacity onPress={() => { setCreateModalVisible(false); setEditingPitch(null); }}><Text style={styles.closeText}>Cancel</Text></TouchableOpacity>
            </View>
            <View style={{ marginBottom: 15 }}>
              <Text style={{ color: '#e0e0e0', fontSize: 13, fontWeight: 'bold', marginBottom: 8 }}>Link to Action:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row' }}>
                {eventsList.map((e: any) => (
                  <TouchableOpacity
                    key={e.id}
                    style={[styles.scopePill, hostEventScope === e.id && styles.scopePillActive]}
                    onPress={() => setHostEventScope(e.id)}
                  >
                    <Text style={[styles.scopePillText, hostEventScope === e.id && styles.scopePillTextActive]}>{e.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
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
                <>
                  <Text style={{ color: '#BB86FC', fontSize: 14, fontWeight: 'bold', marginBottom: 5 }}>The Scenario</Text>
                  <TextInput style={styles.input} placeholder="e.g., PRX vs NRG" placeholderTextColor="#666" value={newQuestion} onChangeText={setNewQuestion} />
                  <View style={{ flexDirection: 'row', gap: 10, marginBottom: 5 }}>
                    <View style={{ flex: 1 }}><Text style={styles.label}>Team A</Text><TextInput style={styles.input} value={p2pOptionA} onChangeText={setP2pOptionA} placeholder="PRX" placeholderTextColor="#666" /></View>
                    <View style={{ flex: 1 }}><Text style={styles.label}>Team B</Text><TextInput style={styles.input} value={p2pOptionB} onChangeText={setP2pOptionB} placeholder="NRG" placeholderTextColor="#666" /></View>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 10, marginBottom: 5 }}>
                    <View style={{ flex: 1 }}><Text style={{ color: '#BB86FC', fontSize: 14, fontWeight: 'bold', marginBottom: 5 }}>Base Unit</Text><TextInput style={styles.input} keyboardType="numeric" value={blindBase} onChangeText={setBlindBase} placeholder="100" /></View>
                    <View style={{ flex: 1 }}><Text style={{ color: '#BB86FC', fontSize: 14, fontWeight: 'bold', marginBottom: 5 }}>Odds (x)</Text><TextInput style={styles.input} keyboardType="decimal-pad" value={blindMultiplier} onChangeText={updateMultiplier}/></View>
                    <View style={{ flex: 1 }}><Text style={{ color: '#BB86FC', fontSize: 14, fontWeight: 'bold', marginBottom: 5 }}>Win (%)</Text><TextInput style={styles.input} keyboardType="number-pad" value={blindPercent} onChangeText={updatePercent}/></View>
                  </View>
                </>
              ) : betType === 'p2p' ? (
                <>
                  <Text style={styles.label}>The Scenario</Text>
                  <TextInput style={styles.input} placeholder="e.g., Will Chris spill his drink?" placeholderTextColor="#666" value={newQuestion} onChangeText={setNewQuestion} />
                  <View style={{ flexDirection: 'row', gap: 10, marginBottom: 5 }}>
                    <View style={{ flex: 1 }}><Text style={styles.label}>Option A</Text><TextInput style={styles.input} value={p2pOptionA} onChangeText={setP2pOptionA} placeholder="Yes" placeholderTextColor="#666" /></View>
                    <View style={{ flex: 1 }}><Text style={styles.label}>Option B</Text><TextInput style={styles.input} value={p2pOptionB} onChangeText={setP2pOptionB} placeholder="No" placeholderTextColor="#666" /></View>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 10, marginBottom: 5 }}>
                    <View style={{ flex: 1 }}><Text style={styles.label}>Risk</Text><TextInput style={styles.input} keyboardType="numeric" value={p2pWager} onChangeText={(text) => setP2pWager(sanitizeNumber(text))} /></View>
                    <View style={{ flex: 1 }}><Text style={styles.label}>Odds (x)</Text><TextInput style={styles.input} keyboardType="decimal-pad" value={p2pMultiplier} onChangeText={updateP2PMultiplier} /></View>
                    <View style={{ flex: 1 }}><Text style={styles.label}>Win (%)</Text><TextInput style={styles.input} keyboardType="number-pad" value={p2pPercent} onChangeText={updateP2PPercent} /></View>
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.label}>The Question</Text>
                  <TextInput style={styles.input} placeholder={betType === 'over_under' ? "e.g., Number of foul calls: 4.5" : "e.g., Who wins the first hand of poker?"} placeholderTextColor="#666" value={newQuestion} onChangeText={setNewQuestion} />
                  <Text style={styles.label}>Options & Payouts</Text>
                  {newOptions.map((opt) => (
                    <View key={opt.id} style={styles.optionRow}>
                      <TextInput style={[styles.input, { flex: 3, marginRight: 8, marginBottom: 0 }]} value={opt.label} onChangeText={(text) => updateOption(opt.id, 'label', text)} editable={betType !== 'over_under'} />
                      <TextInput style={[styles.input, { flex: 2, marginBottom: 0 }]} keyboardType="decimal-pad" value={opt.odds} onChangeText={(text) => updateOption(opt.id, 'odds', sanitizeNumber(text))} />
                    </View>
                  ))}
                  {betType === 'prop' && <TouchableOpacity style={styles.addOptionBtn} onPress={handleAddOption}><Text style={styles.addOptionText}>+ Add Another Option</Text></TouchableOpacity>}
                </>
              )}
            </ScrollView>
            <TouchableOpacity style={styles.submitBtn} onPress={handlePublishBet} disabled={isCreating}><Text style={styles.submitBtnText}>{isCreating ? 'Creating...' : 'Create Bet'}</Text></TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={gradeModalVisible} transparent={true} animationType="fade" statusBarTranslucent={true}>
        <View style={styles.modalOverlayCenter}>
          <View style={styles.gradeModalContent}>
            <Text style={styles.modalTitle}>Who Won?</Text>
            <Text style={styles.modalSubtitle}>{selectedBet?.question}</Text>
            {selectedBet?.bet_options?.map((option: any) => (
              <TouchableOpacity key={option.id} style={styles.winnerButton} onPress={() => handleGradeBet(option.id)} disabled={isGrading}>
                <Text style={styles.winnerButtonText}>{isGrading ? 'Processing...' : `Winner: ${option.label}`}</Text>
              </TouchableOpacity>
            ))}
            {selectedBet?.isP2P && (
              <>
                 <TouchableOpacity style={styles.winnerButton} onPress={() => handleGradeBet('A')}><Text style={styles.winnerButtonText}>Winner: {selectedBet.option_a_label}</Text></TouchableOpacity>
                 <TouchableOpacity style={styles.winnerButton} onPress={() => handleGradeBet('B')}><Text style={styles.winnerButtonText}>Winner: {selectedBet.option_b_label}</Text></TouchableOpacity>
              </>
            )}
            <TouchableOpacity style={{ marginTop: 10, alignItems: 'center' }} onPress={() => setGradeModalVisible(false)}><Text style={styles.closeText}>Cancel</Text></TouchableOpacity>
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
  pitchMathBox: { backgroundColor: '#1e1e1e', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#444', marginBottom: 15 },
  pitchCard: {
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
    marginBottom: 12,
    flexDirection: 'row',
    overflow: 'visible',
    minHeight: 110,
  },
  pitchDetails: {
    flex: 1,
    padding: 16,
  },
  pitchHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  pitchProposer: {
    color: '#00D084',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  pitchTime: {
    color: '#666',
    fontSize: 10,
  },
  pitchQuestion: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 8,
    lineHeight: 20,
  },
  pitchOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  pitchOptionText: {
    color: '#888',
    fontSize: 11,
  },
  pitchTypeTag: {
    color: '#BB86FC',
    fontSize: 9,
    fontWeight: 'bold',
    backgroundColor: 'rgba(187, 134, 252, 0.1)',
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  pitchActions: {
    width: 100,
    padding: 8,
    borderLeftWidth: 1,
    borderLeftColor: '#2A2A2A',
    backgroundColor: 'rgba(0,0,0,0.15)',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pitchMenuBtn: {
    padding: 4,
  },
  pitchPopupMenu: {
    position: 'absolute',
    top: 30,
    right: 0,
    backgroundColor: '#2A2A2A',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#444',
    width: 140,
    zIndex: 100,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 10,
  },
  pitchMenuItem: {
    padding: 12,
  },
  pitchMenuItemText: {
    color: '#FFF',
    fontSize: 13,
  },
  pitchMenuItemRed: {
    color: '#FF4444',
    fontSize: 13,
    fontWeight: 'bold',
  },
  pitchMenuDivider: {
    height: 1,
    backgroundColor: '#444',
  },
  approveBtn: {
    backgroundColor: '#00D084',
    paddingVertical: 8,
    width: '100%',
    borderRadius: 6,
    alignItems: 'center',
  },
  approveBtnText: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 11,
    letterSpacing: 0.5,
  },
  groupTitle: {
    color: '#444',
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 1,
    marginBottom: 12,
    marginTop: 10,
    textTransform: 'uppercase',
  },

  // MODAL & FORM STYLES
  typeSelectorRow: { flexDirection: 'row', marginBottom: 15, backgroundColor: '#121212', borderRadius: 8, padding: 4 },
  typeBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 6 },
  typeBtnActive: { backgroundColor: '#FFD700' },
  scopePill: { paddingVertical: 8, paddingHorizontal: 14, alignItems: 'center', borderRadius: 20, backgroundColor: '#2a2a2a', borderWidth: 1, borderColor: '#444', marginRight: 8 },
  scopePillActive: { backgroundColor: '#FFD700', borderColor: '#FFD700' },
  scopePillText: { color: '#e0e0e0', fontWeight: '600', fontSize: 13 },
  scopePillTextActive: { color: '#000' },
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
  input: { backgroundColor: '#121212', color: '#fff', borderRadius: 8, paddingVertical: 15, paddingHorizontal: 15, borderWidth: 1, borderColor: '#333', marginBottom: 15 },
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

  // DASHBOARD STYLES
  dashboardGrid: { padding: 15, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingBottom: 40 },
  tile: { width: '48%', backgroundColor: '#1e1e1e', padding: 20, borderRadius: 20, marginBottom: 15, borderWidth: 1, borderColor: '#333', alignItems: 'center', justifyContent: 'center' },
  tileIconContainer: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  tileIcon: { fontSize: 30 },
  tileTitle: { color: '#fff', fontSize: 13, fontWeight: 'bold', marginBottom: 4, textAlign: 'center' },
  tileDesc: { color: '#666', fontSize: 11, textAlign: 'center' },

  // SUB-VIEW COMMON
  subViewContainer: { padding: 20, paddingBottom: 60 },
  subViewHeader: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginBottom: 20 },
  subViewTitle: { color: '#FFD700', fontSize: 24, fontWeight: 'bold' },
  addEventBtnSmall: { backgroundColor: 'rgba(0, 208, 132, 0.1)', borderWidth: 1, borderColor: '#00D084', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20 },
  addEventBtnTextSmall: { color: '#00D084', fontWeight: 'bold', fontSize: 13 },
  addBetBtnSmall: { backgroundColor: 'rgba(255, 215, 0, 0.1)', borderWidth: 1, borderColor: '#FFD700', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20 },
  addBetBtnTextSmall: { color: '#FFD700', fontWeight: 'bold', fontSize: 13 },
  filterLabel: { color: '#666', fontSize: 12, fontWeight: 'bold', marginBottom: 10, textTransform: 'uppercase' },

  // BET CARD ENHANCEMENTS
  betCardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  typeBadgeBlind: { color: '#BB86FC', fontSize: 10, fontWeight: 'bold', marginBottom: 4 },
  typeBadgeP2P: { color: '#FFD700', fontSize: 10, fontWeight: 'bold', marginBottom: 4 },
  statusBadgeOpen: { color: '#00D084', fontSize: 12, fontWeight: 'bold' },
  betActionRow: { flexDirection: 'row', gap: 10 },
  actionBtnTrash: { backgroundColor: 'rgba(255, 68, 68, 0.1)', borderWidth: 1, borderColor: '#ff4444', padding: 10, borderRadius: 6 },
  actionBtnTextTrash: { color: '#ff4444', fontWeight: 'bold' },
  actionBtnGrade: { backgroundColor: '#00D084', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 6 },
  actionBtnTextGrade: { color: '#000', fontWeight: 'bold' },

  // INBOX
  inboxSection: { marginBottom: 30 },

  // CAMPAIGN SETTINGS
  settingsGroup: { backgroundColor: '#1e1e1e', padding: 20, borderRadius: 15, borderWidth: 1, borderColor: '#333', marginBottom: 20 },
  codeRow: { backgroundColor: '#121212', padding: 15, borderRadius: 8, alignItems: 'center', marginVertical: 10 },
  joinCodeText: { color: '#FFD700', fontSize: 32, fontWeight: 'bold', letterSpacing: 5 },
  joinCodeSub: { color: '#666', fontSize: 12, textAlign: 'center' },
  closeBoardBtn: { backgroundColor: 'rgba(255, 68, 68, 0.1)', padding: 20, borderRadius: 15, borderWidth: 1, borderColor: '#ff4444', marginBottom: 15 },
  closeBoardBtnText: { color: '#ff4444', fontSize: 16, fontWeight: 'bold', textAlign: 'center' },
  closeBoardBtnSub: { color: 'rgba(255, 68, 68, 0.5)', fontSize: 11, textAlign: 'center', marginTop: 4 },
  deleteCampaignBtn: { backgroundColor: 'transparent', padding: 20, borderRadius: 15, borderWidth: 1, borderColor: '#7f1d1d', marginBottom: 40 },
  deleteCampaignBtnText: { color: '#991b1b', fontSize: 16, fontWeight: 'bold', textAlign: 'center' },
  deleteCampaignBtnSub: { color: '#7f1d1d', fontSize: 11, textAlign: 'center', marginTop: 4 },
});