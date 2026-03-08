import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Alert, FlatList, ScrollView } from 'react-native';
import { supabase } from '../supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';


export default function CampaignScreen({ route, navigation }: any) {
  const { userId, userName } = route.params; // Catch the data passed from WelcomeScreen
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [activeCampaigns, setActiveCampaigns] = useState<any[]>([]);
  const [closedCampaigns, setClosedCampaigns] = useState<any[]>([]);

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
        <TouchableOpacity 
          style={styles.createButton} 
          onPress={() => navigation.navigate('CreateBoard')}
        >
          <Text style={styles.createButtonText}>+ Host a New Game</Text>
        </TouchableOpacity>
        <Text style={styles.subtitle}>Or join an active board below:</Text>
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
});
