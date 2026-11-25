import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    message: '',
  };

  public static getDerivedStateFromError(error: Error): State {
    let displayMessage = error.message || 'เกิดข้อผิดพลาดที่ไม่คาดคิด';
    try {
      const parsed = JSON.parse(displayMessage) as { error?: string };
      if (parsed && typeof parsed.error === 'string') {
        if (parsed.error.includes('Quota exceeded')) {
          displayMessage =
            'โควตาการใช้งานฐานข้อมูลรายวันเต็มแล้ว โควตาจะรีเซ็ตในวันถัดไปค่ะ';
        } else if (parsed.error.includes('Missing or insufficient permissions')) {
          displayMessage =
            'ไม่มีสิทธิ์เข้าถึงหรือแก้ไขข้อมูลส่วนนี้ กรุณาตรวจสอบการเข้าสู่ระบบด้วยบัญชี Google ที่ยืนยันแล้ว';
        } else {
          displayMessage = parsed.error;
        }
      }
    } catch {
      // Non-JSON error message
    }
    return { hasError: true, message: displayMessage };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Application ErrorBoundary caught:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-white border border-slate-200 rounded-xl p-8">
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  ไม่สามารถดำเนินการต่อได้
                </h2>
                <p className="text-sm text-slate-600 mt-1 break-words">
                  {this.state.message}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-4 h-4" />
              โหลดหน้าใหม่
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
