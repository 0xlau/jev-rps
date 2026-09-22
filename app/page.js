import { connection } from 'next/server';
import Game from './game.js';

export default async function Page() {
  await connection();
  return <Game />;
}
