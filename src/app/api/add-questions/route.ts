import { NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';
import { invalidateMetaCache } from '@/lib/questions';
import matter from 'gray-matter';

const VAULT_PATH = process.env.VAULT_PATH || './demo-vault';
const BANK_PATH = path.join(VAULT_PATH, '题库');

interface QuestionInput {
  content: string;
  source: string;
  number: string;
  type: string;
  grade?: string;
  semester?: string;
  exam_type?: string;
  difficulty?: number | null;
  knowledge?: string[];
  tags?: string[];
}

/**
 * 根据 source 和 number 计算文件路径
 * source 为空 → 目录用"未分类"
 * source + number 都为空 → 文件名用 qid 兜底（qid 传给第二个参数）
 */
function buildFilePath(source: string, number: string, qid?: number): string {
  const dirName = source || '未分类';
  const nameParts = [source, number].filter(Boolean);
  const baseName = nameParts.length > 0 ? nameParts.join('-') : String(qid);
  return path.join(BANK_PATH, dirName, `${baseName}.md`);
}

/**
 * POST /api/add-questions
 *
 * 两种模式：
 *   action = "check"  → 只检查哪些文件已存在，不写入
 *   action = "write"  → 实际写入（配合 onConflict: "skip" | "overwrite"）
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    questions,
    action,
    onConflict,
  } = body as {
    questions: QuestionInput[];
    action?: string;          // "check" | "write"，默认 "write"（兼容旧版）
    onConflict?: string;      // "skip" | "overwrite"
  };

  if (!Array.isArray(questions) || questions.length === 0) {
    return Response.json({ error: '缺少题目数据' }, { status: 400 });
  }

  // ===== action = "check"：只检查冲突，不写入 =====
  if (action === 'check') {
    const conflicts: { index: number; number: string; source: string; fileName: string }[] = [];
    // 先用一个占位 qid 算路径（目录和文件名不依赖 qid，但 source/number 都空时需要）
    const dummyQid = Date.now();

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const filePath = buildFilePath(q.source, q.number, dummyQid);
      if (fs.existsSync(filePath)) {
        const fileName = path.basename(filePath);
        conflicts.push({ index: i, number: q.number, source: q.source, fileName });
      }
    }

    return Response.json({ conflicts });
  }

  // ===== action = "write"（或未指定，兼容旧版）=====
  const results: { qid: number; number: string; source: string; skipped?: boolean; error?: string }[] = [];
  let lastQid = Date.now();

  for (const q of questions) {
    try {
      // 生成 qid
      const now = Date.now();
      const qid = now > lastQid ? now : lastQid + 1;
      lastQid = qid;

      // 先算文件路径，检查冲突
      const filePath = buildFilePath(q.source, q.number, qid);
      const exists = fs.existsSync(filePath);

      // 文件已存在 + 用户选跳过 → 不写入
      if (exists && onConflict === 'skip') {
        results.push({ qid, number: q.number, source: q.source, skipped: true });
        continue;
      }

      // 组装 YAML
      const yaml: Record<string, any> = {
        qid,
        grade: q.grade || '高中',
        source: q.source,
        number: q.number,
        type: q.type,
        difficulty: q.difficulty ?? '',
        semester: q.semester || '',
        exam_type: q.exam_type || '',
        knowledge: q.knowledge || [],
        ai_tags: [],
        tags: q.tags || [],
        status: '待入库',
        selected: false,
      };

      // 剥离残留 YAML
      let cleanContent = q.content.trim();
      if (cleanContent.startsWith('---\n')) {
        const endIdx = cleanContent.indexOf('\n---\n', 4);
        if (endIdx !== -1) {
          cleanContent = cleanContent.slice(endIdx + 5).trim();
        }
      }

      const frontmatter = matter.stringify(cleanContent, yaml);

      // 确保目录存在
      const outDir = path.dirname(filePath);
      if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
      }

      // 写入文件
      fs.writeFileSync(filePath, frontmatter, 'utf-8');
      results.push({ qid, number: q.number, source: q.source });
    } catch (err: any) {
      results.push({ qid: 0, number: q.number, source: q.source, error: err.message });
    }
  }

  // 新增题目后清空缓存，下次扫描会重新读取
  invalidateMetaCache();

  return Response.json({ results });
}
