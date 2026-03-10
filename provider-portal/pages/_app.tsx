import type { AppProps } from 'next/app';
import { QueryClient, QueryClientProvider } from 'react-query';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from '../lib/auth';
import '../styles/globals.css';
import Head from 'next/head';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30000,
    },
  },
});

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>PA Provider Portal</title>
      </Head>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <Component {...pageProps} />
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: {
                background: '#fff',
                color: '#212121',
                border: '1px solid #e0e0e0',
                borderRadius: '12px',
                fontSize: '13px',
                fontFamily: 'DM Sans, sans-serif',
                boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
                padding: '12px 16px',
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
