import { connection } from 'next/server';
import { setRequestLocale } from 'next-intl/server';
import Game from './game.js';

export default async function Page({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await connection();
  return <Game />;
}
