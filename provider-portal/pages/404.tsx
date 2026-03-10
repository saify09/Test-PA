import React from 'react';
import type { NextPage } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { FileQuestion, Home, ArrowLeft } from 'lucide-react';

const NotFoundPage: NextPage = () => (
  <>
    <Head><title>Page Not Found | PA Provider Portal</title></Head>
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center">
        <div className="w-20 h-20 rounded-2xl bg-primary-100 flex items-center justify-center mx-auto mb-6">
          <FileQuestion size={36} className="text-primary-600" />
        </div>
        <h1 className="text-6xl font-extrabold text-primary-700 mb-2">404</h1>
        <h2 className="text-xl font-bold text-gray-900 mb-3">Page not found</h2>
        <p className="text-gray-500 text-sm mb-8">The page you're looking for doesn't exist or has been moved.</p>
        <div className="flex gap-3 justify-center">
          <Link href="/">
            <button className="flex items-center gap-2 px-5 py-2.5 bg-primary-700 text-white rounded-xl font-semibold text-sm hover:bg-primary-800 transition-colors">
              <Home size={15} /> Go to Dashboard
            </button>
          </Link>
          <button onClick={() => window.history.back()} className="flex items-center gap-2 px-5 py-2.5 border border-gray-200 text-gray-600 rounded-xl font-semibold text-sm hover:bg-gray-100 transition-colors">
            <ArrowLeft size={15} /> Go Back
          </button>
        </div>
      </div>
    </div>
  </>
);

export default NotFoundPage;
