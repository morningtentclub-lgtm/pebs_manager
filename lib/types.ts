export interface Project {
  id: string;
  name: string;
  client: string | null;
  status: 'ongoing' | 'completed';
  created_at: string;
  updated_at: string;
}

export interface StaffType {
  id: number;
  name: string;
}

export interface PaymentMethod {
  id: number;
  name: string;
}

export interface Payment {
  id: string;
  project_id: string;
  item: string | null;
  recipient: string | null;
  company_name: string | null;
  amount: number;
  payment_method_id: number | null;
  staff_type_id: number | null;
  bank_name: string | null;
  account_number: string | null;
  resident_number: string | null;
  id_card_url: string | null;
  bankbook_url: string | null;
  payment_status: 'pending' | 'completed' | null;
  invoice_date: string | null;
  payment_date: string | null;
  memo: string | null;
  created_at: string;
  updated_at?: string | null;
}

export interface PaymentTemplate {
  id: string;
  recipient: string | null;
  company_name: string | null;
  bank_name: string | null;
  account_number: string | null;
  resident_number: string | null;
  payment_method_id: number | null;
  staff_type_id: number | null;
  created_at: string | null;
}

export interface Expense {
  id: string;
  project_id: string;
  expense_number: number | null;
  expense_date: string | null;
  amount: number;
  vendor: string | null;
  description: string | null;
  category: string | null;
  note: string | null;
  is_company_expense: boolean;
  card_id?: string | null;
  card_last4?: string | null;
  card_alias?: string | null;
  payer_name?: string | null;
  payer_bank_name?: string | null;
  payer_account_number?: string | null;
  payment_status?: 'pending' | 'completed' | null;
  payment_date?: string | null;
  created_at: string;
}

export interface ExpenseCard {
  id: string;
  card_last4: string;
  card_alias: string;
  created_at: string;
}

export interface HddSet {
  id: string;
  name: string;                     // "25 레이드"
  description: string | null;
  last_scanned_at: string | null;   // ISO 8601 timestamptz
  file_count: number;
  created_at: string;
}

export interface HddFileEntry {
  id: string;
  hdd_set_id: string;
  name: string;                     // "footage" or "A001_C001.mov"
  path: string;                     // "/2024 LG AI캠프/footage"
  parent_path: string;              // "" = 루트, "/2024 LG AI캠프" = 하위
  is_dir: boolean;
  size_bytes: number | null;        // 폴더는 null
  modified_at: string | null;
  extension: string | null;         // "mov", "mp4", 폴더는 null
  created_at: string;
}
