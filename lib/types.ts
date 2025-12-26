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
  amount: number;
  payment_method_id: number | null;
  staff_type_id: number | null;
  bank_name: string | null;
  account_number: string | null;
  resident_number: string | null;
  business_registration_number: string | null;
  id_card_url: string | null;
  bankbook_url: string | null;
  payment_status: 'pending' | 'completed' | null;
  invoice_date: string | null;
  payment_date: string | null;
  memo: string | null;
  created_at: string;
  updated_at?: string | null;
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
  is_company_expense: boolean;
  created_at: string;
}
