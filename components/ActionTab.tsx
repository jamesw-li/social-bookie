import React from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity
} from 'react-native';
import EventSwitcher, { EventItem } from './EventSwitcher';

interface ActionTabProps {
  bets: any[];
  p2pBets: any[];
  blindMatchups: any[];
  eventsList: EventItem[];
  activeEventSwitchId: string | null;
  onSelectEvent: (id: string) => void;
  onPitchPress: () => void;
  renderBetCard: (args: { item: any }) => React.ReactElement | null;
}

export default function ActionTab({
  bets, p2pBets, blindMatchups,
  eventsList, activeEventSwitchId,
  onSelectEvent, onPitchPress, renderBetCard,
}: ActionTabProps) {
  const campaignData = [
    ...blindMatchups.filter(b => (b.status === 'open' || b.status === 'matched') && b.event_id === null).map(b => ({ ...b, isBlind: true })),
    ...p2pBets.filter(b => (b.status === 'open' || b.status === 'locked') && b.event_id === null).map(b => ({ ...b, isP2P: true })),
    ...bets.filter(b => b.event_id === null),
  ];

  const eventData = [
    ...blindMatchups.filter(b => (b.status === 'open' || b.status === 'matched') && b.event_id !== null).map(b => ({ ...b, isBlind: true })),
    ...p2pBets.filter(b => (b.status === 'open' || b.status === 'locked') && b.event_id !== null).map(b => ({ ...b, isP2P: true })),
    ...bets.filter(b => b.event_id !== null),
  ];

  return (
    <View style={styles.container}>
      {/* Sub-header */}
      <View style={styles.subHeader}>
        <View style={styles.subHeaderLeft}>
          <Text style={styles.title}>The Action</Text>
          {eventsList.length > 0 && (
            <EventSwitcher
              events={eventsList}
              activeEventId={activeEventSwitchId}
              onSelectEvent={onSelectEvent}
            />
          )}
        </View>
        <TouchableOpacity style={styles.pitchButton} onPress={onPitchPress}>
          <Text style={styles.pitchButtonText}>+ Pitch Bet</Text>
        </TouchableOpacity>
      </View>

      {/* Feed */}
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 15, paddingBottom: 20 }}>
        {campaignData.length > 0 && (
          <View style={{ marginBottom: 20 }}>
            <Text style={styles.sectionHeader}>🏆 Campaign Stakes (Overall)</Text>
            {campaignData.map(item => (
              <React.Fragment key={item.id}>{renderBetCard({ item })}</React.Fragment>
            ))}
          </View>
        )}

        {eventData.length > 0 ? (
          <View style={{ paddingBottom: 20 }}>
            <Text style={styles.sectionHeader}>📅 Active Event Action</Text>
            {eventData.map(item => (
              <React.Fragment key={item.id}>{renderBetCard({ item })}</React.Fragment>
            ))}
          </View>
        ) : (
          <Text style={styles.emptyText}>No open bets for this event.</Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d0d0d',
  },
  subHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e1e',
  },
  subHeaderLeft: {
    flex: 1,
    paddingRight: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 6,
  },
  pitchButton: {
    backgroundColor: '#00D084',
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderRadius: 8,
    shadowColor: '#00D084',
    shadowOpacity: 0.3,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
  },
  pitchButtonText: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 15,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#a0a0a0',
    marginBottom: 12,
    marginTop: 16,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  emptyText: {
    color: '#a0a0a0',
    textAlign: 'center',
    marginTop: 40,
    fontSize: 16,
  },
});
