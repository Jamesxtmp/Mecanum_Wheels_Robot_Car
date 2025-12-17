import React, {useEffect, useRef, useState} from 'react';
import {BleManager, Device} from 'react-native-ble-plx';
import {encode as btoa} from 'base-64';
import {
  Alert,
  FlatList,
  Platform,
  PermissionsAndroid,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {ThemedText} from '@/components/themed-text';
import {ThemedView} from '@/components/themed-view';


// Note: creating BleManager at module import time can throw in environments
// where the native module isn't available (Expo Go). Create it lazily
// inside the component so the route can load without native BLE present.

async function requestAndroidPermissions() {
  if (Platform.OS !== 'android') return true;
  try {
    const granted = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    ]);
    return (
      granted[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] ===
        PermissionsAndroid.RESULTS.GRANTED ||
      granted[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] ===
        PermissionsAndroid.RESULTS.GRANTED
    );
  } catch (err) {
    return false;
  }
}

export default function BluetoothScreen() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [scanning, setScanning] = useState(false);
  const [connected, setConnected] = useState<Device | null>(null);
  const [payload, setPayload] = useState('');
  const scanSubscription = useRef<any>(null);
  const managerRef = useRef<BleManager | null>(null);

  useEffect(() => {
    // create manager lazily to avoid throwing during module import (Expo Go)
    try {
      managerRef.current = new BleManager();
    } catch (e) {
      console.warn('BleManager not available in this environment', e);
      managerRef.current = null;
    }

    return () => {
      scanSubscription.current?.remove();
      try {
        managerRef.current?.destroy();
      } catch {}
      managerRef.current = null;
    };
  }, []);

  function ensureManager(): BleManager | null {
    if (!managerRef.current) {
      Alert.alert(
        'BLE no disponible',
        'El módulo BLE no está disponible en este entorno. Usa un cliente nativo o un build personalizado.'
      );
    }
    return managerRef.current;
  }

  async function startScan() {
    const manager = ensureManager();
    if (!manager) return;
    const ok = await requestAndroidPermissions();
    if (!ok) {
      Alert.alert('Permisos', 'No se concedieron permisos necesarios para escaneo BLE');
      return;
    }
    setDevices([]);
    setScanning(true);
    scanSubscription.current = manager.startDeviceScan(null, null, (err, device) => {
      if (err) {
        console.warn('Scan error', err);
        setScanning(false);
        return;
      }
      if (device && device.id) {
        setDevices(prev => {
          if (prev.find(d => d.id === device.id)) return prev;
          return [...prev, device];
        });
      }
    });
  }

  function stopScan() {
    const manager = managerRef.current;
    if (!manager) return;
    manager.stopDeviceScan();
    setScanning(false);
    scanSubscription.current?.remove();
  }

  async function connectToDevice(device: Device) {
    const manager = ensureManager();
    if (!manager) return;
    try {
      stopScan();
      const d = await manager.connectToDevice(device.id);
      await d.discoverAllServicesAndCharacteristics();
      setConnected(d);
      Alert.alert('Conectado', `Conectado a ${d.name || d.id}`);
    } catch (e) {
      console.warn(e);
      Alert.alert('Error', 'No se pudo conectar');
    }
  }

  async function sendPayload() {
    const manager = ensureManager();
    if (!manager) return;
    if (!connected) {
      Alert.alert('No conectado', 'Conéctate a un dispositivo primero');
      return;
    }
    try {
      const services = await connected.services();
      for (const service of services) {
        const characteristics = await service.characteristics();
        for (const c of characteristics) {
          if (c.isWritableWithResponse || c.isWritableWithoutResponse) {
            const base64 = btoa(payload);
            await manager.writeCharacteristicWithResponseForDevice(
              connected.id,
              service.uuid,
              c.uuid,
              base64,
            );
            Alert.alert('Enviado', 'Payload enviado correctamente');
            return;
          }
        }
      }
      Alert.alert('No characteristic', 'No se encontró característica escribible');
    } catch (err) {
      console.warn(err);
      Alert.alert('Error', 'No se pudo enviar payload');
    }
  }

  return (
    <View style={styles.container}>
      <ThemedText type="title">Bluetooth</ThemedText>
      <ThemedView style={styles.controls}>
        <TouchableOpacity
          style={styles.button}
          onPress={() => (scanning ? stopScan() : startScan())}>
          <Text style={styles.buttonText}>{scanning ? 'Detener' : 'Escanear'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, {backgroundColor: connected ? '#4caf50' : '#2196f3'}]}
          onPress={() => {
            if (connected) {
              manager.cancelDeviceConnection(connected.id);
              setConnected(null);
              Alert.alert('Desconectado');
            }
          }}>
          <Text style={styles.buttonText}>{connected ? 'Desconectar' : '—'}</Text>
        </TouchableOpacity>
      </ThemedView>

      <FlatList
        data={devices}
        keyExtractor={item => item.id}
        renderItem={({item}) => (
          <View style={styles.deviceRow}>
            <Text style={styles.deviceText}>{item.name || item.id}</Text>
            <TouchableOpacity style={styles.connectButton} onPress={() => connectToDevice(item)}>
              <Text style={styles.connectText}>Conectar</Text>
            </TouchableOpacity>
          </View>
        )}
      />

      <ThemedView style={styles.sendRow}>
        <TextInput
          placeholder="Payload (texto)"
          value={payload}
          onChangeText={setPayload}
          style={styles.input}
        />
        <TouchableOpacity style={styles.sendButton} onPress={sendPayload}>
          <Text style={styles.buttonText}>Enviar</Text>
        </TouchableOpacity>
      </ThemedView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, padding: 16},
  controls: {flexDirection: 'row', gap: 8, marginVertical: 8},
  button: {backgroundColor: '#2196f3', padding: 12, borderRadius: 6},
  buttonText: {color: 'white', fontWeight: '600'},
  deviceRow: {flexDirection: 'row', justifyContent: 'space-between', padding: 12, borderBottomWidth: 1},
  deviceText: {fontSize: 16},
  connectButton: {backgroundColor: '#1976d2', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6},
  connectText: {color: 'white'},
  sendRow: {flexDirection: 'row', gap: 8, marginTop: 12, alignItems: 'center'},
  input: {flex: 1, borderWidth: 1, borderColor: '#ccc', padding: 8, borderRadius: 6},
  sendButton: {backgroundColor: '#4caf50', padding: 12, borderRadius: 6, marginLeft: 8},
});
