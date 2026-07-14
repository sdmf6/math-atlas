import { NextRequest, NextResponse } from 'next/server';
import { getFullQuestionMarkdownByQid } from '@/lib/questions';

export async function POST(req: NextRequest) {
    const { qids } = await req.json();
    if (!Array.isArray(qids)) return NextResponse.json({ error: "参数错误" }, { status: 400 });
    const list: Array<{ qid: number; fullMarkdown: string }> = [];
    for (const qid of qids) {
        const fullMarkdown = await getFullQuestionMarkdownByQid(qid);
        list.push({ qid, fullMarkdown });
    }
    return NextResponse.json({ list });
}