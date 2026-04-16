import React, { useState, useEffect, useLayoutEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Alert, Modal, ScrollView, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { supabase } from '../supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function CampaignScreen({ route, navigation }: any) {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [activeCampaigns, setActiveCampaigns] = useState<any[]>([]);
  const [joinCode, setJoinCode] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [isAnonymous, setIsAnonymous] = useState(true); // Default to true for safety
  
 // Grab the params safely. If they don't exist, default to an empty string.
  const [userId, setUserId] = useState<string>(route.params?.userId || '');
  const [currentUserName, setCurrentUserName] = useState<string>(route.params?.userName || '');
  const [isActionModalVisible, setIsActionModalVisible] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: () => null,    
      headerBackVisible: false,  
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 15 }}>
          <TouchableOpacity onPress={() => setIsActionModalVisible(true)} style={styles.headerBtn}>
            <MaterialCommunityIcons name="plus-circle-outline" size={26} color="#00D084" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('Settings', { userId, currentName: currentUserName })}>
            <MaterialCommunityIcons name="dots-vertical" size={26} color="#00D084" />
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation, userId, currentUserName]);

  useEffect(() => {
    async function loadUserData() {
      const storedId = await AsyncStorage.getItem('userId');
      const storedName = await AsyncStorage.getItem('userName');

      // 1. Ensure we have an ID
      if (!userId && storedId) {
        setUserId(storedId);
      }

      // 2. Did Settings just pass back a brand new name? Use it and save it!
      if (route.params?.updatedUserName) {
        setCurrentUserName(route.params.updatedUserName);
        // Save the newly edited name to phone memory!
        await AsyncStorage.setItem('userName', route.params.updatedUserName);
      } 
      // 3. Is the name blank because route.params missed it? Pull from memory!
      else if (!currentUserName && storedName) {
        setCurrentUserName(storedName);
      }
    }
    
    loadUserData();
    async function checkAuthStatus() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setIsAnonymous(user?.is_anonymous ?? true);
      }
    }
    checkAuthStatus();
  }, [route.params?.updatedUserName]);

  // Fetch campaigns ONLY after we have successfully loaded the userId
  useEffect(() => {
    if (userId) {
      fetchCampaigns();
    }
  }, [userId]);

  async function fetchCampaigns() {
    try {
      const { data, error } = await supabase
        .from('campaign_participants')
        .select(`
          campaign_id,
          global_point_balance,
          campaigns (
            id,
            name,
            status
          )
        `)
        .eq('user_id', userId);

      if (error) throw error;

      if (data) {
        // 2. Map the data and fetch ranks for each active campaign
        const mapped = await Promise.all(data.map(async (item: any) => {
          const balance = item.global_point_balance || 0;
          
          // Fetch the rank (count of participants with higher balance + 1)
          const { count } = await supabase
            .from('campaign_participants')
            .select('*', { count: 'exact', head: true })
            .eq('campaign_id', item.campaign_id)
            .gt('global_point_balance', balance);
          
          return {
            id: item.campaigns.id,
            name: item.campaigns.name,
            status: item.campaigns.status || 'active',
            points: balance,
            rank: (count || 0) + 1
          };
        }));

        setActiveCampaigns(mapped.filter((c: any) => c.status === 'active'));
      }
    } catch (error: any) {
      console.error("Error fetching campaigns:", error.message);
    }
  }

  async function handleJoinWithCode() {
    if (!joinCode || joinCode.length !== 6) {
      return Alert.alert('Invalid Code', 'Please enter a valid 6-digit room code.');
    }

    setIsJoining(true);
    try {
      const userId = await AsyncStorage.getItem('userId');
      if (!userId) throw new Error("Could not find your User ID.");

      const cleanCode = joinCode.trim().toUpperCase();

      // 1. Look up the campaign by the join code
      const { data: campaign, error: campaignError } = await supabase
        .from('campaigns')
        .select('id, name, status')
        .eq('join_code', cleanCode)
        .single();

      if (campaignError || !campaign) {
        throw new Error('Room not found. Double check the code!');
      }

      if (campaign.status === 'closed') {
        throw new Error('This event has already ended.');
      }

      // 2. Check if the user is already in this room
      const { data: existingParticipant } = await supabase
        .from('campaign_participants')
        .select('id')
        .eq('campaign_id', campaign.id)
        .eq('user_id', userId)
        .single();

      // 3. If they are new to the room, insert them and give them the bankroll
      if (!existingParticipant) {
        const { error: joinError } = await supabase
          .from('campaign_participants')
          .insert({
            campaign_id: campaign.id,
            user_id: userId,
            role: 'guest',
            global_point_balance: 10000 // The starting bankroll
          });

        if (joinError) throw joinError;

        // 🚨 ADD AUDIT TRAIL: Log initial balance in ledger
        const { error: ledgerError } = await supabase
          .from('ledger_entries')
          .insert({
            campaign_id: campaign.id,
            user_id: userId,
            transaction_type: 'adjustment',
            amount: 10000,
            memo: 'Initial Bankroll',
            running_balance: 10000
          });

        if (ledgerError) console.error("Could not log initial balance:", ledgerError);
      }

      // 4. Save to phone memory and route to the Dashboard
      await AsyncStorage.setItem('campaignId', campaign.id);
      await AsyncStorage.setItem('campaignName', campaign.name);
      
      setJoinCode(''); // Clear the input box for next time
      navigation.navigate('Dashboard');

    } catch (error: any) {
      Alert.alert('Error Joining', error.message);
    } finally {
      setIsJoining(false);
    }
  }

  async function selectCampaign(campaign: any) {
    try {
      // 1. Check if the user is already a participant
      const { data: existingParticipant } = await supabase
        .from('campaign_participants')
        .select('id')
        .eq('user_id', userId)
        .eq('campaign_id', campaign.id)
        .single();

      // 2. Give them a bankroll ONLY if they are new AND the board is still active
      if (!existingParticipant && campaign.status !== 'closed') {
        const { error: insertError } = await supabase
          .from('campaign_participants')
          .insert([{ 
            user_id: userId, 
            campaign_id: campaign.id, 
            role: 'guest', 
            global_point_balance: 10000 
          }]);

        if (insertError) throw insertError;

        // 🚨 ADD AUDIT TRAIL: Log initial balance in ledger
        const { error: ledgerError } = await supabase
          .from('ledger_entries')
          .insert({
            campaign_id: campaign.id,
            user_id: userId,
            transaction_type: 'adjustment',
            amount: 10000,
            memo: 'Initial Bankroll',
            running_balance: 10000
          });

        if (ledgerError) console.error("Could not log initial balance:", ledgerError);
      }

      // 3. Save the active campaign to the phone's memory
      await AsyncStorage.setItem('campaignId', campaign.id);
      await AsyncStorage.setItem('campaignName', campaign.name);

      // 4. THE CRITICAL ROUTING SPLIT
      if (campaign.status === 'closed') {
        // Send them to the Hall of Fame archive!
        navigation.navigate('ReadOnlyDashboard', { campaignName: campaign.name });
      } else {
        // Send them to the live betting floor!
        navigation.navigate('Dashboard', { currentUserName, campaignName: campaign.name });
      }

    } catch (error: any) {
      console.error('Error joining event', error.message);
    }
  }

  const renderActionModal = () => (
    <Modal visible={isActionModalVisible} transparent animationType="slide" onRequestClose={() => setIsActionModalVisible(false)}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setIsActionModalVisible(false)}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Join the Action</Text>
            <TouchableOpacity onPress={() => setIsActionModalVisible(false)}>
              <MaterialCommunityIcons name="close" size={24} color="#888" />
            </TouchableOpacity>
          </View>

          {/* JOIN SECTION */}
          <Text style={styles.modalLabel}>Got a room code?</Text>
          <View style={styles.joinBoxModal}>
            <TextInput
              style={styles.joinInputModal}
              placeholder="E.g. XYZ123"
              placeholderTextColor="#666"
              autoCapitalize="characters"
              maxLength={6}
              value={joinCode}
              onChangeText={setJoinCode}
            />
            <TouchableOpacity 
              style={[styles.joinBtnModal, (!joinCode || isJoining) && { opacity: 0.5 }]} 
              onPress={() => { handleJoinWithCode(); setIsActionModalVisible(false); }}
              disabled={!joinCode || isJoining}
            >
              <Text style={styles.joinBtnTextModal}>{isJoining ? '...' : 'Join'}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.modalDivider} />

          {/* HOST SECTION */}
          <TouchableOpacity 
            style={styles.hostBtnModal} 
            onPress={() => { setIsActionModalVisible(false); navigation.navigate('CreateGame'); }}
          >
            <Text style={styles.hostBtnTextModal}>👑 Host a New Game</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#121212' }}>
      <ScrollView 
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        bounces={true}
      >
        <View style={styles.container}>
          <View style={styles.welcomeContainer}>
            <Text style={styles.welcomeText}>Welcome, {currentUserName || 'Player'}!</Text>
            <Text style={styles.heroText}>Enter the action.</Text>
          </View>

          <Text style={styles.sectionTitle}>Live Action</Text>
          <View style={{ flex: 1 }}>
            {activeCampaigns.length === 0 ? (
              <View style={styles.emptyStateContainer}>
                <Text style={styles.emptyText}>No live events right now.</Text>
                <TouchableOpacity style={styles.secondaryJoinBtn} onPress={() => setIsActionModalVisible(true)}>
                  <Text style={styles.secondaryJoinBtnText}>+ Start Something</Text>
                </TouchableOpacity>
              </View>
            ) : (
              activeCampaigns.map((item) => (
                <TouchableOpacity key={item.id} style={styles.campaignCard} onPress={() => selectCampaign(item)}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.campaignName} numberOfLines={1}>{item.name}</Text>
                    <View style={styles.performanceStatsRow}>
                      <Text style={styles.performanceStat}>🪙 {item.points.toLocaleString()} pts</Text>
                      <Text style={styles.performanceStatSeparator}>•</Text>
                      <Text style={[styles.performanceStat, item.rank === 1 && { color: '#FFD700', fontWeight: 'bold' }]}>
                        🏆 Rank #{item.rank}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.liveBadge}>
                    <Text style={styles.liveBadgeText}>LIVE</Text>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>
        </View>
      </ScrollView>

      {renderActionModal()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212', padding: 25 },
  welcomeContainer: { marginBottom: 30, marginTop: 10 },
  welcomeText: { fontSize: 16, color: '#00D084', fontWeight: 'bold' },
  heroText: { fontSize: 32, fontWeight: 'bold', color: '#fff', marginTop: 4 },
  sectionTitle: { color: '#666', fontSize: 12, fontWeight: 'bold', marginBottom: 15, textTransform: 'uppercase', letterSpacing: 1 },
  emptyStateContainer: { alignItems: 'center', marginTop: 40 },
  emptyText: { color: '#666', fontSize: 15, fontStyle: 'italic', marginBottom: 20 },
  secondaryJoinBtn: { backgroundColor: '#1e1e1e', borderWidth: 1, borderColor: '#333', paddingVertical: 12, paddingHorizontal: 25, borderRadius: 20 },
  secondaryJoinBtnText: { color: '#00D084', fontWeight: 'bold' },
  campaignCard: { 
    backgroundColor: '#1e1e1e', 
    padding: 22, 
    borderRadius: 16, 
    marginBottom: 15, 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    borderWidth: 1, 
    borderColor: '#333',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 3
  },
  campaignName: { fontSize: 19, fontWeight: 'bold', color: '#fff' },
  performanceStatsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 8 },
  performanceStat: { color: '#888', fontSize: 13 },
  performanceStatSeparator: { color: '#444', fontSize: 13 },
  liveBadge: { backgroundColor: 'rgba(0, 208, 132, 0.15)', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 12 },
  liveBadgeText: { color: '#00D084', fontWeight: 'bold', fontSize: 10, letterSpacing: 0.5 },
  headerBtn: { marginRight: 5 },
  // MODAL STYLES
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  modalContent: { 
    backgroundColor: '#1a1a1a', 
    borderTopLeftRadius: 25, 
    borderTopRightRadius: 25, 
    padding: 25, 
    paddingBottom: Platform.OS === 'ios' ? 50 : 35,
    borderTopWidth: 1,
    borderTopColor: '#333'
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 25 },
  modalTitle: { fontSize: 24, fontWeight: 'bold', color: '#fff' },
  modalLabel: { color: '#00D084', fontSize: 12, fontWeight: 'bold', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 },
  joinBoxModal: { 
    flexDirection: Platform.OS === 'web' ? 'column' : 'row', // Vertical on web to avoid cutoff
    gap: 12, 
    marginBottom: 25 
  },
  joinInputModal: { 
    flex: Platform.OS === 'web' ? 0 : 1, 
    backgroundColor: '#121212', 
    borderWidth: 1, 
    borderColor: '#444', 
    borderRadius: 12, 
    color: '#00D084',
    fontSize: 22,
    fontWeight: 'bold',
    paddingHorizontal: 20,
    height: 60,
    letterSpacing: 2
  },
  joinBtnModal: { 
    backgroundColor: '#00D084', 
    paddingHorizontal: 25, 
    borderRadius: 12, 
    height: 60, 
    justifyContent: 'center',
    alignItems: 'center'
  },
  joinBtnTextModal: { color: '#000', fontWeight: 'bold', fontSize: 18 },
  modalDivider: { height: 1, backgroundColor: '#333', marginVertical: 15, marginBottom: 30 },
  hostBtnModal: { 
    backgroundColor: 'transparent', 
    borderWidth: 2, 
    borderColor: '#BB86FC', 
    paddingVertical: 18, 
    borderRadius: 12, 
    alignItems: 'center' 
  },
  hostBtnTextModal: { color: '#BB86FC', fontSize: 18, fontWeight: 'bold' },
});