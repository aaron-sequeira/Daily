import { Platform } from 'react-native';
import { features, inStore, storeName } from './platform';

export const OS: string = Platform?.OS ?? 'android'; // ponytail: Platform is undefined under partial react-native mocks in tests
export const FEATURES = features(OS);
export const STORE = storeName(OS);
export const IN_STORE = inStore(OS);
