export async function createFullCampaign(supabase: any, userId: string, campaignName: string) {
  try {
    // 1. Create the Campaign AND assign the host_id
    const { data: newCampaign, error: campaignError } = await supabase
      .from('campaigns')
      .insert([{ 
        name: campaignName, 
        host_id: userId // 🚨 No more missing hosts!
      }])
      .select().single();

    if (campaignError) throw campaignError;

    // 2. Add the Creator to the Participants table as the Host
    const { error: participantError } = await supabase
      .from('campaign_participants')
      .insert([{
        campaign_id: newCampaign.id,
        user_id: userId,
        role: 'host', // (or 'admin' if that's what your DB uses)
        global_point_balance: 1000 // Give them their starting bankroll!
      }]);

    if (participantError) throw participantError;

    // 3. Create the critical first "Live" Event
    const { data: newEvent, error: eventError } = await supabase
      .from('events')
      .insert([{
        campaign_id: newCampaign.id,
        name: 'Opening Event', // You can let them name this later, but it needs a default!
        status: 'live'         // 🚨 Instantly wakes up the Host screen!
      }])
      .select().single();

    if (eventError) throw eventError;

    // Return the new IDs so your app can immediately navigate the user there
    return { success: true, campaignId: newCampaign.id, eventId: newEvent.id };

  } catch (error: any) {
    console.error("Failed to generate campaign ecosystem:", error);
    return { success: false, error: error.message };
  }
}