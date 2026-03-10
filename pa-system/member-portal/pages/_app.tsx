import type { AppProps } from 'next/app';
import { QueryClient, QueryClientProvider } from 'react-query';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from '../lib/auth';
import '../styles/globals.css';
import Head from 'next/head';

const qc = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1, staleTime: 30000 } }
});

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#1976D2" />
        <title>MyHealthPA — Prior Authorization Portal</title>
      </Head>
      <QueryClientProvider client={qc}>
        <AuthProvider>
          <Component {...pageProps} />
          <Toaster
            position="top-center"
            toastOptions={{
              duration: 4500,
              style: {
                background: '#fff', color: '#1a1a2e',
                border: '1px solid #e5e7eb', borderRadius: '12px',
                fontSize: '14px', fontFamily: 'Inter, sans-serif',
                boxShadow: '0 8px 32px rgba(0,0,0,0.10)', padding: '14px 18px',
              },
              success: { iconTheme: { primary: '#4CAF50', secondary: '#fff' } },
              error:   { iconTheme: { primary: '#F44336', secondary: '#fff' } },
            }}
          />
        </AuthProvider>
      </QueryClientProvider>
    </>
  );
}
