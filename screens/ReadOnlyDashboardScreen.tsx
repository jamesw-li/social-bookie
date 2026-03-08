import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, FlatList, ActivityIndicator, TouchableOpacity } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';

export default function ReadOnlyDashboardScreen({ route, navigation }: any) {
  const { campaignName } = route.params || { campaignName: 'Past Event' };
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'podium' | 'receipts'>('podium');
  
  const [standings, setStandings] = useState<any[]>([]);
  const [receipts, setReceipts] = useState<any[]>([]);

  useEffect(() => {
    fetchArchiveData();
  }, []);

  async function fetchArchiveData() {
    try {
      const campId = await AsyncStorage.getItem('campaignId');
      const userId = await AsyncStorage.getItem('userId');
      if (!campId || !userId) return;

      // 1. Fetch Final Standings
      const { data: standingsData } = await supabase
        .from('campaign_participants')
        .select('global_point_balance, users(display_name)')
        .eq('campaign_id', campId)
        .order('global_point_balance', { ascending: false });

      if (standingsData) setStandings(standingsData);

      // 2. Fetch the specific event ID
      const { data: eventData } = await supabase
        .from('events').select('id').eq('campaign_id', campId).single();

      if (eventData) {
        // 3. Fetch User's Wagers & strictly filter for this event
        const { data: wagerData } = await supabase
          .from('wagers')
          .select(`
            id,
            points_risked,
            status,
            bet_options ( label, multiplier ), 
            bets ( question, event_id )
          `)
          .eq('user_id', userId);
          
        if (wagerData) {
          // Look directly at the bets object
          const eventWagers = wagerData.filter((w: any) => w.bets?.event_id === eventData.id);
          setReceipts(eventWagers.reverse()); 
        }
      }
    } catch (error) {
      console.error("Error fetching archive:", error);
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
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleExit}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.gameOverText}>ARCHIVED EVENT</Text>
      </View>
      
      <Text style={styles.title}>{campaignName}</Text>

      {/* TABS */}
      <View style={styles.tabContainer}>
        <TouchableOpacity style={[styles.tab, activeTab === 'podium' && styles.activeTab]} onPress={() => setActiveTab('podium')}>
          <Text style={[styles.tabText, activeTab === 'podium' && styles.activeTabText]}>🏆 The Podium</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, activeTab === 'receipts' && styles.activeTab]} onPress={() => setActiveTab('receipts')}>
          <Text style={[styles.tabText, activeTab === 'receipts' && styles.activeTabText]}>📜 My Receipts</Text>
        </TouchableOpacity>
      </View>

      {/* CONTENT */}
      {activeTab === 'podium' ? (
        <FlatList
          data={standings}
          keyExtractor={(_, index) => index.toString()}
          contentContainerStyle={{ paddingBottom: 20 }}
          renderItem={({ item, index }) => {
            let rankStyle: any = styles.rankText;
            let cardStyle: any = styles.playerCard;
            
            if (index === 0) { rankStyle = [styles.rankText, { color: '#FFD700', fontSize: 24 }]; cardStyle = [styles.playerCard, { borderColor: '#FFD700', borderWidth: 2 }]; }
            if (index === 1) rankStyle = [styles.rankText, { color: '#C0C0C0' }];
            if (index === 2) rankStyle = [styles.rankText, { color: '#CD7F32' }];

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
      ) : (
        <FlatList
          data={receipts}
          keyExtractor={(_, index) => index.toString()}
          contentContainerStyle={{ paddingBottom: 20 }}
          ListEmptyComponent={<Text style={{ color: '#666', textAlign: 'center', marginTop: 20 }}>No bets placed during this event.</Text>}
          renderItem={({ item }) => {
                const odds = item.bet_options?.multiplier || 1;
                const payout = Math.floor(item.points_risked * odds);

                return (
                  <View style={styles.receiptCard}>
                    <Text style={styles.receiptQuestion}>{item.bets?.question || 'Unknown Bet'}</Text>
                    
                    <View style={styles.receiptDetailsRow}>
                      <Text style={styles.receiptPick}>Pick: {item.bet_options?.label}</Text>
                      <Text style={styles.receiptOdds}>Odds: {odds}x</Text>
                    </View>

                    <View style={styles.receiptDetailsRow}>
                      <Text style={styles.receiptAmount}>Risked: {item.points_risked} pts</Text>
                      {item.status === 'pending' && <Text style={styles.receiptToWin}>To Win: {payout} pts</Text>}
                      {item.status === 'won' && <Text style={styles.receiptWon}>Paid: {payout} pts</Text>}
                      {item.status === 'lost' && <Text style={styles.receiptLost}>Lost: {item.points_risked} pts</Text>}
                    </View>

                    <View style={[styles.statusBadge, item.status === 'won' ? styles.badgeWon : item.status === 'lost' ? styles.badgeLost : styles.badgePending]}>
                      <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
                    </View>
                  </View>
                );
              }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212', padding: 20, paddingTop: 60 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  backButton: { backgroundColor: '#2a2a2a', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: '#444' },
  backButtonText: { color: '#fff', fontWeight: 'bold' },
  gameOverText: { color: '#ff4444', fontSize: 14, fontWeight: 'bold', letterSpacing: 2, marginLeft: 20 },
  title: { fontSize: 32, fontWeight: 'bold', color: '#FFD700', marginBottom: 20 },
  
  tabContainer: { flexDirection: 'row', backgroundColor: '#1e1e1e', borderRadius: 10, padding: 4, marginBottom: 20 },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 8 },
  activeTab: { backgroundColor: '#FFD700' },
  tabText: { color: '#a0a0a0', fontWeight: 'bold', fontSize: 16 },
  activeTabText: { color: '#000' },

  playerCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1e1e1e', padding: 18, borderRadius: 10, marginBottom: 10, borderWidth: 1, borderColor: '#333' },
  playerInfo: { flexDirection: 'row', alignItems: 'center' },
  rankText: { fontSize: 20, fontWeight: 'bold', color: '#666', width: 45 },
  playerName: { fontSize: 18, color: '#fff', fontWeight: 'bold' },
  playerScore: { fontSize: 18, color: '#00D084', fontWeight: 'bold' },

  receiptCard: { backgroundColor: '#1e1e1e', padding: 15, borderRadius: 10, marginBottom: 15, borderWidth: 1, borderColor: '#333' },
  receiptQuestion: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginBottom: 10 },
  receiptDetailsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  receiptPick: { color: '#FFD700', fontSize: 14 },
  receiptAmount: { color: '#a0a0a0', fontSize: 14 },
  statusBadge: { alignSelf: 'flex-start', paddingVertical: 4, paddingHorizontal: 10, borderRadius: 6 },
  badgeWon: { backgroundColor: 'rgba(0, 208, 132, 0.2)', borderWidth: 1, borderColor: '#00D084' },
  badgeLost: { backgroundColor: 'rgba(255, 68, 68, 0.2)', borderWidth: 1, borderColor: '#ff4444' },
  badgePending: { backgroundColor: 'rgba(255, 215, 0, 0.2)', borderWidth: 1, borderColor: '#FFD700' },
  statusText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  receiptOdds: { color: '#a0a0a0', fontSize: 14, fontWeight: 'bold' },
  receiptToWin: { color: '#FFD700', fontSize: 14, fontWeight: 'bold' },
  receiptWon: { color: '#00D084', fontSize: 14, fontWeight: 'bold' },
  receiptLost: { color: '#ff4444', fontSize: 14, fontWeight: 'bold' },
});