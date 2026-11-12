# SmartBeach – Εφαρμογή κινητού (Expo / React Native)

Οδηγίες για όλο το project (βάση, server, εφαρμογή) υπάρχουν στο [README του repo](../README.md).

```bash
npm install
npx expo start          # σκάναρε το QR με το Expo Go
npx expo start --web    # ή άνοιγμα στον browser
npm run typecheck       # έλεγχος τύπων TypeScript
npm run lint
```

Η εφαρμογή βρίσκει αυτόματα τον server στη θύρα 8000 του υπολογιστή που τρέχει το Expo.
Για άλλη διεύθυνση, αντίγραψε το `.env.example` σε `.env` και όρισε `EXPO_PUBLIC_API_URL`.

## Δομή

| Φάκελος | Περιεχόμενο |
|---|---|
| `app/login.tsx` | Είσοδος / εγγραφή |
| `app/(tabs)/` | Παραλίες (φίλτρα), Κράτηση (χάρτης), Κρατήσεις μου (QR), Βοηθός (AI), Διαχείριση |
| `app/admin/` | Στατιστικά, κρατήσεις, ξαπλώστρες, παραλίες, χρήστες, check-in |
| `components/` | Χάρτης ξαπλωστρών, γραφήματα, επιλογείς ημερομηνίας/ώρας, κοινά UI |
| `lib/` | Σύνδεση με API, αποθήκευση token (SecureStore), βοηθητικά ημερομηνιών |
