import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

const VAULT_PATH = process.env.VAULT_PATH || './demo-vault';
const BANK_PATH = path.join(VAULT_PATH, '题库');

// 轻量元数据（不含正文，用于首页表格）
export interface QuestionMetaLight {
  qid: number;
  grade: string;
  source: string;
  number: string;
  type: string;
  exam_type: string;
  filePath: string;
  difficulty: number;
  knowledge: string[];
  tags: string[];
}

// 完整题目（含正文，用于展开详情和讲义）
export interface QuestionMeta extends QuestionMetaLight {
  content: string;
}

/** 解析题目的 Markdown 正文为各个 section（题目、答案、解析等） */
export function parseSections(raw: string): Record<string, string> {
  raw = raw.replace(/\r\n/g, '\n');
  const result: Record<string, string> = {};
  const parts = raw.split(/\n(?=## )/);
  for (const block of parts) {
    const m = block.match(/^## (.+?)\n([\s\S]*)$/);
    if (!m) continue;
    const title = m[1].trim();
    const body = m[2].trim();
    if (title === '备注') {
      const subs = body.split(/\n(?=### )/);
      let noteBody = '';
      for (const sub of subs) {
        const sm = sub.match(/^### (.+?)\n([\s\S]*)$/);
        if (sm) {
          result[sm[1].trim()] = sm[2].trim();
        } else {
          noteBody += sub;
        }
      }
      if (noteBody.trim()) result['备注'] = noteBody.trim();
    } else {
      result[title] = body;
    }
  }
  return result;
}

// 内存缓存：避免每次请求都重读 5000+ 文件
let _metaCache: QuestionMetaLight[] | null = null;

/** 清空缓存（新增/修改题目后调用） */
export function invalidateMetaCache(): void {
  _metaCache = null;
}

/** 扫描题库，只返回元数据（不含 content 正文） */
export function scanAllQuestionsMeta(): QuestionMetaLight[] {
  // 有缓存就直接返回，毫秒级
  if (_metaCache) return _metaCache;

  const results: QuestionMetaLight[] = [];
  const sourceDirs = fs.readdirSync(BANK_PATH);

  for (const dirName of sourceDirs) {
    const dirPath = path.join(BANK_PATH, dirName);
    if (!fs.statSync(dirPath).isDirectory()) continue;

    const files = fs.readdirSync(dirPath);
    for (const fileName of files) {
      if (!fileName.endsWith('.md') || fileName.endsWith('.bak')) continue;

      const filePath = path.join(dirPath, fileName);
      const raw = fs.readFileSync(filePath, 'utf-8');

      let data: Record<string, any>;
      try {
        const parsed = matter(raw);
        data = parsed.data;
      } catch {
        console.warn(`YAML 解析失败，跳过: ${filePath}`);
        continue;
      }

      if (data.qid) {
        // 防御：确保 knowledge / tags 是字符串数组（YAML 冒号可能导致某些项被解析为对象）
        const safeKnowledge = (Array.isArray(data.knowledge) ? data.knowledge : [data.knowledge])
          .filter(Boolean)
          .map((k: any) => (typeof k === 'string' ? k : String(k)));
        const safeTags = (Array.isArray(data.tags) ? data.tags : [data.tags])
          .filter(Boolean)
          .map((t: any) => (typeof t === 'string' ? t : String(t)));
        results.push({
          qid: data.qid,
          grade: data.grade || '',
          source: data.source || '',
          number: data.number || '',
          type: data.type || '',
          exam_type: data.exam_type || '',
          filePath,
          difficulty: data.difficulty ?? 0,
          knowledge: safeKnowledge,
          tags: safeTags,
        });
      }
    }
  }

  results.sort((a, b) => b.qid - a.qid);

  // 存入缓存，下次直接返回
  _metaCache = results;
  return results;
}

/** 扫描题库，返回完整题目（含 content 正文） */
export function scanAllQuestions(): QuestionMeta[] {
  const results: QuestionMeta[] = [];
  const sourceDirs = fs.readdirSync(BANK_PATH);

  for (const dirName of sourceDirs) {
    const dirPath = path.join(BANK_PATH, dirName);
    if (!fs.statSync(dirPath).isDirectory()) continue;

    const files = fs.readdirSync(dirPath);
    for (const fileName of files) {
      if (!fileName.endsWith('.md') || fileName.endsWith('.bak')) continue;

      const filePath = path.join(dirPath, fileName);
      const raw = fs.readFileSync(filePath, 'utf-8');

      let data: Record<string, any>;
      let body = '';
      try {
        const parsed = matter(raw);
        data = parsed.data;
        body = parsed.content;
      } catch {
        console.warn(`YAML 解析失败，跳过: ${filePath}`);
        continue;
      }

      if (data.qid) {
        const safeKnowledge = (Array.isArray(data.knowledge) ? data.knowledge : [data.knowledge])
          .filter(Boolean)
          .map((k: any) => (typeof k === 'string' ? k : String(k)));
        const safeTags = (Array.isArray(data.tags) ? data.tags : [data.tags])
          .filter(Boolean)
          .map((t: any) => (typeof t === 'string' ? t : String(t)));
        results.push({
          qid: data.qid,
          grade: data.grade || '',
          source: data.source || '',
          number: data.number || '',
          type: data.type || '',
          exam_type: data.exam_type || '',
          filePath,
          difficulty: data.difficulty ?? 0,
          knowledge: safeKnowledge,
          tags: safeTags,
          content: body.trim(),
        });
      }
    }
  }

  results.sort((a, b) => b.qid - a.qid);
  return results;
}

/** 根据 qid 读取单道题的完整内容 */
export function getQuestionByQid(qid: number): QuestionMeta | null {
  const sourceDirs = fs.readdirSync(BANK_PATH);

  for (const dirName of sourceDirs) {
    const dirPath = path.join(BANK_PATH, dirName);
    if (!fs.statSync(dirPath).isDirectory()) continue;

    const files = fs.readdirSync(dirPath);
    for (const fileName of files) {
      if (!fileName.endsWith('.md') || fileName.endsWith('.bak')) continue;

      const filePath = path.join(dirPath, fileName);
      const raw = fs.readFileSync(filePath, 'utf-8');

      let data: Record<string, any>;
      let body = '';
      try {
        const parsed = matter(raw);
        data = parsed.data;
        body = parsed.content;
      } catch {
        continue;
      }

      if (data.qid === qid) {
        const safeKnowledge = (Array.isArray(data.knowledge) ? data.knowledge : [data.knowledge])
          .filter(Boolean)
          .map((k: any) => (typeof k === 'string' ? k : String(k)));
        const safeTags = (Array.isArray(data.tags) ? data.tags : [data.tags])
          .filter(Boolean)
          .map((t: any) => (typeof t === 'string' ? t : String(t)));
        return {
          qid: data.qid,
          grade: data.grade || '',
          source: data.source || '',
          number: data.number || '',
          type: data.type || '',
          exam_type: data.exam_type || '',
          filePath,
          difficulty: data.difficulty ?? 0,
          knowledge: safeKnowledge,
          tags: safeTags,
          content: body.trim(),
        };
      }
    }
  }

  return null;
}
