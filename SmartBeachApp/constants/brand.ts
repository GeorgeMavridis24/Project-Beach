// Χρώματα της εφαρμογής. Τα χρώματα του χάρτη ξαπλωστρών και των γραφημάτων
// ελέγχθηκαν για διάκριση από άτομα με αχρωματοψία (CVD ΔE >= 15).
export const C = {
  bg: '#F6F4EF',
  card: '#FFFFFF',
  text: '#1C1C1A',
  textMuted: '#62615D',
  textFaint: '#898781',
  border: '#E4E2DA',
  primary: '#007C80',
  primaryDark: '#005A5E',
  primarySoft: '#E0F2F1',
  sea: '#7CC6E8',
  seaDeep: '#2F8FC4',
  sand: '#F3E7CF',
  danger: '#C62828',
  dangerSoft: '#FDECEA',
  success: '#1B7F3B',
  successSoft: '#E6F4EA',
  warning: '#B26A00',
  warningSoft: '#FFF4E0',
};

// Χάρτης ξαπλωστρών
export const MAP = {
  normal: '#009C93',
  premium: '#EDA100',
  booked: '#D9D7D0',
  outOfOrder: '#52514E',
  selected: '#003D40',
  onNormal: '#FFFFFF',
  onPremium: '#0B0B0B',
  onBooked: '#62615D',
};

// Γραφήματα (σειρά ελεγμένης παλέτας)
export const VIZ = {
  series: '#2A78D6',
  grid: '#E1E0D9',
  axis: '#C3C2B7',
  ink: '#0B0B0B',
  inkSecondary: '#52514E',
  inkMuted: '#898781',
  // διαδοχική κλίμακα (heatmap): λίγες -> πολλές κρατήσεις
  ramp: ['#CDE2FB', '#B7D3F6', '#9EC5F4', '#86B6EF', '#6DA7EC', '#5598E7', '#3987E5', '#2A78D6', '#256ABF', '#1C5CAB', '#184F95', '#104281', '#0D366B'],
};

export const RADIUS = 12;
