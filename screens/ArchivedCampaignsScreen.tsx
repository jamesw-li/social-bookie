import React, { useEffect, useState, useLayoutEffect } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity,
  ScrollView, ActivityIndicator
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function ArchivedCampaignsScreen({ route, navigation }: any) {
  const insets = useSafeAreaInsets();
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  useEffect(() => {
    fetchArchivedCampaigns();
  }, []);

  async function fetchArchivedCampaigns() {
    try {
      const userId = await AsyncStorage.getItem('userId');
      if (!userId) return;

      const { data, error } = await supabase
        .from('campaign_participants')
        .select(`
          campaign_id,
          campaigns (
            id,
            name,
            status,
            start_date,
            end_date
          )
        `)
        .eq('user_id', userId);

      if (error) throw error;

      if (data) {
        const closed = data
          .filter((item: any) => item.campaigns?.status === 'closed')
          .map((item: any) => ({
            id: item.campaigns.id,
            name: item.campaigns.name,
            startDate: item.campaigns.start_date,
            endDate: item.campaigns.end_date,
          }));
        setCampaigns(closed);
      }
    } catch (error: any) {
      console.error('Error fetching archived campaigns:', error.message);
    } finally {
      setLoading(false);
    }
  }

  function handleSelectCampaign(campaign: any) {
    AsyncStorage.setItem('campaignId', campaign.id);
    AsyncStorage.setItem('campaignName', campaign.name);
    navigation.navigate('ReadOnlyDashboard', { campaignName: campaign.name });
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#121212' }}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 40, paddingHorizontal: 20 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={{ paddingTop: insets.top + 12, marginBottom: 24 }}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={{ alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 4, marginBottom: 16 }}
          >
            <Text style={{ color: '#00D084', fontWeight: '600', fontSize: 16 }}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.pageTitle}>Hall of Fame</Text>
          <Text style={{ color: '#a0a0a0', fontSize: 14, marginTop: 4 }}>
            Your completed campaigns
          </Text>
        </View>

        {loading ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 80 }}>
            <ActivityIndicator size="large" color="#FFD700" />
          </View>
        ) : campaigns.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={{ fontSize: 48, marginBottom: 16 }}>🏆</Text>
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 8 }}>
              No Archived Events Yet
            </Text>
            <Text style={{ color: '#666', fontSize: 14, textAlign: 'center', lineHeight: 20 }}>
              Completed campaigns will appear here once a host closes a board.
            </Text>
          </View>
        ) : (
          campaigns.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={styles.campaignCard}
              onPress={() => handleSelectCampaign(item)}
            >
              {/* Trophy accent */}
              <View style={styles.trophyBadge}>
                <Text style={{ fontSize: 18 }}>🏆</Text>
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.campaignName}>{item.name}</Text>
                {(item.startDate || item.endDate) && (
                  <Text style={styles.campaignDate}>
                    {formatDate(item.startDate)}
                    {item.startDate && item.endDate ? ' – ' : ''}
                    {formatDate(item.endDate)}
                  </Text>
                )}
                <View style={styles.closedBadge}>
                  <Text style={styles.closedBadgeText}>CLOSED</Text>
                </View>
              </View>

              <Text style={{ color: '#444', fontSize: 20 }}>›</Text>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  pageTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 80,
    paddingHorizontal: 20,
  },
  campaignCard: {
    backgroundColor: '#1e1e1e',
    borderRadius: 14,
    padding: 18,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    gap: 14,
  },
  trophyBadge: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  campaignName: {
    color: '#e0e0e0',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  campaignDate: {
    color: '#666',
    fontSize: 12,
    marginBottom: 6,
  },
  closedBadge: {
    backgroundColor: 'rgba(100, 100, 100, 0.2)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  closedBadgeText: {
    color: '#666',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 0.8,
  },
});
