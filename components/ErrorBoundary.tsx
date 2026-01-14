"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-background-light p-6">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-6 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
              <span className="material-symbols-outlined text-red-500 text-3xl">
                error
              </span>
            </div>
            <h2 className="text-xl font-bold text-text-main mb-2">
              發生錯誤
            </h2>
            <p className="text-text-secondary mb-6">
              {this.state.error?.message || "應用程序遇到了一個意外錯誤"}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => window.location.reload()}
                className="flex-1 py-3 px-4 bg-primary text-white rounded-xl font-semibold hover:bg-primary-light transition-colors"
              >
                重新載入
              </button>
              <button
                onClick={() => {
                  this.setState({ hasError: false, error: null });
                  window.history.back();
                }}
                className="flex-1 py-3 px-4 bg-gray-100 text-text-main rounded-xl font-semibold hover:bg-gray-200 transition-colors"
              >
                返回
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

