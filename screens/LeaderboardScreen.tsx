import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, FlatList, ActivityIndicator, Alert, TouchableOpacity } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';

export default function LeaderboardScreen({ navigation }: any) {
  const [loading, setLoading] = useState(true);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);

    useEffect(() => {
        // 1. Fetch the initial leaderboard when the screen loads
        fetchLeaderboard();

        // 2. Subscribe to the Supabase Realtime channel
        const leaderboardSubscription = supabase
        .channel('public:campaign_participants')
        .on(
            'postgres_changes', 
            { event: '*', schema: 'public', table: 'campaign_participants' }, 
            (payload) => {
            // When the database says "A wallet updated!", we refresh the board.
            console.log('Realtime update received!', payload);
            fetchLeaderboard(); 
            }
        )
        .subscribe();

        // 3. Cleanup the subscription when the user leaves the screen
        return () => {
        supabase.removeChannel(leaderboardSubscription);
        };
    }, []);

  async function fetchLeaderboard() {
    setLoading(true);
    try {
      const campaignId = await AsyncStorage.getItem('campaignId');
      if (!campaignId) throw new Error("Missing campaign data.");

      // Fetch participants and join with the users table to get their names
      const { data, error } = await supabase
        .from('campaign_participants')
        .select(`
          global_point_balance,
          users ( display_name )
        `)
        .eq('campaign_id', campaignId)
        .order('global_point_balance', { ascending: false });

      if (error) throw error;
      if (data) setLeaderboard(data);

    } catch (error: any) {
      Alert.alert('Error loading leaderboard', error.message);
    } finally {
      setLoading(false);
    }
  }

  const renderPlayerCard = ({ item, index }: { item: any, index: number }) => {
    // Assign podium colors for the top 3
    let rankStyle: any = styles.rankText;
    if (index === 0) rankStyle = [styles.rankText, { color: '#FFD700' }]; // Gold
    if (index === 1) rankStyle = [styles.rankText, { color: '#C0C0C0' }]; // Silver
    if (index === 2) rankStyle = [styles.rankText, { color: '#CD7F32' }]; // Bronze

    return (
      <View style={styles.playerCard}>
        <View style={styles.playerInfo}>
          <Text style={rankStyle}>#{index + 1}</Text>
          <Text style={styles.playerName}>{item.users.display_name}</Text>
        </View>
        <Text style={styles.playerScore}>{item.global_point_balance.toLocaleString()} pts</Text>
      </View>
    );
  };

  if (loading) return <View style={styles.container}><ActivityIndicator size="large" color="#00D084" /></View>;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Standings</Text>
        <TouchableOpacity onPress={fetchLeaderboard}>
          <Text style={styles.refreshText}>↻ Refresh</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={leaderboard}
        keyExtractor={(_, index) => index.toString()}
        renderItem={renderPlayerCard}
        contentContainerStyle={{ paddingBottom: 50 }}
        ListEmptyComponent={<Text style={styles.emptyText}>No players found.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212', padding: 20 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, marginTop: 10 },
  title: { fontSize: 32, fontWeight: 'bold', color: '#fff' },
  refreshText: { color: '#00D084', fontSize: 16, fontWeight: 'bold' },
  emptyText: { color: '#666', textAlign: 'center', marginTop: 40 },
  
  playerCard: {
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
  playerInfo: { flexDirection: 'row', alignItems: 'center' },
  rankText: { fontSize: 20, fontWeight: 'bold', color: '#666', width: 40 },
  playerName: { fontSize: 18, color: '#fff', fontWeight: 'bold' },
  playerScore: { fontSize: 18, color: '#00D084', fontWeight: 'bold' }
});