import { NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getQuestionByQid, parseSections, QuestionMetaLight } from '@/lib/questions';
import { buildLatexHandout } from '@/lib/latex';

const LATEX_DIR = path.join(process.cwd(), 'LATEX');
const STY_SRC = path.join(process.cwd(), 'public', 'mathatlas.sty');
const VAULT_PATH = process.env.VAULT_PATH || './demo-vault';
const IMAGES_DIR = path.join(VAULT_PATH, 'images');

export async function POST(req: NextRequest) {
  try {
    const { qids } = await req.json();

    if (!Array.isArray(qids) || qids.length === 0) {
      return Response.json({ error: '请提供题目 qid 列表' }, { status: 400 });
    }

    // 查找所有题目
    const questions: QuestionMetaLight[] = [];
    const sectionsMap: Record<number, Record<string, string>> = {};

    for (const qid of qids) {
      const q = getQuestionByQid(Number(qid));
      if (q) {
        questions.push({
          qid: q.qid,
          grade: q.grade,
          source: q.source,
          number: q.number,
          type: q.type,
          exam_type: q.exam_type,
          filePath: q.filePath,
          difficulty: q.difficulty,
          knowledge: q.knowledge,
          tags: q.tags,
        });
        sectionsMap[q.qid] = parseSections(q.content);
      }
    }

    if (questions.length === 0) {
      return Response.json({ error: '未找到任何题目' }, { status: 404 });
    }

    // 生成 LaTeX
    const { tex, imageMap } = buildLatexHandout(questions, sectionsMap);

    // 创建时间戳目录（精确到秒，与前端下载文件名一致）
    const now = new Date();
    const ts = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
      '_',
      String(now.getHours()).padStart(2, '0'),
      String(now.getMinutes()).padStart(2, '0'),
      String(now.getSeconds()).padStart(2, '0'),
    ].join('');
    const folderName = `导出_${ts}`;
    const outDir = path.join(LATEX_DIR, folderName);

    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    // 写 .tex
    fs.writeFileSync(path.join(outDir, '讲义.tex'), tex, 'utf-8');

    // 复制 .sty
    if (fs.existsSync(STY_SRC)) {
      fs.copyFileSync(STY_SRC, path.join(outDir, 'mathatlas.sty'));
    }

    // 复制图片到 images/ 子目录
    const imgDir = path.join(outDir, 'images');
    if (imageMap.size > 0 && !fs.existsSync(imgDir)) {
      fs.mkdirSync(imgDir, { recursive: true });
    }
    for (const [hashFilename, newName] of imageMap) {
      const imgPath = path.join(IMAGES_DIR, hashFilename);
      if (fs.existsSync(imgPath)) {
        fs.copyFileSync(imgPath, path.join(imgDir, newName));
      }
    }

    return Response.json({
      ok: true,
      path: outDir,
      folder: folderName,
      count: questions.length,
    });
  } catch (e: any) {
    return Response.json({ error: e.message || '导出失败' }, { status: 500 });
  }
}
