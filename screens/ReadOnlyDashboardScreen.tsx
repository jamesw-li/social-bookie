import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, FlatList, ActivityIndicator, TouchableOpacity } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';

export default function ReadOnlyDashboardScreen({ route, navigation }: any) {
  const { campaignName } = route.params || { campaignName: 'Past Event' };
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'podium' | 'receipts'>('podium');
  
  const [userId, setUserId] = useState<string | null>(null);
  const [standings, setStandings] = useState<any[]>([]);
  const [receipts, setReceipts] = useState<any[]>([]);

  useEffect(() => {
    fetchArchiveData();
  }, []);

  async function fetchArchiveData() {
    try {
      const campId = await AsyncStorage.getItem('campaignId');
      const storedUserId = await AsyncStorage.getItem('userId');
      
      if (!campId || !storedUserId) return;
      setUserId(storedUserId);

      // 1. Fetch Final Standings (FIX: Added user_id so we can look up opponents!)
      const { data: standingsData } = await supabase
        .from('campaign_participants')
        .select('user_id, global_point_balance, users(display_name)')
        .eq('campaign_id', campId)
        .order('global_point_balance', { ascending: false });

      if (standingsData) setStandings(standingsData);

      // 2. Fetch P2P Prop Bets
      const { data: p2pData } = await supabase
        .from('p2p_prop_bets')
        .select('*')
        .eq('campaign_id', campId);

      const p2pReceipts = (p2pData || [])
        .filter(b => String(b.side_a_user_id) === String(storedUserId) || String(b.side_b_user_id) === String(storedUserId))
        .map(b => ({ ...b, type: 'p2p' }));

      // 3. Fetch specific event ID for House Bets
      const { data: eventData } = await supabase
        .from('events').select('id').eq('campaign_id', campId).single();

      let houseReceipts: any[] = [];
      if (eventData) {
        // 4. Fetch User's House Wagers
        const { data: wagerData } = await supabase
          .from('wagers')
          .select(`
            id, points_risked, status, created_at,
            bet_options ( label, multiplier ), 
            bets ( question, event_id )
          `)
          .eq('user_id', storedUserId);
          
        if (wagerData) {
          houseReceipts = wagerData
            .filter((w: any) => w.bets?.event_id === eventData.id)
            .map((w: any) => ({ ...w, type: 'house' }));
        }
      }

      // Merge and Sort by Newest
      const combinedReceipts = [...p2pReceipts, ...houseReceipts].sort((a, b) => {
        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return dateB - dateA;
      });

      setReceipts(combinedReceipts);

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
          keyExtractor={(item) => item.user_id}
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
          keyExtractor={(item, index) => item.id ? `${item.type}-${item.id}` : index.toString()}
          contentContainerStyle={{ paddingBottom: 20 }}
          ListEmptyComponent={<Text style={{ color: '#666', textAlign: 'center', marginTop: 20 }}>No bets placed during this event.</Text>}
          renderItem={({ item }) => {
            const isP2P = item.type === 'p2p';
            let wagerStatus = item.status || 'pending'; 
            let question, pick, odds, wagerAmt, potentialWin, opponentName;

            if (isP2P) {
              const isSideA = String(item.side_a_user_id) === String(userId);
              
              // --- THE LOOKUP FIX ---
              const opponentId = isSideA ? item.side_b_user_id : item.side_a_user_id;
              if (opponentId) {
                const opponentProfile = standings.find(s => String(s.user_id) === String(opponentId));
                opponentName = opponentProfile?.users?.display_name || 'Unknown Player';
              } else {
                opponentName = 'No Opponent (Refunded)';
              }

              question = item.question;
              pick = isSideA ? item.option_a_label : item.option_b_label;
              odds = isSideA 
                ? Number(item.multiplier).toFixed(2) 
                : (item.challenger_cost > 0 ? (Number(item.total_pot) / Number(item.challenger_cost)).toFixed(2) : '1.00');
              wagerAmt = isSideA ? item.wager_amount : item.challenger_cost;
              potentialWin = item.total_pot;
            } else {
              question = item.bets?.question || 'Unknown Bet';
              pick = item.bet_options?.label || 'Unknown Pick';
              odds = item.bet_options?.multiplier || 1;
              wagerAmt = item.points_risked || 0;
              potentialWin = Math.floor(wagerAmt * odds);
            }

            let statusText = '🟡 PENDING';
            let statusColor = '#FFD700';
            let statusBg = 'rgba(255, 215, 0, 0.2)';

            // For P2P, we just show RESOLVED since we don't store individual win/loss in that table
            if (wagerStatus === 'won' || (isP2P && wagerStatus === 'resolved')) {
              statusText = '🟢 ' + (isP2P ? 'RESOLVED' : 'WON');
              statusColor = '#00D084';
              statusBg = 'rgba(0, 208, 132, 0.2)';
            } else if (wagerStatus === 'lost') {
              statusText = '🔴 LOST';
              statusColor = '#ff4444';
              statusBg = 'rgba(255, 68, 68, 0.2)';
            }

            return (
              <View style={[styles.receiptCard, { borderColor: statusColor }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <View style={{ flex: 1, paddingRight: 10 }}>
                    {/* --- RENDER OPPONENT NAME HERE --- */}
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
                    <Text style={[
                      statusColor === '#FFD700' ? styles.receiptToWin : (statusColor === '#00D084' ? styles.receiptWon : styles.receiptLost),
                      { marginTop: 4 }
                    ]}>
                      {statusColor === '#00D084' ? `Payout: ${potentialWin} pts` : `Win: ${potentialWin} pts`}
                    </Text>
                  </View>
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
  receiptPick: { color: '#FFD700', fontSize: 14, fontWeight: 'bold' },
  receiptAmount: { color: '#a0a0a0', fontSize: 14 },
  statusBadge: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6, height: 22, justifyContent: 'center' },
  badgeWon: { backgroundColor: 'rgba(0, 208, 132, 0.2)', borderWidth: 1, borderColor: '#00D084' },
  badgeLost: { backgroundColor: 'rgba(255, 68, 68, 0.2)', borderWidth: 1, borderColor: '#ff4444' },
  badgePending: { backgroundColor: 'rgba(255, 215, 0, 0.2)', borderWidth: 1, borderColor: '#FFD700' },
  statusText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  receiptOdds: { color: '#a0a0a0', fontSize: 14, fontWeight: 'bold' },
  receiptToWin: { color: '#FFD700', fontSize: 14, fontWeight: 'bold' },
  receiptWon: { color: '#00D084', fontSize: 14, fontWeight: 'bold' },
  receiptLost: { color: '#ff4444', fontSize: 14, fontWeight: 'bold' },
});