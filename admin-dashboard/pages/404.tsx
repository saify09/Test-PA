import React from 'react';
import type { NextPage } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { Shield } from 'lucide-react';

const NotFound: NextPage = () => (
  <>
    <Head><title>404 | PA Admin</title></Head>
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="text-center">
        <p className="text-8xl font-black text-slate-800">404</p>
        <p className="text-lg font-bold text-slate-400 mb-2">Page not found</p>
        <Link href="/"><button className="px-5 py-2.5 bg-primary-600 text-white font-bold rounded-xl hover:bg-primary-500 transition-colors text-sm">Back to Dashboard</button></Link>
      </div>
    </div>
  </>
);

export default NotFound;
