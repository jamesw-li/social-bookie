import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, FlatList, ActivityIndicator, TouchableOpacity } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';

export default function FinalResultsScreen({ navigation }: any) {
  const [loading, setLoading] = useState(true);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [campaignName, setCampaignName] = useState('');

  useEffect(() => {
    fetchFinalStandings();
  }, []);

  async function fetchFinalStandings() {
    try {
      const campId = await AsyncStorage.getItem('campaignId');
      const campName = await AsyncStorage.getItem('campaignName');
      setCampaignName(campName || 'The Event');

      const { data } = await supabase
        .from('campaign_participants')
        .select('global_point_balance, users(display_name)')
        .eq('campaign_id', campId)
        .order('global_point_balance', { ascending: false });

      if (data) setLeaderboard(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  async function handleExit() {
    const savedUserId = await AsyncStorage.getItem('userId');
    const savedUserName = await AsyncStorage.getItem('userName');
    await AsyncStorage.removeItem('campaignId');
    await AsyncStorage.removeItem('campaignName');
    navigation.reset({ index: 0, routes: [{ name: 'Campaigns', params: { userId: savedUserId, userName: savedUserName } }] });
  }

  if (loading) return <View style={styles.container}><ActivityIndicator size="large" color="#FFD700" /></View>;

  return (
    <View style={styles.container}>
      <Text style={styles.gameOverText}>BOARD CLOSED</Text>
      <Text style={styles.title}>{campaignName}</Text>
      <Text style={styles.subtitle}>Final Standings</Text>

      <FlatList
        data={leaderboard}
        keyExtractor={(_, index) => index.toString()}
        contentContainerStyle={{ marginTop: 20 }}
        renderItem={({ item, index }) => {
          let rankStyle: any = styles.rankText;
          let cardStyle: any = styles.playerCard;
          
          if (index === 0) { rankStyle = [styles.rankText, { color: '#FFD700', fontSize: 24 }]; cardStyle = [styles.playerCard, { borderColor: '#FFD700', borderWidth: 2 }]; } // Gold
          if (index === 1) rankStyle = [styles.rankText, { color: '#C0C0C0' }]; // Silver
          if (index === 2) rankStyle = [styles.rankText, { color: '#CD7F32' }]; // Bronze

          return (
            <View style={cardStyle}>
              <View style={styles.playerInfo}>
                <Text style={rankStyle}>#{index + 1}</Text>
                <Text style={styles.playerName}>{item.users.display_name}</Text>
              </View>
              <Text style={styles.playerScore}>{item.global_point_balance.toLocaleString()} pts</Text>
            </View>
          );
        }}
      />

      <TouchableOpacity style={styles.exitButton} onPress={handleExit}>
        <Text style={styles.exitButtonText}>Return to Home Menu</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212', padding: 20, paddingTop: 60 },
  gameOverText: { color: '#ff4444', fontSize: 18, fontWeight: 'bold', textAlign: 'center', letterSpacing: 2 },
  title: { fontSize: 32, fontWeight: 'bold', color: '#FFD700', textAlign: 'center', marginTop: 10 },
  subtitle: { color: '#a0a0a0', textAlign: 'center', fontSize: 18, marginBottom: 20 },
  playerCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1e1e1e', padding: 18, borderRadius: 10, marginBottom: 10, borderWidth: 1, borderColor: '#333' },
  playerInfo: { flexDirection: 'row', alignItems: 'center' },
  rankText: { fontSize: 20, fontWeight: 'bold', color: '#666', width: 45 },
  playerName: { fontSize: 18, color: '#fff', fontWeight: 'bold' },
  playerScore: { fontSize: 18, color: '#00D084', fontWeight: 'bold' },
  exitButton: { backgroundColor: '#2a2a2a', padding: 18, borderRadius: 10, alignItems: 'center', marginTop: 20, marginBottom: 30, borderWidth: 1, borderColor: '#444' },
  exitButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' }
});