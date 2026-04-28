# iReader Pro Fresh — Progress

## Status: Metro running on port 8082

## Done
- Created fresh Expo app with `create-expo-app@latest --template blank-typescript`
- Installed packages:
  - expo-router, @tanstack/react-query, expo-image, expo-linear-gradient
  - expo-haptics, expo-web-browser, @expo/vector-icons, expo-font
  - @expo-google-fonts/inter, react-native-reanimated
  - react-native-safe-area-context, react-native-screens, react-native-gesture-handler
- Configured app.json:
  - name: "iReader Pro", slug: "ireader-pro-fresh"
  - android.package: "com.tushar.ireaderpro2"
  - NO expo-updates, NO runtimeVersion
- Created eas.json with preview APK profile (Java 17 / latest image)
  - EXPO_PUBLIC_API_URL: "https://ireader.onrender.com"
- Metro bundler running on port 8082 (--localhost --clear)

## Next Steps
- Port 8082 open in VS Code PORTS tab → connect via Expo Go
- Copy app screens/components from artifacts/particle-news into this fresh structure
- Set up expo-router file-based routing (app/ directory)
- Wire up API client (EXPO_PUBLIC_API_URL)
- Test on device via Expo Go before building APK via EAS
