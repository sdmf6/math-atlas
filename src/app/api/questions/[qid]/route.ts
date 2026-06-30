import { NextRequest } from 'next/server';
import { getQuestionByQid, parseSections } from '@/lib/questions';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ qid: string }> }
) {
  const { qid } = await params;
  const qidNum = Number(qid);

  if (isNaN(qidNum)) {
    return Response.json({ error: 'Invalid qid' }, { status: 400 });
  }

  const question = getQuestionByQid(qidNum);

  if (!question) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  return Response.json({
    qid: question.qid,
    source: question.source,
    number: question.number,
    filePath: question.filePath,
    sections: parseSections(question.content),
  });
}
