import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Alert, FlatList, ScrollView, TextInput } from 'react-native';
import { supabase } from '../supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';



export default function CampaignScreen({ route, navigation }: any) {
  const { userId, userName } = route.params; // Catch the data passed from WelcomeScreen
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [activeCampaigns, setActiveCampaigns] = useState<any[]>([]);
  const [closedCampaigns, setClosedCampaigns] = useState<any[]>([]);
  const [joinCode, setJoinCode] = useState('');
  const [isJoining, setIsJoining] = useState(false);

  useEffect(() => {
    fetchCampaigns();
  }, []);

  async function fetchCampaigns() {
    try {
      // 1. Fetch the campaigns this user is part of, WITH the new status column
      const { data, error } = await supabase
        .from('campaign_participants')
        .select(`
          campaign_id,
          campaigns (
            id,
            name,
            status
          )
        `)
        .eq('user_id', userId);

      if (error) throw error;

      if (data) {
        // 2. Flatten the data so it's easy to read
        const mapped = data.map((item: any) => ({
          id: item.campaigns.id,
          name: item.campaigns.name,
          // If status is null for some reason, default it to 'active'
          status: item.campaigns.status || 'active' 
        }));

        // 3. Split them into the two buckets
        setActiveCampaigns(mapped.filter((c: any) => c.status === 'active'));
        setClosedCampaigns(mapped.filter((c: any) => c.status === 'closed'));
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
        navigation.navigate('Dashboard', { userName, campaignName: campaign.name });
      }

    } catch (error: any) {
      console.error('Error joining event', error.message);
    }
  }
  return (
    <View style={styles.container}>
      
      {/* --- STATIC HEADER --- */}
      <View>
        <Text style={styles.title}>Join an Event</Text>
        
        {/* NEW: Join via Code Box */}
        <View style={styles.joinBox}>
          <TextInput
            style={styles.joinInput}
            placeholder="Enter 6-Digit Code"
            placeholderTextColor="#666"
            autoCapitalize="characters"
            maxLength={6}
            value={joinCode}
            onChangeText={setJoinCode}
          />
          <TouchableOpacity 
            style={[styles.joinBtn, (!joinCode || isJoining) && { opacity: 0.5 }]} 
            onPress={handleJoinWithCode}
            disabled={!joinCode || isJoining}
          >
            <Text style={styles.joinBtnText}>{isJoining ? '...' : 'Join'}</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.subtitle}>Or create your own board:</Text>
        <TouchableOpacity 
          style={styles.createButton} 
          onPress={() => navigation.navigate('CreateBoard')}
        >
          <Text style={styles.createButtonText}>+ Host a New Game</Text>
        </TouchableOpacity>
      </View>

      {/* --- SCROLLABLE ZONE 1: LIVE ACTION --- */}
      <Text style={styles.sectionTitle}>Live Action</Text>
      <View style={{ flex: 1, marginBottom: 20 }}>
        {activeCampaigns.length === 0 ? (
          <Text style={styles.emptyText}>No active events right now.</Text>
        ) : (
          <FlatList
            data={activeCampaigns}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.campaignCard} onPress={() => selectCampaign(item)}>
                <Text style={styles.campaignName}>{item.name}</Text>
                <Text style={{ color: '#00D084', fontWeight: 'bold' }}>🟢 LIVE</Text>
              </TouchableOpacity>
            )}
          />
        )}
      </View>

      {/* --- SCROLLABLE ZONE 2: HALL OF FAME --- */}
      <Text style={[styles.sectionTitle, { marginTop: 10 }]}>Hall of Fame</Text>
      <View style={{ flex: 1 }}>
        {closedCampaigns.length === 0 ? (
          <Text style={styles.emptyText}>No archived events yet.</Text>
        ) : (
          <FlatList
            data={closedCampaigns}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <TouchableOpacity style={[styles.campaignCard, { borderColor: '#444' }]} onPress={() => selectCampaign(item)}>
                <Text style={[styles.campaignName, { color: '#a0a0a0' }]}>{item.name}</Text>
                <Text style={{ color: '#ff4444', fontWeight: 'bold' }}>🛑 CLOSED</Text>
              </TouchableOpacity>
            )}
          />
        )}
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212', padding: 20, paddingTop: 60 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#fff', marginBottom: 20 },
  card: { backgroundColor: '#1e1e1e', padding: 20, borderRadius: 10, marginBottom: 15, borderWidth: 1, borderColor: '#333' },
  cardText: { fontSize: 18, color: '#fff', fontWeight: 'bold' },
  createButton: { backgroundColor: '#FFD700', padding: 18, borderRadius: 10, alignItems: 'center', marginBottom: 25 },
  createButtonText: { color: '#000', fontSize: 18, fontWeight: 'bold' },
  subtitle: { color: '#a0a0a0', marginBottom: 15, fontSize: 16 },
  sectionTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold', marginBottom: 15 },
  emptyText: { color: '#666', fontStyle: 'italic', marginBottom: 20 },
  campaignCard: { 
    backgroundColor: '#1e1e1e', 
    padding: 20, 
    borderRadius: 10, 
    marginBottom: 15, 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    borderWidth: 1, 
    borderColor: '#333' 
  },
  campaignName: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  // --- JOIN BOX STYLES ---
  joinBox: {
    flexDirection: 'row',
    marginTop: 15,
    marginBottom: 20,
    gap: 10,
  },
  joinInput: {
    flex: 1,
    backgroundColor: '#1e1e1e',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    color: '#00D084',
    fontSize: 18,
    fontWeight: 'bold',
    paddingHorizontal: 15,
    height: 50,
    letterSpacing: 2,
  },
  joinBtn: {
    backgroundColor: '#00D084',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    borderRadius: 8,
    height: 50,
  },
  joinBtnText: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 16,
  },
});
