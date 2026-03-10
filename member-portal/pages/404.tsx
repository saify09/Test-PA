import React from 'react';
import type { NextPage } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { Shield } from 'lucide-react';

const NotFound: NextPage = () => (
  <>
    <Head><title>Page Not Found | MyHealthPA</title></Head>
    <div className="min-h-screen bg-[#f5f7fa] flex items-center justify-center p-4">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 rounded-2xl bg-primary-50 flex items-center justify-center mx-auto mb-5">
          <Shield size={28} className="text-primary-600" />
        </div>
        <h1 className="text-6xl font-black text-gray-100 mb-3">404</h1>
        <p className="text-lg font-bold text-gray-700 mb-2">Page not found</p>
        <p className="text-sm text-gray-400 mb-6">The page you're looking for doesn't exist or has been moved.</p>
        <Link href="/">
          <button className="px-6 py-3 bg-primary-700 text-white font-bold rounded-2xl hover:bg-primary-800 transition-colors shadow-lg">
            Back to Dashboard
          </button>
        </Link>
      </div>
    </div>
  </>
);

export default NotFound;
