import React from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';

interface MyBetsTabProps {
  combinedTickets: any[];
  userId: string | null;
}

export default function MyBetsTab({ combinedTickets, userId }: MyBetsTabProps) {
  const renderTicket = ({ item }: { item: any }) => {
    const isP2P = item.type === 'p2p';
    const isBlind = item.type === 'blind';
    let wagerStatus = item.status || 'pending';
    let question: string, pick: any, odds: any, wagerAmt: any, potentialWin: any, opponentName: string | undefined;
    let isA = false;
    let oppId: string | null | undefined = null;

    if (isBlind) {
      isA = String(item.side_a_user_id) === String(userId);
      oppId = isA ? item.side_b_user_id : item.side_a_user_id;

      if (!item.user_2_id) {
        opponentName = 'Waiting for challenger...';
        question = item.question;
        pick = 'Pending Match';
        odds = '?';
        wagerAmt = item.base_amount;
        potentialWin = '???';
      } else {
        question = item.question;
        pick = isA ? item.side_a_label : item.side_b_label;
        const baseAmt = parseFloat(item.base_amount) || 0;
        const finalMulti = parseFloat(item.final_multiplier) || 0;
        odds = finalMulti.toFixed(2);
        wagerAmt = isA ? baseAmt : Math.trunc((baseAmt * finalMulti) - baseAmt);
        potentialWin = Math.trunc(baseAmt * finalMulti);
        opponentName = 'Opponent';
      }
    } else if (isP2P) {
      isA = String(item.side_a_user_id) === String(userId);
      oppId = isA ? item.side_b_user_id : item.side_a_user_id;
      opponentName = oppId ? 'Opponent' : 'Waiting for opponent...';
      question = item.question;
      pick = isA ? item.option_a_label : item.option_b_label;
      odds = isA
        ? Number(item.multiplier).toFixed(2)
        : item.challenger_cost > 0
        ? (Number(item.total_pot) / Number(item.challenger_cost)).toFixed(2)
        : '1.00';
      wagerAmt = isA ? item.wager_amount : item.challenger_cost;
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
    let statusBg = 'rgba(255, 215, 0, 0.1)';

    if (wagerStatus === 'won' || ((isP2P || isBlind) && wagerStatus === 'resolved')) {
      statusText = '🟢 ' + ((isP2P || isBlind) ? 'RESOLVED' : 'WON');
      statusColor = '#00D084';
      statusBg = 'rgba(0, 208, 132, 0.1)';
    } else if (wagerStatus === 'lost') {
      statusText = '🔴 LOST';
      statusColor = '#ff4444';
      statusBg = 'rgba(255, 68, 68, 0.1)';
    }

    const isActive = ['pending', 'open', 'locked', 'matched'].includes(wagerStatus);

    return (
      <View style={[styles.card, { borderColor: statusColor, opacity: isActive ? 1 : 0.6 }]}>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1, paddingRight: 10 }}>
            {isBlind && (
              <Text style={styles.typeLabel}>🤝 BLIND VS. {opponentName?.toUpperCase()}</Text>
            )}
            {isP2P && (
              <Text style={[styles.typeLabel, { color: '#FFD700' }]}>🥊 P2P VS. {opponentName?.toUpperCase()}</Text>
            )}
            <Text style={styles.question}>{question}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusBg, borderColor: statusColor }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>{statusText}</Text>
          </View>
        </View>

        <View style={styles.cardFooter}>
          <View style={{ flex: 1 }}>
            <Text style={styles.detail}>Pick: <Text style={styles.detailHighlight}>{pick}</Text></Text>
            <Text style={styles.detail}>Odds: <Text style={styles.oddsHighlight}>{odds}x</Text></Text>
          </View>
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <Text style={styles.detail}>Wager: <Text style={{ color: '#fff', fontWeight: 'bold' }}>{wagerAmt} pts</Text></Text>
            <Text style={[
              statusColor === '#00D084' ? styles.resultWon : statusColor === '#ff4444' ? styles.resultLost : styles.resultPending,
              { marginTop: 4 }
            ]}>
              {statusColor === '#00D084' ? `Payout: ${potentialWin} pts` : `Win: ${potentialWin} pts`}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.subHeader}>
        <Text style={styles.title}>My Bets</Text>
        <Text style={styles.subtitle}>Live Tickets</Text>
      </View>

      <FlatList
        data={combinedTickets}
        keyExtractor={(item, index) => item.id ? `${item.type}-${item.id}` : index.toString()}
        renderItem={renderTicket}
        contentContainerStyle={{ paddingHorizontal: 15, paddingBottom: 30 }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyEmoji}>🎟️</Text>
            <Text style={styles.emptyText}>No bets placed yet.</Text>
            <Text style={styles.emptySubtext}>Head to The Action tab and get in the game!</Text>
          </View>
        }
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
    color: '#3498db',
    marginTop: 4,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: '#1e1e1e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  typeLabel: {
    color: '#BB86FC',
    fontSize: 10,
    fontWeight: 'bold',
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  question: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
    lineHeight: 21,
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
    justifyContent: 'center',
  },
  statusText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  detail: {
    color: '#a0a0a0',
    fontSize: 13,
    marginBottom: 2,
  },
  detailHighlight: {
    color: '#fff',
    fontWeight: '600',
  },
  oddsHighlight: {
    color: '#00D084',
    fontWeight: 'bold',
  },
  resultWon: {
    color: '#00D084',
    fontWeight: 'bold',
    fontSize: 13,
  },
  resultLost: {
    color: '#ff4444',
    fontWeight: 'bold',
    fontSize: 13,
  },
  resultPending: {
    color: '#FFD700',
    fontWeight: 'bold',
    fontSize: 13,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 30,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 16,
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
    lineHeight: 20,
  },
});
