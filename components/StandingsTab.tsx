import React from 'react';
import {
  View, Text, StyleSheet, FlatList, Platform
} from 'react-native';

interface StandingsTabProps {
  standings: any[];
  userId: string | null;
}

export default function StandingsTab({ standings, userId }: StandingsTabProps) {
  const getRankColor = (index: number) => {
    if (index === 0) return '#FFD700';
    if (index === 1) return '#C0C0C0';
    if (index === 2) return '#CD7F32';
    return '#00D084';
  };

  return (
    <View style={styles.container}>
      {/* Sub-header */}
      <View style={styles.subHeader}>
        <Text style={styles.title}>Standings</Text>
        <Text style={styles.subtitle}>Current Leaderboard</Text>
      </View>

      {/* Leaderboard */}
      <FlatList
        data={standings}
        keyExtractor={(item) => item.user_id}
        contentContainerStyle={{ paddingHorizontal: 15, paddingBottom: 30 }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No players yet.</Text>
        }
        renderItem={({ item, index }) => {
          const rankColor = getRankColor(index);
          const isYou = item.user_id === userId;
          const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : null;

          return (
            <View style={[
              styles.card,
              index === 0 && { borderColor: '#FFD700', borderWidth: 2 },
              isYou && { backgroundColor: '#1a2a1a' },
            ]}>
              <View style={styles.cardLeft}>
                <Text style={[styles.rank, { color: rankColor }]}>
                  {medal ?? `#${index + 1}`}
                </Text>
                <View>
                  <Text style={styles.name}>
                    {item.users?.display_name || 'Unknown Player'}
                    {isYou && <Text style={styles.youBadge}> (You)</Text>}
                  </Text>
                </View>
              </View>
              <Text style={[styles.score, { color: rankColor }]}>
                {item.global_point_balance.toLocaleString()} pts
              </Text>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d0d0d',
  },
  subHeader: {
    paddingHorizontal: 15,
    paddingTop: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e1e',
    marginBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  subtitle: {
    fontSize: 14,
    color: '#00D084',
    marginTop: 4,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  card: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1e1e1e',
    padding: 18,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#333',
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  rank: {
    fontSize: 22,
    fontWeight: 'bold',
    minWidth: 36,
    textAlign: 'center',
  },
  name: {
    color: '#fff',
    fontSize: 17,
    fontWeight: 'bold',
  },
  youBadge: {
    color: '#a0a0a0',
    fontWeight: 'normal',
    fontSize: 14,
  },
  score: {
    fontSize: 17,
    fontWeight: 'bold',
  },
  emptyText: {
    color: '#a0a0a0',
    textAlign: 'center',
    marginTop: 40,
    fontSize: 16,
  },
});
