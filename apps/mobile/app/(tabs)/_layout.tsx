import { Tabs } from 'expo-router';
import { TabBar } from '../../src/ui/TabBar';

export default function TabsLayout() {
  return (
    <Tabs tabBar={(p) => <TabBar {...p} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: 'Today' }} />
      <Tabs.Screen name="report" options={{ title: 'Report' }} />
      <Tabs.Screen name="week" options={{ title: 'Week' }} />
      <Tabs.Screen name="reminders" options={{ title: 'Reminders' }} />
    </Tabs>
  );
}
