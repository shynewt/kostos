import { AppProps } from 'next/app';
import Head from 'next/head';
import '../styles/globals.css';

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#3b82f6" />
        <meta name="description" content="A simple app for splitting bills and expenses among groups" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/icons/icon-192x192.webp" type="image/webp" />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.webp" />
        <title>Kostos - Group Bill Splitting</title>
      </Head>
      <Component {...pageProps} />
    </>
  );
}

export default MyApp;
