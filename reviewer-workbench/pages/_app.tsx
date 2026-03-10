import type { AppProps } from 'next/app';
import { QueryClient, QueryClientProvider } from 'react-query';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from '../lib/auth';
import '../styles/globals.css';
import Head from 'next/head';

const qc = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1, staleTime: 15000 } } });

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head><meta name="viewport" content="width=device-width, initial-scale=1" /><title>PA Reviewer Workbench</title></Head>
      <QueryClientProvider client={qc}>
        <AuthProvider>
          <Component {...pageProps} />
          <Toaster position="top-right" toastOptions={{
            duration: 4000,
            style: { background:'#fff', color:'#1e293b', border:'1px solid #e2e8f0', borderRadius:'10px', fontSize:'13px', fontFamily:'IBM Plex Sans, sans-serif', boxShadow:'0 8px 24px rgba(0,0,0,0.08)', padding:'12px 16px' },
            success: { iconTheme: { primary:'#43A047', secondary:'#fff' } },
            error:   { iconTheme: { primary:'#E53935', secondary:'#fff' } },
          }} />
        </AuthProvider>
      </QueryClientProvider>
    </>
  );
}
