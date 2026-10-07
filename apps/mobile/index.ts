import { AppRegistry } from 'react-native';
import './src/tracking/backgroundTask';
import './src/reminders/responseTask';
import { minuteTask } from './src/sunny/minuteTask';
import 'expo-router/entry';

AppRegistry.registerHeadlessTask('DailyMinute', () => minuteTask);
