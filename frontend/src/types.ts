export type UserRole = "admin" | "operator";
export type ItemStatus = "pending" | "complete" | "short" | "over";
export type ScanType = "normal" | "unassigned" | "unknown" | "misplaced" | "ignored" | "found_missing";

/** Merkezi takip durumu sabitleri — backend CountTrackingStatus ile uyumlu */
export const CountTrackingStatus = {
  NORMAL: "NORMAL",
  OKUTULDU: "OKUTULDU",
  BULUNAMADI: "BULUNAMADI",
  SONRADAN_BULUNDU: "SONRADAN_BULUNDU",
  TEKRAR_BULUNDU: "TEKRAR_BULUNDU",
  YANLIS_LOKASYONDA: "YANLIS_LOKASYONDA",
} as const;

export type TrackingStatus = (typeof CountTrackingStatus)[keyof typeof CountTrackingStatus];

export interface User {
  id: number;
  username: string;
  role: UserRole;
}

export interface Session {
  id: number;
  name: string;
  status: string;
  started_at?: string;
  ended_at?: string;
  started_by?: string;
  active_shelf?: string;
  excel_filename?: string;
}

export interface ShelfItem {
  line_id: string;
  etiket: string;
  expected: number;
  scanned: number;
  status: ItemStatus;
  extra?: Record<string, string>;
  tracking_status?: TrackingStatus | null;
}

export interface ShelfStats {
  total_etikets: number;
  completed_etikets: number;
  short_etikets: number;
  over_etikets: number;
  pending_etikets: number;
  not_found_etikets?: number;
  total_expected: number;
  total_scanned: number;
  completion_pct: number;
}

export interface ShelfDetail {
  shelf: string;
  items: ShelfItem[];
  stats: ShelfStats;
}

export interface ShelfSummary {
  shelf: string;
  total_etikets: number;
  completed_etikets: number;
  short_etikets: number;
  over_etikets: number;
  pending_etikets: number;
  not_found_etikets?: number;
  total_expected: number;
  total_scanned: number;
  completion_pct: number;
}

export interface ScanResult {
  etiket: string;
  shelf: string;
  scan_type: ScanType;
  expected: number;
  scanned: number;
  status: ItemStatus;
  message: string;
  auto_switched_shelf: boolean;
  active_shelf: string;
  found_missing?: boolean;
  correct_shelf?: string | null;
  scanned_shelf?: string | null;
}

export interface ExcelInfo {
  loaded: boolean;
  filename?: string;
  row_count?: number;
  etiket_count?: number;
  shelf_count?: number;
  unassigned_count?: number;
  columns?: string[];
  etiket_digit_length?: number;
  etiket_pattern?: string;
}

export interface UnknownItem {
  etiket: string;
  scanned_qty: number;
  shelf: string;
  last_scan_at: string;
  username: string;
}

export interface UnassignedFound {
  etiket: string;
  found_shelf: string;
  scanned_qty: number;
  status: string;
  counted_at: string;
  username: string;
}

export interface MisplacementCorrection {
  id: number;
  etiket: string;
  correct_shelf: string | null;
  scanned_shelf: string;
  status: string;
  created_at: string;
  username: string;
}

export interface FoundMissingRecovery {
  id: number;
  etiket: string;
  stok_no: string;
  product_name: string;
  expected_shelf: string;
  found_shelf: string;
  initial_status: string;
  final_status: string;
  marked_at: string;
  resolved_at?: string | null;
  marked_by: string;
  resolved_by: string;
}

export interface ReportCorrectionEntry {
  etiket: string;
  category: string;
  message: string;
  expected_shelf: string;
  found_shelf: string;
  stok_no: string;
  product_name: string;
  username: string;
  created_at: string;
}

export interface ReportFileInfo {
  filename: string;
  size_bytes: number;
  created_at: string;
}

export interface ReportSummary {
  session_id: number;
  session_name: string;
  duration_minutes: number;
  total_etikets: number;
  complete_count: number;
  short_count: number;
  over_count: number;
  unknown_count: number;
  unassigned_found_count: number;
  total_scanned: number;
  total_expected: number;
  performance_pct: number;
  corrections_count: number;
  pending_count: number;
  not_found_count: number;
  found_after_missing_count: number;
  wrong_location_found_count: number;
  real_missing_count: number;
  location_error_count: number;
  correction_entries: ReportCorrectionEntry[];
  report_filename?: string | null;
}

export interface UserListItem {
  id: number;
  username: string;
  role: UserRole;
  created_at: string;
}

export interface SystemEvent {
  id: number;
  username: string;
  action: string;
  filename?: string | null;
  details: string;
  created_at: string;
}
