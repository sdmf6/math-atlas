import { scanAllQuestionsMeta } from '@/lib/questions';
import { NextResponse } from 'next/server';

export async function GET() {
  const questions = scanAllQuestionsMeta();
  return NextResponse.json(questions);
}