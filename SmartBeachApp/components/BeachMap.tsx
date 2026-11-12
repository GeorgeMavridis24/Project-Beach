// Πραγματικός χάρτης για κινητό (Google Maps στο Android, Apple Maps στο iPhone).
// Για τον browser υπάρχει το BeachMap.web.tsx (OpenStreetMap / Leaflet).
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

import { C } from '@/constants/brand';

import { BeachMapProps, fitRegion, PIN_COLORS } from './beachMapShared';

export type { MapPin } from './beachMapShared';

export function BeachMap({ pins, selectedId, onSelect, onPick, picked, height = 320 }: BeachMapProps) {
  const region = useMemo(() => fitRegion(pins, picked), [pins, picked]);
  return (
    <View style={[st.wrap, { height }]}>
      <MapView
        style={StyleSheet.absoluteFill}
        initialRegion={region}
        showsUserLocation
        showsMyLocationButton
        onPress={(e) => onPick?.(e.nativeEvent.coordinate.latitude, e.nativeEvent.coordinate.longitude)}
      >
        {pins.map((p) => (
          <Marker
            key={p.id}
            coordinate={{ latitude: p.lat, longitude: p.lng }}
            title={p.title}
            description={p.subtitle}
            pinColor={p.id === selectedId ? C.primaryDark : PIN_COLORS[p.tone ?? 'none']}
            onPress={() => onSelect?.(p.id)}
          />
        ))}
        {picked ? (
          <Marker
            coordinate={{ latitude: picked.lat, longitude: picked.lng }}
            draggable
            pinColor={C.danger}
            title="Θέση καταστήματος"
            onDragEnd={(e) => onPick?.(e.nativeEvent.coordinate.latitude, e.nativeEvent.coordinate.longitude)}
          />
        ) : null}
      </MapView>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { borderRadius: 14, overflow: 'hidden', marginVertical: 8, backgroundColor: C.sand },
});
