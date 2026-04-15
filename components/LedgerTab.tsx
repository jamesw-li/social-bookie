import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity
} from 'react-native';
import { supabase } from '../supabase';

interface LedgerEntry {
  id: string;
  transaction_type: 'wager' | 'payout' | 'refund' | 'adjustment';
  amount: number;
  memo: string;
  running_balance: number;
  created_at: string;
}

interface LedgerTabProps {
  userId: string | null;
  campaignId: string | null;
  displayName?: string; // When host views another player
}

export default function LedgerTab({ userId, campaignId, displayName }: LedgerTabProps) {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId || !campaignId) return;
    fetchLedger();
  }, [userId, campaignId]);

  async function fetchLedger() {
    setLoading(true);
    const { data, error } = await supabase
      .from('ledger_entries')
      .select('id, transaction_type, amount, memo, running_balance, created_at')
      .eq('user_id', userId)
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: false });

    if (!error && data) setEntries(data);
    setLoading(false);
  }

  const getTypeConfig = (type: LedgerEntry['transaction_type'], amount: number) => {
    if (type === 'payout' || type === 'refund' || (type === 'adjustment' && amount > 0)) {
      return { color: '#00D084', prefix: '+', emoji: '🟢' };
    }
    if (type === 'wager' || (type === 'adjustment' && amount < 0)) {
      return { color: '#ff4444', prefix: '', emoji: '🔴' };
    }
    return { color: '#FFD700', prefix: '', emoji: '🟡' };
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  };

  const renderEntry = ({ item }: { item: LedgerEntry }) => {
    const cfg = getTypeConfig(item.transaction_type, item.amount);
    const absAmount = Math.abs(item.amount);

    return (
      <View style={styles.row}>
        <View style={styles.rowTop}>
          <View style={styles.rowLeft}>
            <Text style={styles.rowEmoji}>{cfg.emoji}</Text>
            <View>
              <Text style={[styles.rowType, { color: cfg.color }]}>
                {item.transaction_type.toUpperCase()}
              </Text>
              <Text style={styles.rowDate}>{formatDate(item.created_at)}</Text>
            </View>
          </View>
          <View style={styles.rowRight}>
            <Text style={[styles.rowAmount, { color: cfg.color }]}>
              {cfg.prefix}{absAmount.toLocaleString()} pts
            </Text>
            <Text style={styles.rowBalance}>
              Balance: {item.running_balance.toLocaleString()}
            </Text>
          </View>
        </View>
        <Text style={styles.rowMemo} numberOfLines={2}>{item.memo}</Text>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#00D084" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>
          {displayName ? `${displayName}'s Ledger` : '📒 My Ledger'}
        </Text>
        <TouchableOpacity onPress={fetchLedger} style={styles.refreshBtn}>
          <Text style={styles.refreshText}>↻ Refresh</Text>
        </TouchableOpacity>
      </View>

      {entries.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>No transactions yet.</Text>
          <Text style={styles.emptySubtext}>Transactions will appear here once you start betting.</Text>
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => item.id}
          renderItem={renderEntry}
          contentContainerStyle={{ paddingBottom: 30 }}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d0d0d',
    paddingHorizontal: 20,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
    marginBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  refreshBtn: {
    backgroundColor: '#1e1e1e',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
  },
  refreshText: {
    color: '#00D084',
    fontWeight: 'bold',
    fontSize: 13,
  },
  row: {
    paddingVertical: 14,
  },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  rowEmoji: {
    fontSize: 18,
  },
  rowType: {
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  rowDate: {
    color: '#555',
    fontSize: 11,
    marginTop: 2,
  },
  rowRight: {
    alignItems: 'flex-end',
  },
  rowAmount: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  rowBalance: {
    color: '#666',
    fontSize: 11,
    marginTop: 2,
  },
  rowMemo: {
    color: '#a0a0a0',
    fontSize: 13,
    paddingLeft: 28,
    lineHeight: 18,
  },
  separator: {
    height: 1,
    backgroundColor: '#1e1e1e',
  },
  emptyText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  emptySubtext: {
    color: '#666',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 30,
  },
});
