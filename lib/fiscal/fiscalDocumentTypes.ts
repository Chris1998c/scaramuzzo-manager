export type FiscalDocumentType =
  | "sale_receipt"
  | "void_receipt"
  | "return_receipt"
  | "z_report";

export type FiscalDocumentView = {
  id: number;
  document_type: FiscalDocumentType | string;
  fiscal_receipt_number: string | null;
  z_rep_number: string | null;
  printer_serial: string | null;
  receipt_iso_datetime: string | null;
  fiscal_receipt_date: string | null;
  fiscal_receipt_time: string | null;
  fiscal_receipt_amount: number | null;
  fiscal_print_job_id: number;
  job_status: string | null;
  created_at: string | null;
};

export type FiscalDocumentBySaleResponse = {
  ok: boolean;
  error?: string;
  sale_id?: number;
  fiscal_status?: string | null;
  document: FiscalDocumentView | null;
};
