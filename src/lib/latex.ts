/**
 * latex.ts — Markdown → LaTeX 转换 & 讲义生成
 *
 * 将题库题目的 Markdown 正文转换为 LaTeX exercise 环境，
 * 填充 template.tex 骨架，生成可编译的 .tex 文件。
 */

import { QuestionMetaLight } from './questions';

// ============================================================
// 一、难度映射
// ============================================================

/** difficulty 得分率 (0-1, 越低越难) → level 整数 (1-5, 辣椒数) */
export function difficultyToLevel(d: number): number {
  if (d <= 0.4) return 5;   // 压轴
  if (d <= 0.55) return 4;  // 难题
  if (d <= 0.7) return 3;   // 中档偏难
  if (d <= 0.85) return 2;  // 中等偏易
  return 1;                  // 非常简单
}

// ============================================================
// 二、图片映射（Obsidian/Markdown → \includegraphics）
// ============================================================

/**
 * 处理文本中的图片引用。
 * - Obsidian ![[images/hash|W]] → 居中图（读 |W 为宽度 px）
 * - Markdown ![](images/hash) → 居中图（默认 0.3\linewidth）
 * - 图片统一放入 images/ 子目录
 * - center=true 时包裹 \par\begin{center}...\end{center}\par（题干/解析/答案用）
 * - center=false 时仅输出行内 \includegraphics（选项用）
 * - 图片保持 Obsidian 哈希原名，不按题号重命名（方便后续调顺序）
 */
function convertLatexImages(
  text: string,
  imageMap: Map<string, string>,
  center = true
): string {
  const wrap = (latex: string) =>
    center ? `\\par${latex}\\par` : latex;

  // 直接用哈希原名，只做去重（同一张图只复制一次）
  const getOrCreate = (hashFilename: string, widthPx?: string): string => {
    if (!imageMap.has(hashFilename)) {
      imageMap.set(hashFilename, hashFilename);
    }
    const width = widthPx ? `width=${widthPx}px` : 'width=0.3\\linewidth';
    return wrap(`\\includegraphics[${width}]{images/${hashFilename}}`);
  };

  // Obsidian 格式：![[images/hash.jpg|352]]
  text = text.replace(
    /!\[\[images\/([^\]|]+)(?:\|(\d+))?\]\]/g,
    (_, hash: string, w?: string) => getOrCreate(hash, w)
  );

  // Markdown 格式：![任意alt](images/hash.jpg) — 有无 alt 都能匹配（如 ![241]）
  text = text.replace(
    /!\[[^\]]*\]\(images\/([^)]+)\)/g,
    (_, hash: string) => getOrCreate(hash)
  );

  // 非 images/ 路径的普通图片 ![](name.ext)
  text = text.replace(
    /!\[\]\(([^)]+)\)/g,
    (_, name: string) => wrap(`\\includegraphics[width=0.3\\linewidth]{${name}}`)
  );

  return text;
}

// ============================================================
// 三、Markdown → LaTeX 正文转换
// ============================================================

/**
 * 将题目正文中的 Markdown 标记转换为 LaTeX 命令。
 * 保护数学公式区域（$...$ / $$...$$）不被处理。
 */
export function markdownToLatex(text: string): string {
  const mathRegions: string[] = [];

  // Step 1: 保护数学公式
  // 先处理 $$...$$（多行），再处理 $...$（单行）
  let processed = text.replace(
    /\$\$([\s\S]*?)\$\$/g,
    (match) => {
      mathRegions.push(match);
      return `\x00M${mathRegions.length - 1}\x00`;
    }
  );
  processed = processed.replace(
    /\$(.+?)\$/g,
    (match) => {
      mathRegions.push(match);
      return `\x00M${mathRegions.length - 1}\x00`;
    }
  );

  // Step 2: HTML 表格 → LaTeX tabular
  processed = convertHtmlTables(processed);

  // Step 3: 加粗 **text**
  processed = processed.replace(/\*\*(.+?)\*\*/g, '\\textbf{$1}');

  // Step 4: 斜体 *text*（不匹配 ** 或已处理的）
  processed = processed.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '\\textit{$1}');

  // Step 5: 无序列表（连续的 "- item" 行）
  processed = convertLists(processed, /^-\s+(.+)$/gm, 'itemize');

  // Step 6: 有序列表（连续的 "1. item" 行）
  processed = convertLists(processed, /^\d+\.\s+(.+)$/gm, 'enumerate');

  // Step 7: 还原数学公式
  processed = processed.replace(
    /\x00M(\d+)\x00/g,
    (_, i: string) => mathRegions[parseInt(i)]
  );

  return processed;
}

