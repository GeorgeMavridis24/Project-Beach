// Πραγματικός χάρτης για τον browser: OpenStreetMap μέσω Leaflet, μέσα σε iframe
// (έτσι δεν χρειάζεται κλειδί API και δεν επηρεάζει την υπόλοιπη σελίδα).
import React, { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { C } from '@/constants/brand';

import { BeachMapProps, PIN_COLORS } from './beachMapShared';

export type { MapPin } from './beachMapShared';

function buildHtml(props: BeachMapProps) {
  const data = {
    pins: props.pins.map((p) => ({ ...p, color: PIN_COLORS[p.tone ?? 'none'] })),
    selectedId: props.selectedId ?? null,
    picked: props.picked ?? null,
    pickable: !!props.onPick,
    selectedColor: C.primaryDark,
    pickedColor: C.danger,
  };
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<style>html,body,#m{height:100%;margin:0}.leaflet-popup-content{font:14px system-ui,sans-serif}</style>
</head><body><div id="m"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
const d = ${json};
const map = L.map('m', { zoomControl: true });
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19, attribution: '&copy; OpenStreetMap'
}).addTo(map);
const pts = [];
const markers = [];
function highlight(id) {
  markers.forEach(({ p, m }) => m.setStyle({ fillColor: p.id === id ? d.selectedColor : p.color }).setRadius(p.id === id ? 13 : 10));
}
const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
d.pins.forEach((p) => {
  const sel = p.id === d.selectedId;
  const m = L.circleMarker([p.lat, p.lng], {
    radius: sel ? 13 : 10, color: '#ffffff', weight: 3,
    fillColor: sel ? d.selectedColor : p.color, fillOpacity: 1
  }).addTo(map);
  m.bindPopup('<b>' + esc(p.title) + '</b>' + (p.subtitle ? '<br>' + esc(p.subtitle) : ''));
  markers.push({ p, m });
  m.on('click', () => {
    highlight(p.id);
    parent.postMessage({ source: 'beachmap', type: 'select', id: p.id }, '*');
  });
  if (sel) setTimeout(() => m.openPopup(), 50);
  pts.push([p.lat, p.lng]);
});
let picked = null;
function setPicked(lat, lng) {
  if (picked) picked.setLatLng([lat, lng]);
  else picked = L.circleMarker([lat, lng], { radius: 11, color: '#fff', weight: 3, fillColor: d.pickedColor, fillOpacity: 1 }).addTo(map);
}
if (d.picked) { setPicked(d.picked.lat, d.picked.lng); pts.push([d.picked.lat, d.picked.lng]); }
if (d.pickable) {
  map.on('click', (e) => {
    setPicked(e.latlng.lat, e.latlng.lng);
    parent.postMessage({ source: 'beachmap', type: 'pick', lat: e.latlng.lat, lng: e.latlng.lng }, '*');
  });
}
if (pts.length > 1) map.fitBounds(pts, { padding: [40, 40], maxZoom: 17 });
else if (pts.length === 1) map.setView(pts[0], 16);
else map.setView([40.2583, 23.2025], 14);
</script></body></html>`;
}

export function BeachMap(props: BeachMapProps) {
  const { pins, selectedId, picked, onSelect, onPick, height = 320 } = props;
  const frame = useRef<any>(null);
  const handlers = useRef({ onSelect, onPick });
  handlers.current = { onSelect, onPick };

  // Το iframe ξαναφορτώνει μόνο όταν αλλάζουν οι πινέζες, όχι σε κάθε render ή επιλογή
  // (η επιλογή/θέση φαίνεται ήδη μέσα στον χάρτη τη στιγμή του κλικ).
  const html = useMemo(
    () => buildHtml({ pins, selectedId, picked, onPick: onPick ? () => {} : undefined }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(pins), !!onPick],
  );

  useEffect(() => {
    const listener = (e: MessageEvent) => {
      if (!frame.current || e.source !== frame.current.contentWindow || e.data?.source !== 'beachmap') return;
      if (e.data.type === 'select') handlers.current.onSelect?.(e.data.id);
      if (e.data.type === 'pick') handlers.current.onPick?.(e.data.lat, e.data.lng);
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, []);

  return (
    <View style={[st.wrap, { height }]}>
      {React.createElement('iframe', {
        ref: frame,
        srcDoc: html,
        title: 'Χάρτης καταστημάτων',
        style: { border: 0, width: '100%', height: '100%' },
      })}
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { borderRadius: 14, overflow: 'hidden', marginVertical: 8, backgroundColor: C.sand },
});
