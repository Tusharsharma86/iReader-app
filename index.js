import { registerRootComponent } from 'expo';
import { registerWidgetTaskHandler } from 'react-native-android-widget';

import App from './App';
import { widgetTaskHandler } from './widgets/widgetTaskHandler';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
registerRootComponent(App);

// Headless handler that renders/refreshes the Android home-screen widget.
registerWidgetTaskHandler(widgetTaskHandler);