/** HTML 表格 → LaTeX tabular */
function convertHtmlTables(text: string): string {
  return text.replace(
    /<table>([\s\S]*?)<\/table>/g,
    (_, body: string) => {
      const rows = body.match(/<tr>([\s\S]*?)<\/tr>/g);
      if (!rows || rows.length === 0) return '';

      // 统计列数
      const firstRowCells = rows[0].match(/<td>([\s\S]*?)<\/td>/g);
      const colCount = firstRowCells ? firstRowCells.length : 1;
      const cols = Array(colCount).fill('c').join('|');

      const latexRows = rows.map(row => {
        const cells = row.match(/<td>([\s\S]*?)<\/td>/g);
        if (!cells) return '';
        return cells
          .map(cell => cell.replace(/<\/?td>/g, '').trim())
          .join(' & ');
      });

      return `\\par\\begin{tabular}{|${cols}|}\n\\hline\n${latexRows.join(' \\\\ \\hline\n')} \\\\ \\hline\n\\end{tabular}\\par`;
    }
  );
}

/** 将连续的列表行包装为 LaTeX 列表环境 */
function convertLists(
  text: string,
  itemRegex: RegExp,
  envName: string
): string {
  // 按行分割，识别连续的列表行
  const lines = text.split('\n');
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    itemRegex.lastIndex = 0; // 重置 regex（带 g flag）
    const match = itemRegex.exec(line);

    if (match) {
      // 收集连续的列表项
      const items: string[] = [match[1]];
      i++;
      while (i < lines.length) {
        itemRegex.lastIndex = 0;
        const nextMatch = itemRegex.exec(lines[i]);
        if (nextMatch) {
          items.push(nextMatch[1]);
          i++;
        } else {
          break;
        }
      }
      // 生成 LaTeX 列表
      result.push(`\\begin{${envName}}`);
      for (const item of items) {
        result.push(`  \\item ${item}`);
      }
      result.push(`\\end{${envName}}`);
    } else {
      result.push(line);
      i++;
    }
  }

  return result.join('\n');
}

// ============================================================
// 四、选项 → choices 环境
// ============================================================

/**
 * 将 "A．xxx\nB．yyy" 格式的选项文本转换为 LaTeX choices 环境。
 */
export function optionsToChoices(optionsText: string): string {
  const items = optionsText
    .split(/\n+/)
    .map(s => s.trim())
    .filter(s => /^[A-Z]．/.test(s))
    .map(s => s.replace(/^[A-Z]．\s*/, ''))
    .map(s => markdownToLatex(s));

  if (items.length === 0) return '';

  return `\\begin{choices}\n  \\item ${items.join('\n  \\item ')}\n\\end{choices}`;
}

// ============================================================
// 五、讲义生成（主函数）
// ============================================================

export interface LatexHandoutResult {
  tex: string;
  imageMap: Map<string, string>;
}

/**
 * 根据题目列表和已加载的 sections，生成完整的 .tex 文件内容。
 *
 * @param questions  已排序的题目元数据列表（来自 handoutQuestions）
 * @param sectionsMap  qid → { 题目, 选项, 答案, 解析, ... }
 * @returns .tex 字符串 + 图片映射（供后续下载 zip 用）
 */
