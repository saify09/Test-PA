import React from 'react';
import type { NextPage } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { Stethoscope } from 'lucide-react';

const NotFound: NextPage = () => (
  <>
    <Head><title>404 | Reviewer Workbench</title></Head>
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-center">
        <div className="w-14 h-14 rounded-2xl bg-blue-100 flex items-center justify-center mx-auto mb-5">
          <Stethoscope size={26} className="text-blue-600" />
        </div>
        <h1 className="text-5xl font-black text-gray-200 mb-2">404</h1>
        <p className="text-base font-semibold text-gray-700 mb-1">Page not found</p>
        <p className="text-sm text-gray-400 mb-6">The page you're looking for doesn't exist.</p>
        <Link href="/">
          <button className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors">
            Back to Dashboard
          </button>
        </Link>
      </div>
    </div>
  </>
);

export default NotFound;
