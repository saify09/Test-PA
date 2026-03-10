import type { AppProps } from 'next/app';
import { QueryClient, QueryClientProvider } from 'react-query';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from '../lib/auth';
import '../styles/globals.css';
import Head from 'next/head';

const qc = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1, staleTime: 60000 } } });

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>PA Admin Dashboard</title>
      </Head>
      <QueryClientProvider client={qc}>
        <AuthProvider>
          <Component {...pageProps} />
          <Toaster position="top-right" toastOptions={{
            duration: 4000,
            style: { background:'#1e293b', color:'#f8fafc', border:'1px solid #334155', borderRadius:'10px', fontSize:'13px', fontFamily:'Inter, sans-serif' },
            success: { iconTheme: { primary:'#4CAF50', secondary:'#fff' } },
            error:   { iconTheme: { primary:'#F44336', secondary:'#fff' } },
          }} />
        </AuthProvider>
      </QueryClientProvider>
    </>
  );
}
