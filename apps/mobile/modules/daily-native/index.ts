import { requireNativeModule } from 'expo';
import { Platform } from 'react-native';
import { iosStub } from './iosStub';
import type { DailyNativeApi } from './types';

export * from './types';

export default Platform.OS === 'android' ? requireNativeModule<DailyNativeApi>('DailyNative') : iosStub;
