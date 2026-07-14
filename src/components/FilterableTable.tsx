'use client';
import { Document, Packer, Paragraph, TextRun, ImageRun, AlignmentType, HeadingLevel } from 'docx';
import { useRouter } from 'next/navigation';
import { useState, useMemo, useEffect, Fragment } from 'react';
import type { QuestionMetaLight } from '@/lib/questions';
import JSZip from 'jszip';
import { clientEnv } from '@/lib/env';
import MathText from '@/components/MathText';
import BrowseView from '@/components/BrowseView';
import { buildLatexHandout } from '@/lib/latex';
import styles from './FilterableTable.module.css';

const PAGE_SIZE = 25;
const BROWSE_PAGE_SIZE = 10;

export default function FilterableTable({ questions }: { questions: QuestionMetaLight[] }) {
  const [grade, setGrade] = useState('');
  const [showKnowledgeTips, setShowKnowledgeTips] = useState(false);
  const [showSourceTips, setShowSourceTips] = useState(false);
  const [source, setSource] = useState('');
  const [numberMin, setNumberMin] = useState('');
  const [numberMax, setNumberMax] = useState('');
  const [examType, setExamType] = useState('');
  const [difficultyMin, setDifficultyMin] = useState('');
  const [difficultyMax, setDifficultyMax] = useState('');
  const [knowledge, setKnowledge] = useState('');
  const [tag, setTag] = useState('');
  const [qidInput, setQidInput] = useState('');
  const [page, setPage] = useState(1);
  const [expandedQid, setExpandedQid] = useState<number | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [showSolution, setShowSolution] = useState(false);
  const [selectedQids, setSelectedQids] = useState<Set<number>>(new Set());
  // 新增：记录用户勾选的先后顺序
  const [selectOrder, setSelectOrder] = useState<number[]>([]);
  const [loadedContents, setLoadedContents] = useState<Record<number, Record<string, string>>>({});
  const [loadingQid, setLoadingQid] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'browse'>('table');
  const [sortBy, setSortBy] = useState<'source' | 'number' | 'difficulty' | 'type'>('source');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const router = useRouter();
  const grades = useMemo(() => [...new Set(questions.map(q => q.grade).filter(Boolean))].sort(), [questions]);
  const sources = useMemo(() => [...new Set(questions.map(q => q.source).filter(Boolean))].sort(), [questions]);
  const examTypes = useMemo(() => [...new Set(questions.map(q => q.exam_type).filter(Boolean))].sort(), [questions]);
  const knowledges = useMemo(() => [...new Set(questions.flatMap(q => q.knowledge).filter(Boolean))].sort(), [questions]);
  const tags = useMemo(() => [...new Set(questions.flatMap(q => q.tags).filter(Boolean))].sort(), [questions]);

  const qidOrder = useMemo(() => {
    return qidInput
      .split(/[\n, ]+/)
      .filter(s => s.trim() !== '')
      .map(s => Number(s.trim()))
      .filter(n => !isNaN(n));
  }, [qidInput]);

  const qidSet = useMemo(() => new Set(qidOrder), [qidOrder]);

  const toNum = (numStr: string) => parseInt(numStr.replace(/^[A-Za-z]+/, ''), 10);

  const filtered = (() => {
    const base = questions.filter(q => {
      if (qidSet.size > 0 && !qidSet.has(q.qid)) return false;
      if (grade && q.grade !== grade) return false;
      if (source && q.source !== source) return false;
      if (examType && q.exam_type !== examType) return false;
      const num = toNum(q.number);
      if (numberMin && num < Number(numberMin)) return false;
      if (numberMax && num > Number(numberMax)) return false;
      if (difficultyMin && q.difficulty < Number(difficultyMin)) return false;
      if (difficultyMax && q.difficulty > Number(difficultyMax)) return false;
      if (knowledge && !q.knowledge.includes(knowledge)) return false;
      if (tag && !q.tags.includes(tag)) return false;
      return true;
    });
    // 按输入框的 qid 顺序排列（优先级最高）
    if (qidOrder.length > 0) {
      const idx = new Map(qidOrder.map((id, i) => [id, i]));
      base.sort((a, b) => {
        const ai = idx.get(a.qid) ?? Infinity;
        const bi = idx.get(b.qid) ?? Infinity;
        return ai - bi;
      });
    } else {
      // 用户选择的排序
      const dir = sortOrder === 'asc' ? 1 : -1;
      base.sort((a, b) => {
        let va: string | number, vb: string | number;
        switch (sortBy) {
          case 'number':
            va = toNum(a.number); vb = toNum(b.number); break;
          case 'difficulty':
            va = a.difficulty ?? 0; vb = b.difficulty ?? 0; break;
          case 'type':
            va = a.type || ''; vb = b.type || ''; break;
          case 'source':
          default:
            va = a.source; vb = b.source; break;
        }
        if (va < vb) return -1 * dir;
        if (va > vb) return 1 * dir;
        return 0;
      });
    }
    return base;
  })();

  // 筛选条件变化时回到第一页
  useEffect(() => {
    setPage(1);
  }, [grade, source, numberMin, numberMax, examType, difficultyMin, difficultyMax, knowledge, tag, qidInput, viewMode]);

  const pageSize = viewMode === 'browse' ? BROWSE_PAGE_SIZE : PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const clearAll = () => {
    setGrade(''); setSource(''); setNumberMin(''); setNumberMax('');
    setExamType(''); setDifficultyMin(''); setDifficultyMax('');
    setKnowledge(''); setTag(''); setQidInput('');
    setSelectedQids(new Set());
    setSelectOrder([]); // 清空勾选顺序
  };

  // ========== 修复：重写 handoutQuestions 排序逻辑 ==========
  const handoutQuestions = useMemo(() => {
    // 优先级1：手动输入qid列表，最高优先
    if (qidOrder.length > 0) {
      const idxMap = new Map(qidOrder.map((id, i) => [id, i]));
      return questions
        .filter(q => idxMap.has(q.qid))
        .sort((a, b) => idxMap.get(a.qid)! - idxMap.get(b.qid)!);
    }
    // 优先级2：手动勾选题目，严格按照勾选先后顺序
    if (selectedQids.size > 0) {
      const selectedList = questions.filter(q => selectedQids.has(q.qid));
      return [...selectedList].sort((a, b) => {
        const indexA = selectOrder.indexOf(a.qid);
        const indexB = selectOrder.indexOf(b.qid);
        return indexA - indexB;
      });
    }
    // 优先级3：无输入无勾选，使用筛选后的默认列表
    return filtered;
  }, [qidOrder, selectedQids, selectOrder, questions, filtered]);

  /** 加载缺失的正文内容，取回后合并到缓存 */
  const fetchMissing = async (qids: number[]): Promise<Record<number, Record<string, string>>> => {
    const needed = [...new Set(qids.filter(qid => !loadedContents[qid]))];
    if (needed.length === 0) return loadedContents;

    const results = await Promise.all(needed.map(async (qid) => {
      try {
        const res = await fetch(`/api/questions/${qid}`);
        if (res.ok) {
          return { qid, sections: (await res.json()).sections as Record<string, string> };
        }
      } catch { /* ignore */ }
      return { qid, sections: null as null | Record<string, string> };
    }));

    const fresh: Record<number, Record<string, string>> = {};
    for (const r of results) {
      if (r.sections) fresh[r.qid] = r.sections;
    }

    setLoadedContents(prev => ({ ...prev, ...fresh }));
    return { ...loadedContents, ...fresh };
  };

  /** 构建讲义 + 收集图片映射（原始 hash 名 → 新编号名） */
  const buildHandoutWithImages = async (): Promise<{ markdown: string; imageMap: Map<string, string> }> => {
    const allContents = await fetchMissing(handoutQuestions.map(q => q.qid));
    const imageMap = new Map<string, string>();

    /**
     * 把文本中的图片引用统一转换为 ![](zip内文件名)
     * 支持两种格式：
     *   1. Obsidian: ![[images/hash.jpg|342]]
     *   2. Markdown: ![](images/hash.jpg)  或  ![alt](images/hash.jpg)
     */
    const convertImages = (text: string, questionNum: number, counter: Map<number, number>): string => {
      // 辅助函数：把哈希文件名映射为 zip 内的新文件名，去重
      const mapImage = (hashFilename: string): string => {
        if (imageMap.has(hashFilename)) {
          return `![](${imageMap.get(hashFilename)})`;
        }
        const ext = hashFilename.split('.').pop() || 'jpg';
        const count = counter.get(questionNum) || 0;
        const newCount = count + 1;
        counter.set(questionNum, newCount);
        const newName = `${questionNum}-${newCount}.${ext}`;
        imageMap.set(hashFilename, newName);
        return `![](${newName})`;
      };

      // 格式一：Obsidian ![[images/hash.jpg|342]]
      text = text.replace(
        /!\[\[images\/([^\]|]+)(?:\|\d+)?\]\]/g,
        (_, hash: string) => mapImage(hash)
      );

      // 格式二：Markdown ![任意alt](images/hash.jpg) — 之前漏了这种！
      text = text.replace(
        /!\[[^\]]*\]\(images\/([^)]+)\)/g,
        (_, hash: string) => mapImage(hash)
      );

      return text;
    };

    const md = handoutQuestions.map((q, i) => {
      const s = allContents[q.qid];
      const num = i + 1;
      const imgCounter = new Map<number, number>();

      if (!s?.['题目']) {
        return `${num}. （内容加载失败）`;
      }

      let questionText = s['题目'];

      const type = q.type || '';
      const isMultiSelect = type === '多选题' || questionText.includes('[多选]');
      const isSingleSelect = type === '单选题' || questionText.includes('[选]');
      const isFillIn = type === '填空题' || questionText.includes('[填]');

      const numberPrefix = isMultiSelect ? `${num}.(多选)` : `${num}.`;

      questionText = questionText
        .replace(/\[多选\]/g, '')
        .replace(/\[选\]/g, '')
        .replace(/\[填\]/g, '____')
        .trim();

      if ((isSingleSelect || isMultiSelect) && !questionText.endsWith('()')) {
        questionText += '()';
      }

      questionText = convertImages(questionText, num, imgCounter);

      const lines: string[] = [];
      lines.push(`${numberPrefix} ${questionText}`);

      // 选项
      if ((isSingleSelect || isMultiSelect) && s['选项']) {
        lines.push(convertImages(s['选项'], num, imgCounter));
      }

      // 【答案】
      if (s['答案']) {
        lines.push(`【答案】${convertImages(s['答案'], num, imgCounter)}`);
      }

      // 【来源】
      lines.push(`【来源】${q.source}${q.number}`);

      // 【备注】
      if (s['我的备注']) {
        lines.push(`【备注】${convertImages(s['我的备注'], num, imgCounter)}`);
      }

      // 【AI备注】
      const aiNote = s['AI 备注'] || s['AI备注'];
      if (aiNote) {
        lines.push(`【AI备注】${convertImages(aiNote, num, imgCounter)}`);
      }

      // 【解析】
      if (s['解析']) {
        lines.push(`【解析】${convertImages(s['解析'], num, imgCounter)}`);
      }

      return lines.join('\n');
    }).join('\n\n\n');

    return { markdown: md, imageMap };
  };

  /** 复制为纯文本 Markdown（图片保持 Obsidian 语法，不处理） */
  const copyAsMarkdown = async () => {
    const { markdown } = await buildHandoutWithImages();
    // 还原回 Obsidian 格式（复制时用原始格式）
    await navigator.clipboard.writeText(markdown);
    alert(`已复制 ${handoutQuestions.length} 道题目（含完整题干）到剪贴板`);
  };

  /** 打包下载 zip（讲义 .md + 图片） */
  const downloadZip = async () => {
    const { markdown, imageMap } = await buildHandoutWithImages();

    const zip = new JSZip();

    // 添加讲义
    zip.file('讲义.md', markdown);

    // 批量获取图片
    const downloadPromises: Promise<void>[] = [];
    imageMap.forEach((newName, hashFilename) => {
      downloadPromises.push(
        fetch(`/api/images/${encodeURIComponent(hashFilename)}`)
          .then(async (res) => {
            if (res.ok) {
              const blob = await res.blob();
              zip.file(newName, blob);
            } else {
              console.warn(`图片缺失: ${hashFilename}`);
            }
          })
          .catch(() => console.warn(`图片加载失败: ${hashFilename}`))
      );
    });

    await Promise.all(downloadPromises);

    // 生成时间戳文件名（精确到秒）
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

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `讲义_Markdown_${ts}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /** 导出勾选题目为 Word .docx */
  const downloadWord = async () => {
    // 1. 获取所有勾选题目完整内容（复用你现有的加载逻辑）
    const allContents = await fetchMissing(handoutQuestions.map(q => q.qid));
    const imageBinMap = new Map<string, { arrayBuf: ArrayBuffer; ext: string }>();

    // 预加载所有图片，一次性转好 ArrayBuffer，后续不再await
    const loadAllImages = async () => {
      const allImageHash = new Set<string>();
      const collectImgHash = (text: string) => {
        // 两种图片正则，用exec精准捕获文件名分组
        const obsidianRegex = /!\[\[images\/([^\]|]+)(?:\|\d+)?\]\]/g;
        const mdImageRegex = /!\[[^\]]*\]\(images\/([^)]+)\)/g;
        let res: RegExpExecArray | null;

        // Obsidian 图片
        while ((res = obsidianRegex.exec(text))) {
          allImageHash.add(res[1]);
        }
        // Markdown 标准图片
        while ((res = mdImageRegex.exec(text))) {
          allImageHash.add(res[1]);
        }
      };

      // 遍历所有题目文本收集图片
      handoutQuestions.forEach(q => {
        const s = allContents[q.qid];
        if (!s) return;
        collectImgHash(s['题目'] ?? '');
        collectImgHash(s['选项'] ?? '');
        collectImgHash(s['答案'] ?? '');
        collectImgHash(s['解析'] ?? '');
        collectImgHash(s['我的备注'] ?? '');
        collectImgHash(s['AI备注'] ?? s['AI 备注'] ?? '');
      });

      // 批量加载图片
      const tasks: Promise<void>[] = [];
      const failList: string[] = [];
      for (const hash of allImageHash) {
        tasks.push((async () => {
          try {
            const res = await fetch(`/api/images/${encodeURIComponent(hash)}`);
            if (!res.ok) {
              failList.push(hash);
              return;
            }
            const blob = await res.blob();
            const arrayBuf = await blob.arrayBuffer();
            const ext = hash.split('.').pop() || 'jpg';
            imageBinMap.set(hash, { arrayBuf, ext });
          } catch (err) {
            failList.push(hash);
            console.warn('图片加载失败', hash, err);
          }
        })());
      }
      await Promise.all(tasks);

      if (failList.length > 0) {
        alert(`存在${failList.length}张图片无法加载，Word内将显示[图片缺失]`);
      }
    };

    await loadAllImages();

    // 2. 把单道题目文本转为 Word 段落数组（纯同步，无任何await）
    const buildQuestionParagraphs = (q: QuestionMetaLight, idx: number) => {
      const s = allContents[q.qid];
      const paragraphs: Paragraph[] = [];
      const questionNum = idx + 1;

      // 工具：把md文本转段落，处理图片（同步，无await）
      const textToParagraphs = (rawText: string): Paragraph[] => {
        const paras: Paragraph[] = [];
        const lines = rawText.split('\n');
        for (const line of lines) {
          const children: (TextRun | ImageRun)[] = [];
          let rest = line;
          const obsidianReg = /!\[\[images\/([^\]|]+)(?:\|\d+)?\]\]/;
          const mdImgReg = /!\[[^\]]*\]\(images\/([^)]+)\)/;

          while (true) {
            let match: RegExpMatchArray | null = null;
            const obsMatch = rest.match(obsidianReg);
            const mdMatch = rest.match(mdImgReg);

            if (obsMatch && (!mdMatch || obsMatch.index! < mdMatch.index!)) {
              match = obsMatch;
            } else if (mdMatch) {
              match = mdMatch;
            }

            if (!match) break;

            const beforeText = rest.slice(0, match.index);
            if (beforeText) {
              children.push(new TextRun({ text: beforeText }));
            }

            const hash = match[1];
            const imgCache = imageBinMap.get(hash);
            if (imgCache) {
              children.push(
                new ImageRun({
                  data: imgCache.arrayBuf,
                  transformation: { width: 450, height: 300 },
                  type: imgCache.ext === 'png' ? "png" : "jpeg",
                })
              );
            } else {
              children.push(new TextRun({ text: `[图片缺失:${hash}]` }));
            }

            rest = rest.slice(match.index + match[0].length);
          }

          if (rest) children.push(new TextRun({ text: rest }));
          paras.push(new Paragraph({ children }));
        }
        return paras;
      };

      if (!s?.['题目']) {
        paragraphs.push(new Paragraph({
          children: [new TextRun(`#${questionNum} 题目加载失败`)],
        }));
        return paragraphs;
      }

      // 题号标题
      paragraphs.push(new Paragraph({
        text: `${questionNum}. ${q.type || '题目'}（${q.source}${q.number}）`,
        heading: HeadingLevel.HEADING_2,
      }));

      // 题干
      paragraphs.push(...textToParagraphs(s['题目']));

      // 选项
      if (s['选项']) {
        paragraphs.push(new Paragraph({ text: '【选项】', heading: HeadingLevel.HEADING_3 }));
        paragraphs.push(...textToParagraphs(s['选项']));
      }

      // 答案
      if (s['答案']) {
        paragraphs.push(new Paragraph({ text: '【答案】', heading: HeadingLevel.HEADING_3 }));
        paragraphs.push(...textToParagraphs(s['答案']));
      }

      // 解析
      if (s['解析']) {
        paragraphs.push(new Paragraph({ text: '【解析】', heading: HeadingLevel.HEADING_3 }));
        paragraphs.push(...textToParagraphs(s['解析']));
      }

      // 备注
      if (s['我的备注']) {
        paragraphs.push(new Paragraph({ text: '【我的备注】', heading: HeadingLevel.HEADING_3 }));
        paragraphs.push(...textToParagraphs(s['我的备注']));
      }
      const aiNote = s['AI 备注'] || s['AI备注'];
      if (aiNote) {
        paragraphs.push(new Paragraph({ text: '【AI备注】', heading: HeadingLevel.HEADING_3 }));
        paragraphs.push(...textToParagraphs(aiNote));
      }

      // 分割线
      paragraphs.push(new Paragraph({ children: [new TextRun('——————————————————————')] }));
      return paragraphs;
    };

    // 3. 构建完整 Word 文档
    const doc = new Document({
      sections: [
        {
          properties: {},
          children: handoutQuestions.flatMap((q, idx) => buildQuestionParagraphs(q, idx)),
        },
      ],
    });

    // 4. 生成并下载 docx 文件
    const buffer = await Packer.toBuffer(doc);
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    const url = URL.createObjectURL(blob);

    // 时间戳文件名（复用你原有逻辑）
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

    const a = document.createElement('a');
    a.href = url;
    a.download = `讲义_Word_${ts}.docx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /** 将勾选的题目加入试题栏 */
  const addToQuestionBar = async () => {
    // 改为检查 selectedQids 是否有值
    if (selectedQids.size === 0) {
      alert('请先勾选题目');
      return;
    }

    // 获取所有勾选题目的完整内容
    const allContents = await fetchMissing(handoutQuestions.map(q => q.qid));

    // 组装成 AddPage 能识别的格式（与粘贴板格式一致）
    const blocks: string[] = [];

    for (const q of handoutQuestions) {
      const s = allContents[q.qid];
      if (!s) continue;

      // 构建 YAML frontmatter
      const yamlLines = [
        '---',
        `qid: ${q.qid}`,
        `grade: ${q.grade || ''}`,
        `source: ${q.source || ''}`,
        `number: ${q.number || ''}`,
        `type: ${q.type || ''}`,
        `difficulty: ${q.difficulty ?? ''}`,
        `semester: ${q.semester || ''}`,
        `exam_type: ${q.exam_type || ''}`,
        `knowledge: [${(q.knowledge || []).join(', ')}]`,
        `ai_tags: []`,
        `tags: [${(q.tags || []).join(', ')}]`,
        `status: 待入库`,
        `selected: false`,
        '---',
      ].join('\n');

      // 构建题目内容
      const sections = [
        `## 题目`,
        (s['题目'] || '').trim(),
        '',
        s['选项'] ? `## 选项\n${s['选项'].trim()}` : '',
        '',
        `## 备注`,
        `### 我的备注`,
        s['我的备注'] || '',
        `### AI备注`,
        s['AI备注'] || s['AI 备注'] || '',
        '',
        `## 答案`,
        s['答案'] || '',
        '',
        s['解析'] ? `## 解析\n${s['解析'].trim()}` : '',
      ].join('\n');

      blocks.push(`${yamlLines}\n${sections}`);
    }

    // 存入 localStorage
    localStorage.setItem('questionBarData', blocks.join('\n\n==========\n\n'));

    // 跳转到添加页面
    router.push('/examBasket');
  };
  /** 一键导出到本地 LATEX 目录 */
  const exportToLocal = async () => {
    const qids = handoutQuestions.map(q => q.qid);
    try {
      const res = await fetch('/api/export-latex', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qids }),
      });
      const data = await res.json();
      if (data.ok) {
        alert(`已导出 ${data.count} 道题目 → ${data.folder}`);
      } else {
        alert('导出失败：' + (data.error || '未知错误'));
      }
    } catch (e: any) {
      alert('导出失败：' + e.message);
    }
  };

  /** 复制为 LaTeX 代码 */
  const copyAsLatex = async () => {
    const allContents = await fetchMissing(handoutQuestions.map(q => q.qid));
    const { tex } = buildLatexHandout(handoutQuestions, allContents);
    await navigator.clipboard.writeText(tex);
    alert(`已复制 ${handoutQuestions.length} 道题目的 LaTeX 代码到剪贴板`);
  };

  /** 打包下载 LaTeX zip（.tex + .sty + 图片） */
  const downloadLatexZip = async () => {
    const allContents = await fetchMissing(handoutQuestions.map(q => q.qid));
    const { tex, imageMap } = buildLatexHandout(handoutQuestions, allContents);
    const zip = new JSZip();

    // 添加 .tex 文件
    zip.file('讲义.tex', tex);

    // 添加 .sty 样式文件
    try {
      const styRes = await fetch('/mathatlas.sty');
      if (styRes.ok) {
        const styText = await styRes.text();
        zip.file('mathatlas.sty', styText);
      }
    } catch { /* .sty 获取失败不影响导出 */ }

    // 批量获取图片（放入 images/ 子目录）
    const downloadPromises: Promise<void>[] = [];
    imageMap.forEach((newName, hashFilename) => {
      downloadPromises.push(
        fetch(`/api/images/${encodeURIComponent(hashFilename)}`)
          .then(async (res) => {
            if (res.ok) {
              const blob = await res.blob();
              zip.file(`images/${newName}`, blob);
            } else {
              console.warn(`图片缺失: ${hashFilename}`);
            }
          })
          .catch(() => console.warn(`图片加载失败: ${hashFilename}`))
      );
    });

    await Promise.all(downloadPromises);

    // 生成时间戳文件名（精确到秒）
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

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `讲义_LaTeX_${ts}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ========== 修复：同步维护勾选顺序数组 ==========
  const toggleSelect = (qid: number) => {
    setSelectedQids(prev => {
      const next = new Set(prev);
      if (next.has(qid)) {
        // 取消勾选，从顺序数组移除
        next.delete(qid);
        setSelectOrder(order => order.filter(id => id !== qid));
      } else {
        // 新增勾选，追加到顺序末尾
        next.add(qid);
        setSelectOrder(order => [...order, qid]);
      }
      return next;
    });
  };

  // ========== 修复：全选同步写入顺序 ==========
  const toggleSelectAll = () => {
    if (selectedQids.size === filtered.length) {
      setSelectedQids(new Set());
      setSelectOrder([]);
    } else {
      const allQids = filtered.map(q => q.qid);
      setSelectedQids(new Set(allQids));
      setSelectOrder(allQids);
    }
  };

  const handleRowClick = async (qid: number) => {
    if (expandedQid === qid) {
      setExpandedQid(null);
    } else {
      setExpandedQid(qid);
      setShowAnswer(false);
      setShowSolution(false);
      if (!loadedContents[qid]) {
        setLoadingQid(qid);
        await fetchMissing([qid]);
        setLoadingQid(null);
      }
    }
  };

  // 生成页码列表（带省略号）
  const pageNumbers = useMemo(() => {
    const pages: (number | '...')[] = [];
    const delta = 2; // 当前页两侧各显示几个页码
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= safePage - delta && i <= safePage + delta)) {
        pages.push(i);
      } else if (pages[pages.length - 1] !== '...') {
        pages.push('...');
      }
    }
    return pages;
  }, [totalPages, safePage]);

  return (
    <div className={styles.container}>
      {/* 手动输入 qid */}
      <div className={styles.qidArea}>
        <label className={styles.qidLabel}>
          手动输入 qid
          <br />
          <textarea
            rows={3}
            className={styles.qidTextarea}
            placeholder="粘贴 qid，每行一个，或空格/逗号分隔&#10;例如：&#10;1780921807044&#10;1780921807045&#10;1780921807046"
            value={qidInput}
            onChange={e => setQidInput(e.target.value)}
          />
        </label>
      </div>

      {/* 筛选栏 */}
      <div className={styles.filterBar}>
        <label className={styles.filterLabel}>
          年级
          <select className={styles.filterSelect} value={grade} onChange={e => setGrade(e.target.value)}>
            <option value="">全部</option>
            {grades.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </label>

        <label className={styles.filterLabel}>
          类别
          <select className={styles.filterSelect} value={examType} onChange={e => setExamType(e.target.value)}>
            <option value="">全部</option>
            {examTypes.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>

        {/* 改造后的“来源”标签 (从 select 改成 联想输入) */}
        <label
          className={styles.filterLabel}
          style={{ position: "relative", flex: '1 1 150px' }}

        >
          来源
          <input
            className={styles.filterSelect}
            type='search'
            placeholder="输入来源搜索"
            value={source}
            onChange={(e) => {
              const val = e.target.value;
              setSource(val);
            }}
            onFocus={() => setShowSourceTips(true)}
            onBlur={() => setTimeout(() => setShowSourceTips(false), 180)}
          />

          {/* 联想弹窗 */}
          {showSourceTips && (
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 4px)",
                left: 0,
                width: "100%",
                maxHeight: "200px",
                overflowY: "auto",
                background: "#fff",
                border: "1px solid #ddd",
                borderRadius: "4px",
                zIndex: 999,
                boxShadow: "0 4px 12px rgba(0,0,0,0.06)" // 加个阴影更有层次
              }}
            >
              <div
                onClick={() => setSource("")}
                style={{ padding: "4px 12px", cursor: "pointer", fontSize: "16px", color: "#1a1a1a" }}
                onMouseOver={(e) => {
                  const dom = e.target as HTMLDivElement;
                  dom.style.background = "#f0f7ff";
                }}
                onMouseOut={(e) => {
                  const dom = e.target as HTMLDivElement;
                  dom.style.background = "transparent";
                }}
              >
                全部
              </div>
              {sources
                .filter((s) => s.includes(source))
                .map((s) => (
                  <div
                    key={s}
                    onClick={() => setSource(s)}
                    style={{ padding: "3px 12px", cursor: "pointer", fontSize: "15px", color: "#1a1a1a" }}
                    onMouseOver={(e) => {
                      const dom = e.target as HTMLDivElement;
                      dom.style.background = "#f0f7ff";
                    }}
                    onMouseOut={(e) => {
                      const dom = e.target as HTMLDivElement;
                      dom.style.background = "transparent";
                    }}
                  >
                    {s}
                  </div>
                ))}
            </div>
          )}
        </label>


        <label className={styles.filterLabel}>
          题号范围
          <span className={styles.rangeGroup}>
            <input className={styles.filterInput} type="number" placeholder="最小" value={numberMin} onChange={e => setNumberMin(e.target.value)} min={1} step={1} />
            ~
            <input className={styles.filterInput} type="number" placeholder="最大" value={numberMax} onChange={e => setNumberMax(e.target.value)} min={1} step={1} />
          </span>
        </label>

        <label className={styles.filterLabel}>
          难度范围
          <span className={styles.rangeGroup}>
            <input className={styles.filterInput} type="number" placeholder="最小" value={difficultyMin} onChange={e => setDifficultyMin(e.target.value)} min={0} max={1} step={0.1} />
            ~
            <input className={styles.filterInput} type="number" placeholder="最大" value={difficultyMax} onChange={e => setDifficultyMax(e.target.value)} min={0} max={1} step={0.1} />
          </span>
        </label>

        {/* 👇 新增：强制换行 */}
        <div style={{ flexBasis: '100%', width: 0, height: 0 }} />
        {/* 改造后的“知识点”标签 (调整了文字大小和颜色，满足又黑又大) */}
        <label
          className={styles.filterLabel}
          style={{ position: "relative", flex: '2 1 250px' }}
        >
          知识点
          <input
            className={styles.filterSelect}
            placeholder="输入知识点搜索"
            type='search'
            value={knowledge}
            onChange={(e) => {
              const val = e.target.value;
              setKnowledge(val);
            }}
            onFocus={() => setShowKnowledgeTips(true)}
            onBlur={() => setTimeout(() => setShowKnowledgeTips(false), 180)}
          />

          {/* 联想弹窗 */}
          {showKnowledgeTips && (
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 4px)",
                left: 0,
                width: "100%",
                maxHeight: "200px",
                overflowY: "auto",
                background: "#fff",
                border: "1px solid #ddd",
                borderRadius: "4px",
                zIndex: 999,
                boxShadow: "0 4px 12px rgba(0,0,0,0.06)"
              }}
            >
              <div
                onClick={() => setKnowledge("")}
                style={{ padding: "4px 12px", cursor: "pointer", fontSize: "16px", color: "#1a1a1a" }}
                onMouseOver={(e) => {
                  const dom = e.target as HTMLDivElement;
                  dom.style.background = "#f0f7ff";
                }}
                onMouseOut={(e) => {
                  const dom = e.target as HTMLDivElement;
                  dom.style.background = "transparent";
                }}
              >
                全部
              </div>
              {knowledges
                .filter((k) => k.includes(knowledge))
                .map((k) => (
                  <div
                    key={k}
                    onClick={() => setKnowledge(k)}
                    style={{ padding: "4px 12px", cursor: "pointer", fontSize: "15px", color: "#1a1a1a" }}
                    onMouseOver={(e) => {
                      const dom = e.target as HTMLDivElement;
                      dom.style.background = "#f0f7ff";
                    }}
                    onMouseOut={(e) => {
                      const dom = e.target as HTMLDivElement;
                      dom.style.background = "transparent";
                    }}
                  >
                    {k}
                  </div>
                ))}
            </div>
          )}
        </label>
        <label className={styles.filterLabel}>
          标签
          <select className={styles.filterSelect} value={tag} onChange={e => setTag(e.target.value)}>
            <option value="">全部</option>
            {tags.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>

        <label className={styles.filterLabel}>
          排序
          <span className={styles.rangeGroup}>
            <select className={styles.filterSelect} value={sortBy} onChange={e => { setSortBy(e.target.value as any); setPage(1); }}>
              <option value="source">来源</option>
              <option value="number">题号</option>
              <option value="difficulty">难度</option>
              <option value="type">题型</option>
            </select>
            <button
              className={styles.sortToggle}
              onClick={() => { setSortOrder(o => o === 'asc' ? 'desc' : 'asc'); setPage(1); }}
              title={sortOrder === 'asc' ? '升序 → 降序' : '降序 → 升序'}
            >
              {sortOrder === 'asc' ? '↑' : '↓'}
            </button>
          </span>
        </label>

        <button className={styles.btnClear} onClick={clearAll}>清除筛选</button>
      </div>

      {/* 视图切换 */}
      <div className={styles.viewTabs}>
        <button
          className={`${styles.viewTab} ${viewMode === 'table' ? styles.viewTabActive : ''}`}
          onClick={() => setViewMode('table')}
        >
          📋 表格
        </button>
        <button
          className={`${styles.viewTab} ${viewMode === 'browse' ? styles.viewTabActive : ''}`}
          onClick={() => setViewMode('browse')}
        >
          📖 浏览
        </button>
      </div>

      <div className={styles.toolbar}>
        <span className={styles.resultCount}>
          筛选结果：{filtered.length} 道题目
          {selectedQids.size > 0 && ` · 已勾选 ${selectedQids.size} 道`}
        </span>
        {filtered.length > 0 && (
          <>
            <button className={styles.btnAction} onClick={copyAsMarkdown}>复制为 Markdown</button>
            <button className={styles.btnAction} onClick={downloadZip}>打包下载 Markdown (.zip)</button>
            <button className={styles.btnAction} onClick={copyAsLatex}>复制为 LaTeX</button>
            <button className={styles.btnAction} onClick={downloadLatexZip}>打包下载 LaTeX (.zip)</button>
            <button className={styles.btnAction} onClick={exportToLocal}>LaTeX 导出到本地</button>
            {/* <button className={styles.btnAction} onClick={downloadWord}>Word 导出到本地</button> */}

            <button className={styles.btnAction} onClick={addToQuestionBar}>
              📋 加入试题栏
            </button>

          </>
        )}
      </div>

      {viewMode === 'browse' ? (
        <BrowseView
          questions={paginated}
          loadedContents={loadedContents}
          selectedQids={selectedQids}
          loadingQid={loadingQid}
          onToggleSelect={toggleSelect}
          onLoadContent={(qid) => {
            if (!loadedContents[qid]) {
              setLoadingQid(qid);
              fetchMissing([qid]).then(() => setLoadingQid(null));
            }
          }}
          onRefresh={(qid) => {
            setLoadedContents(prev => {
              const next = { ...prev };
              delete next[qid];
              return next;
            });
            setLoadingQid(qid);
            fetchMissing([qid]).then(() => setLoadingQid(null));
          }}
        />
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th style={{ width: 36 }}>
                <input
                  type="checkbox"
                  checked={filtered.length > 0 && selectedQids.size === filtered.length}
                  onChange={toggleSelectAll}
                />
              </th>
              <th>qid</th>
              <th>来源</th>
              <th>题号</th>
              <th>题型</th>
              <th>年级</th>
              <th>类别</th>
              <th>难度</th>
              <th>知识点</th>
              <th>标签</th>
            </tr>
          </thead>
          <tbody>
            {paginated.map(q => {
              const isExpanded = expandedQid === q.qid;
              const s = loadedContents[q.qid];
              const isLoading = loadingQid === q.qid;
              return (
                <Fragment key={q.qid}>
                  <tr
                    className={isExpanded ? styles.expandedRow : undefined}
                    onClick={() => handleRowClick(q.qid)}
                  >
                    <td onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedQids.has(q.qid)}
                        onChange={() => toggleSelect(q.qid)}
                      />
                    </td>
                    <td>{q.qid}</td>
                    <td>{q.source}</td>
                    <td>{q.number}</td>
                    <td>{q.type}</td>
                    <td>{q.grade}</td>
                    <td>{q.exam_type}</td>
                    <td>{q.difficulty}</td>
                    <td>{q.knowledge.join('、')}</td>
                    <td>{q.tags.join('、')}</td>
                  </tr>
                  {isExpanded && (
                    <tr key={`${q.qid}-detail`}>
                      <td colSpan={12} style={{ padding: '1.5rem', border: 'none' }}>
                        <div className={styles.detail} style={{ marginTop: 0 }}>
                          <div className={styles.detailMeta}>
                            <strong>{q.source}</strong> · {q.number} · {q.type} · {q.grade} · {q.exam_type} · 难度 {q.difficulty}
                            {' · '}

                            <a
                              className={styles.obsidianLink}
                              href={`obsidian://open?vault=${encodeURIComponent(clientEnv.vaultPath.split(/[\\\/]/).pop() || clientEnv.defaultSubject)}&file=${encodeURIComponent(q.filePath.replace(/\\/g, '/').split((clientEnv.vaultPath.split(/[\\\/]/).pop() || clientEnv.defaultSubject) + '/').pop() || '')}`}
                              title="在 Obsidian 中打开"
                              onClick={e => e.stopPropagation()}
                            >
                              Obsidian
                            </a>
                          </div>

                          {isLoading && (
                            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                              加载中...
                            </div>
                          )}

                          {s && (
                            <>
                              {s['题目'] && (
                                <div className={styles.detailSection}>
                                  <h3>题目</h3>
                                  <MathText text={s['题目']} />
                                </div>
                              )}

                              {s['选项'] && (
                                <div className={styles.detailSection}>
                                  <h3>选项</h3>
                                  <MathText text={s['选项']} />
                                </div>
                              )}

                              {s['我的备注'] && (
                                <div className={`${styles.detailNote} ${styles.detailNoteMine}`}>
                                  <h3>我的备注</h3>
                                  <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0, color: 'var(--text)' }}>{s['我的备注']}</pre>
                                </div>
                              )}

                              {(s['AI 备注'] || s['AI备注']) && (
                                <div className={`${styles.detailNote} ${styles.detailNoteAI}`}>
                                  <h3>AI 备注</h3>
                                  <MathText text={s['AI 备注'] || s['AI备注']} />
                                </div>
                              )}

                              {s['答案'] && (
                                <div className={styles.detailSection}>
                                  <h3 className={styles.detailFold} onClick={() => setShowAnswer(!showAnswer)}>
                                    {showAnswer ? '▼' : '▶'} 答案
                                  </h3>
                                  {showAnswer && <MathText text={s['答案']} />}
                                </div>
                              )}

                              {s['解析'] && (
                                <div className={styles.detailSection}>
                                  <h3 className={styles.detailFold} onClick={() => setShowSolution(!showSolution)}>
                                    {showSolution ? '▼' : '▶'} 解析
                                  </h3>
                                  {showSolution && <MathText text={s['解析']} />}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}

      {/* 分页控件 */}
      {totalPages > 1 && (
        <div className={styles.pagination}>
          <button
            className={styles.pageBtn}
            disabled={safePage <= 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}
          >
            上一页
          </button>

          {pageNumbers.map((p, i) =>
            p === '...' ? (
              <span key={`ellipsis-${i}`} className={styles.pageEllipsis}>…</span>
            ) : (
              <button
                key={p}
                className={`${styles.pageBtn} ${p === safePage ? styles.pageActive : ''}`}
                onClick={() => setPage(p)}
              >
                {p}
              </button>
            )
          )}

          <button
            className={styles.pageBtn}
            disabled={safePage >= totalPages}
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
          >
            下一页
          </button>

          <span className={styles.pageInfo}>
            第 {safePage}/{totalPages} 页
          </span>
        </div>
      )}
    </div>
  );
}