export function buildLatexHandout(
  questions: QuestionMetaLight[],
  sectionsMap: Record<number, Record<string, string>>
): LatexHandoutResult {
  const imageMap = new Map<string, string>();

  // --- 生成所有 exercises（平铺，不分 chapter） ---
  const exerciseLines: string[] = [];

  questions.forEach((q, i) => {
    const num = i + 1;  // 全局连续编号
    const s = sectionsMap[q.qid];

    if (!s?.['题目']) {
      exerciseLines.push(`% TODO: ${q.source}${q.number} 内容加载失败`);
      return;
    }

    // 提取题型标记
    let questionText = s['题目'];
    const type = q.type || '';
    const isMultiSelect = type === '多选题' || questionText.includes('[多选]');
    const isSingleSelect = type === '单选题' || questionText.includes('[选]');
    const isFillIn = type === '填空题' || questionText.includes('[填]');

    // 替换题型标记为 LaTeX 命令
    questionText = questionText
      .replace(/\[多选\]/g, '\\pick')
      .replace(/\[选\]/g, '\\pick')
      .replace(/\[填\]/g, '\\fillin')
      .trim();

    // 转换图片（哈希原名，不按题号编号）
    questionText = convertLatexImages(questionText, imageMap);

    // Markdown → LaTeX
    questionText = markdownToLatex(questionText);

    // 构建 exercise 环境内容
    const bodyLines: string[] = [];

    // 题号行：难度 + 题源（+ 多选题标注）
    const tagLineParts: string[] = [];
    if (q.difficulty) {
      tagLineParts.push(`\\level{${difficultyToLevel(q.difficulty)}}`);
    }
    tagLineParts.push(`\\res{${q.source}${q.number}}`);
    if (isMultiSelect) {
      tagLineParts.push('(多选)');
    }
    bodyLines.push(tagLineParts.join(''));

    // 题干（独立一行，便于阅读）
    bodyLines.push(questionText);

    // 选项（图片行内、不居中）
    if ((isSingleSelect || isMultiSelect) && s['选项']) {
      const optsWithImages = convertLatexImages(s['选项'], imageMap, false);
      bodyLines.push(optionsToChoices(optsWithImages));
    }

    // 答案
    if (s['答案']) {
      let ansText = convertLatexImages(s['答案'], imageMap);
      ansText = markdownToLatex(ansText);
      bodyLines.push(`\\ans{${ansText}}`);
    }

    // 解析
    if (s['解析']) {
      let anaText = convertLatexImages(s['解析'], imageMap);
      anaText = markdownToLatex(anaText);
      bodyLines.push(`\\analysis{${anaText}}`);
    }

    // 个人备注
    if (s['我的备注']) {
      let memoText = convertLatexImages(s['我的备注'], imageMap);
      memoText = markdownToLatex(memoText);
      bodyLines.push(`\\memo{${memoText}}`);
    }

    // 留白等级：先算 level，再按题型查表
    const level = q.difficulty ? difficultyToLevel(q.difficulty) : null;
    const blankLevel = (isSingleSelect || isMultiSelect || isFillIn)
      ? (level && level >= 4 ? 'M' : level === 3 ? 'S' : 'SS')
      : (level && level >= 3 ? 'L' : 'M');

    // 组装 exercise（题间留空行，便于阅读代码）
    exerciseLines.push(`\\begin{exercise}[${blankLevel}]`);
    exerciseLines.push(bodyLines.join('\n'));
    exerciseLines.push(`\\end{exercise}`);
    exerciseLines.push('');
  });

  const exercisesTex = exerciseLines.join('\n');

  // --- 填充模板 ---
  const tex = `%%
%% 由 MathAtlas 网页端自动生成
%% 预设：教师版（题干 + 答案 + 解析全显示）
%%
\\documentclass[11pt,a4paper]{book}

\\usepackage{mathatlas}                % 需与 .sty 放在同目录

% ---------- 文档信息 ----------
\\title{\\fontsize{30}{30}\\selectfont\\bfseries\\textcolor{mycolor}{ {{TITLE}} }}
\\author{ {{AUTHOR}} }
\\date{ {{DATE}} }

% ---------- 预设模式 ----------
\\presetTeacher
\\raggedbottom           % 禁止页面垂直拉伸，内容自然排列

% ---------- 正文 ----------
\\begin{document}

${exercisesTex}

\\end{document}
`;

  return { tex, imageMap };
}
