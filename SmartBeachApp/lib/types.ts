export type Role = 'user' | 'staff' | 'owner' | 'admin';
export type SunbedType = 'normal' | 'premium';

export type User = { id: number; username: string; email: string; role: Role };

export type AppConfig = {
  season_start_month: number;
  season_end_month: number;
  default_open_time: string;
  default_close_time: string;
  min_booking_minutes: number;
  half_day_max_hours: number;
  half_day_factor: number;
  first_bookable_date: string;
  today: string;
};

export type BeachInfo = {
  id: number;
  name: string;
  description: string;
  ltd: number;
  lgd: number;
  open_time: string;
  close_time: string;
  owner_id: number | null;
};

export type Beach = BeachInfo & {
  total_sunbeds: number;
  premium_sunbeds: number;
  min_price: number | null;
  max_price: number | null;
  available_sunbeds: number | null;
  open_for_window: boolean | null;
  distance_km: number | null;
};

export type Sunbed = {
  id: number;
  grid_x: number;
  grid_y: number;
  type: SunbedType;
  price: number;
  quoted_price: number;
  status: 'available' | 'booked' | 'out_of_order';
  booked_slots: { start: string; end: string }[];
};

export type SunbedMap = {
  beach: BeachInfo;
  date: string;
  start_time: string;
  end_time: string;
  rows: number;
  cols: number;
  bookable: boolean;
  reason: string | null;
  summary: { total: number; available: number; booked: number; out_of_order: number };
  sunbeds: Sunbed[];
};

export type Booking = {
  booking_id: number;
  res_date: string;
  start_time: string;
  end_time: string;
  price: number;
  status: 'confirmed' | 'cancelled';
  checked_in: boolean;
  checked_in_at: string | null;
  sunbed_id: number;
  grid_x: number;
  grid_y: number;
  type: SunbedType;
  beach_id: number;
  beach_name: string;
  beach_ltd: number;
  beach_lgd: number;
  open_time: string;
  close_time: string;
  user_id: number;
  username: string;
  email: string;
  is_past: boolean;
  can_cancel: boolean;
  can_modify: boolean;
  checkin_code?: string;
};

export type Proposal = {
  sunbed_id: number;
  beach_id: number;
  beach_name: string;
  grid_x: number;
  grid_y: number;
  type: SunbedType;
  res_date: string;
  start_time: string;
  end_time: string;
  price: number;
};

export type Stats = {
  date_from: string;
  date_to: string;
  kpis: {
    revenue: number;
    bookings: number;
    cancelled: number;
    cancellation_rate: number;
    avg_booking_value: number;
    occupancy_rate: number;
    checkin_rate: number;
    customers: number;
    active_sunbeds: number;
  };
  daily: { date: string; bookings: number; revenue: number; occupancy: number }[];
  by_month: { month: string; label: string; revenue: number; bookings: number; occupancy: number }[];
  by_weekday: { weekday: number; label: string; bookings: number; avg_bookings: number; revenue: number }[];
  by_slot: { slot: string; label: string; bookings: number; revenue: number }[];
  by_beach: { beach_id: number; name: string; revenue: number; bookings: number; occupancy: number }[];
  heatmap: null | {
    rows: number;
    cols: number;
    max_bookings: number;
    cells: { sunbed_id: number; grid_x: number; grid_y: number; type: SunbedType; status: string; bookings: number; revenue: number }[];
  };
};

export type AdminUser = User & { created_at: string; bookings: number; spent: number; owns: string | null };
