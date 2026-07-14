'use client';
import { useRouter } from 'next/navigation';
import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import MathText from '@/components/MathText';
import JSZip from 'jszip';
import { Document, Packer, Paragraph, TextRun, ImageRun, HeadingLevel } from 'docx';
import { buildLatexHandout } from '@/lib/latex';
import styles from './page.module.css';
import { clientEnv } from '@/lib/env';
// 这是备份，导出word升级前的备份，浏览器导出的那种
/**
 * 解析后的题目结构
 */
interface ParsedQuestion {
  sections: Record<string, string>;
  yaml: Record<string, any>;
  raw: string;
  body: string;
  startIndex: number;
  endIndex: number;
}

/** 解析单道题的 YAML 和 sections */
function parseOneQuestion(trimmed: string): { yaml: Record<string, any>; body: string; sections: Record<string, string> } {
  let yaml: Record<string, any> = {};
  let body = trimmed;

  try {
    const fmMatch = trimmed.match(/^---\n([\s\S]*?)\n---\n/);
    if (fmMatch) {
      body = trimmed.slice(fmMatch[0].length);
      fmMatch[1].split('\n').forEach(line => {
        const colonIdx = line.indexOf(':');
        if (colonIdx > 0) {
          const key = line.slice(0, colonIdx).trim();
          let val: any = line.slice(colonIdx + 1).trim();
          if (val.startsWith('[') && val.endsWith(']')) {
            val = val.slice(1, -1).split(',').map((s: string) => s.trim()).filter(Boolean);
          }
          yaml[key] = val;
        }
      });
    }
  } catch { /* 解析失败就忽略 */ }

  const sections: Record<string, string> = {};
  const parts = body.split(/\n(?=## )/);
  for (const part of parts) {
    const m = part.match(/^## (.+?)\n([\s\S]*)$/);
    if (!m) continue;
    const title = m[1].trim();
    const content = m[2].trim();
    if (title === '备注') {
      const subs = content.split(/\n(?=### )/);
      for (const sub of subs) {
        const sm = sub.match(/^### (.+?)\n([\s\S]*)$/);
        if (sm) sections[sm[1].trim()] = sm[2].trim();
      }
    } else {
      sections[title] = content;
    }
  }

  return { yaml, body, sections };
}

/** 拆分所有题目 */
function parseQuestions(text: string): ParsedQuestion[] {
  const results: ParsedQuestion[] = [];
  const sepRe = /\n?==========\n?/g;
  let blockStart = 0;
  let match: RegExpExecArray | null;

  while ((match = sepRe.exec(text)) !== null) {
    const blockEnd = match.index;
    const block = text.slice(blockStart, blockEnd).trim();
    if (block) {
      const parsed = parseOneQuestion(block);
      results.push({ ...parsed, raw: block, startIndex: blockStart, endIndex: blockEnd });
    }
    blockStart = match.index + match[0].length;
  }

  const lastBlock = text.slice(blockStart).trim();
  if (lastBlock) {
    const parsed = parseOneQuestion(lastBlock);
    results.push({ ...parsed, raw: lastBlock, startIndex: blockStart, endIndex: text.length });
  }

  return results;
}

/** 将题目数组重新组装为完整的文本 */
function questionsToText(questions: ParsedQuestion[]): string {
  return questions.map(q => q.raw).join('\n\n==========\n\n');
}

export default function ExamBasketPage() {
  const [input, setInput] = useState('');
  const [message, setMessage] = useState('');
  const [uploading, setUploading] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null);
  const router = useRouter();

  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  // 拖动相关状态
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // 从 localStorage 读取试题栏数据
  useEffect(() => {
    const stored = localStorage.getItem('questionBarData');
    if (stored) {
      setInput(stored);
      localStorage.removeItem('questionBarData');
    }
  }, []);

  // ===== 图片上传 =====
  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/images/upload', { method: 'POST', body: form });
      if (!res.ok) throw new Error('上传失败');
      const data = await res.json();
      const ta = textareaRef.current;
      if (ta) {
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const imgLine = `\n![${file.name.split('.')[0] || 'img'}](images/${data.filename})\n`;
        setInput(prev => prev.slice(0, start) + imgLine + prev.slice(end));
        setTimeout(() => {
          ta.focus();
          ta.selectionStart = ta.selectionEnd = start + imgLine.length;
        }, 50);
      }
    } catch {
      setMessage('❌ 图片上传失败');
    } finally {
      setUploading(false);
    }
  };

  // ===== 题目解析 =====
  const questions = useMemo(() => {
    if (!input.trim()) return [];
    return parseQuestions(input);
  }, [input]);

  // ===== 移除某道题目 =====
  const removeQuestion = useCallback((index: number) => {
    const newQuestions = [...questions];
    newQuestions.splice(index, 1);
    const newText = questionsToText(newQuestions);
    setInput(newText);
    setMessage(`✅ 已移除第 ${index + 1} 道题目`);
    setTimeout(() => setMessage(''), 2000);
  }, [questions]);

  // ===== 上移题目 =====
  const moveUp = useCallback((index: number) => {
    if (index === 0) return;
    const newQuestions = [...questions];
    [newQuestions[index - 1], newQuestions[index]] = [newQuestions[index], newQuestions[index - 1]];
    const newText = questionsToText(newQuestions);
    setInput(newText);
  }, [questions]);

  // ===== 下移题目 =====
  const moveDown = useCallback((index: number) => {
    if (index === questions.length - 1) return;
    const newQuestions = [...questions];
    [newQuestions[index], newQuestions[index + 1]] = [newQuestions[index + 1], newQuestions[index]];
    const newText = questionsToText(newQuestions);
    setInput(newText);
  }, [questions]);

  // ===== 拖动开始 =====
  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
    // 让拖动的元素半透明
    const el = e.currentTarget as HTMLElement;
    setTimeout(() => {
      el.style.opacity = '0.4';
    }, 0);
  }, []);

  // ===== 拖动结束 =====
  const handleDragEnd = useCallback((e: React.DragEvent) => {
    const el = e.currentTarget as HTMLElement;
    el.style.opacity = '1';
    setDragIndex(null);
    setDragOverIndex(null);
  }, []);

  // ===== 拖动经过 =====
  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  }, []);

  // ===== 拖动离开 =====
  const handleDragLeave = useCallback(() => {
    setDragOverIndex(null);
  }, []);

  // ===== 放置 =====
  const handleDrop = useCallback((e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    const dragIdx = dragIndex;
    if (dragIdx === null || dragIdx === dropIndex) return;

    const newQuestions = [...questions];
    const [removed] = newQuestions.splice(dragIdx, 1);
    newQuestions.splice(dropIndex, 0, removed);

    const newText = questionsToText(newQuestions);
    setInput(newText);
    setDragIndex(null);
    setDragOverIndex(null);
  }, [questions, dragIndex]);

  // ===== 光标位置变化 → 高亮对应卡片 =====
  const handleCursorMove = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta || questions.length === 0) return;
    const pos = ta.selectionStart;
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (pos >= q.startIndex && pos <= q.endIndex) {
        setHighlightedIndex(i);
        cardRefs.current[i]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
      }
    }
    setHighlightedIndex(null);
  }, [questions]);

  // ===== 点击预览卡片 → 跳转到原文 =====
  const handleCardClick = (index: number) => {
    const ta = textareaRef.current;
    if (!ta || index >= questions.length) return;
    const q = questions[index];
    ta.focus();
    ta.setSelectionRange(q.startIndex, q.endIndex);
    const textBefore = input.slice(0, q.startIndex);
    const lineCount = textBefore.split('\n').length;
    const totalLines = (input.match(/\n/g) || []).length + 1;
    const realLineHeight = ta.scrollHeight / totalLines;
    ta.scrollTop = Math.max(0, (lineCount - 3) * realLineHeight);
    cardRefs.current[index]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    setHighlightedIndex(index);
  };

  // ===== 构建导出用的题目列表 =====
  const exportQuestions = useMemo(() => {
    return questions.map(q => ({
      qid: q.yaml.qid,
      source: q.yaml.source || '',
      number: q.yaml.number || '',
      type: q.yaml.type || '',
      grade: q.yaml.grade || '',
      semester: q.yaml.semester || '',
      exam_type: q.yaml.exam_type || '',
      difficulty: q.yaml.difficulty != null && q.yaml.difficulty !== '' ? Number(q.yaml.difficulty) : null,
      knowledge: Array.isArray(q.yaml.knowledge) ? q.yaml.knowledge : [],
      tags: Array.isArray(q.yaml.tags) ? q.yaml.tags : [],
    }));
  }, [questions]);

  // ===== 加载题目内容缓存 =====
  const [loadedContents, setLoadedContents] = useState<Record<string, Record<string, string>>>({});

  const fetchMissing = async (qids: (number | string)[]): Promise<Record<string, Record<string, string>>> => {
    const needed = [...new Set(qids.filter(qid => !loadedContents[String(qid)]))];
    if (needed.length === 0) return loadedContents;

    const results = await Promise.all(needed.map(async (qid) => {
      try {
        const res = await fetch(`/api/questions/${qid}`);
        if (res.ok) {
          return { qid: String(qid), sections: (await res.json()).sections as Record<string, string> };
        }
      } catch { /* ignore */ }
      return { qid: String(qid), sections: null as null | Record<string, string> };
    }));

    const fresh: Record<string, Record<string, string>> = {};
    for (const r of results) {
      if (r.sections) fresh[r.qid] = r.sections;
    }
    setLoadedContents(prev => ({ ...prev, ...fresh }));
    return { ...loadedContents, ...fresh };
  };

  // ===== 构建讲义 + 收集图片映射 =====
  const buildHandoutWithImages = async (): Promise<{ markdown: string; imageMap: Map<string, string> }> => {
    const allContents = await fetchMissing(exportQuestions.map(q => q.qid));
    const imageMap = new Map<string, string>();

    const convertImages = (text: string, questionNum: number, counter: Map<number, number>): string => {
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

      text = text.replace(/!\[\[images\/([^\]|]+)(?:\|\d+)?\]\]/g, (_, hash: string) => mapImage(hash));
      text = text.replace(/!\[[^\]]*\]\(images\/([^)]+)\)/g, (_, hash: string) => mapImage(hash));
      return text;
    };

    const md = exportQuestions.map((q, i) => {
      const s = allContents[String(q.qid)];
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

      if ((isSingleSelect || isMultiSelect) && s['选项']) {
        lines.push(convertImages(s['选项'], num, imgCounter));
      }

      if (s['答案']) {
        lines.push(`【答案】${convertImages(s['答案'], num, imgCounter)}`);
      }

      lines.push(`【来源】${q.source}${q.number}`);

      if (s['我的备注']) {
        lines.push(`【备注】${convertImages(s['我的备注'], num, imgCounter)}`);
      }

      const aiNote = s['AI 备注'] || s['AI备注'];
      if (aiNote) {
        lines.push(`【AI备注】${convertImages(aiNote, num, imgCounter)}`);
      }

      if (s['解析']) {
        lines.push(`【解析】${convertImages(s['解析'], num, imgCounter)}`);
      }

      return lines.join('\n');
    }).join('\n\n\n');

    return { markdown: md, imageMap };
  };

  // ===== 复制为 Markdown =====
  const copyAsMarkdown = async () => {
    if (questions.length === 0) { setMessage('未识别到题目'); return; }
    const { markdown } = await buildHandoutWithImages();
    await navigator.clipboard.writeText(markdown);
    setMessage(`✅ 已复制 ${exportQuestions.length} 道题目到剪贴板`);
    setTimeout(() => setMessage(''), 3000);
  };

  // ===== 打包下载 Markdown Zip =====
  const downloadZip = async () => {
    if (questions.length === 0) { setMessage('未识别到题目'); return; }
    const { markdown, imageMap } = await buildHandoutWithImages();
    const zip = new JSZip();
    zip.file('试题栏讲义.md', markdown);

    const downloadPromises: Promise<void>[] = [];
    imageMap.forEach((newName, hashFilename) => {
      downloadPromises.push(
        fetch(`/api/images/${encodeURIComponent(hashFilename)}`)
          .then(async (res) => {
            if (res.ok) {
              const blob = await res.blob();
              zip.file(newName, blob);
            }
          })
          .catch(() => console.warn(`图片加载失败: ${hashFilename}`))
      );
    });
    await Promise.all(downloadPromises);

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
    a.download = `试题栏_Markdown_${ts}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ===== 复制为 LaTeX =====
  const copyAsLatex = async () => {
    if (questions.length === 0) { setMessage('未识别到题目'); return; }
    const allContents = await fetchMissing(exportQuestions.map(q => q.qid));
    const { tex } = buildLatexHandout(
      exportQuestions.map((q, i) => ({ ...q, qid: Number(q.qid) })),
      Object.fromEntries(Object.entries(allContents).map(([k, v]) => [Number(k), v]))
    );
    await navigator.clipboard.writeText(tex);
    setMessage(`✅ 已复制 ${exportQuestions.length} 道题目的 LaTeX 代码到剪贴板`);
    setTimeout(() => setMessage(''), 3000);
  };

  // ===== 打包下载 LaTeX Zip =====
  const downloadLatexZip = async () => {
    if (questions.length === 0) { setMessage('未识别到题目'); return; }
    const allContents = await fetchMissing(exportQuestions.map(q => q.qid));
    const { tex, imageMap } = buildLatexHandout(
      exportQuestions.map((q, i) => ({ ...q, qid: Number(q.qid) })),
      Object.fromEntries(Object.entries(allContents).map(([k, v]) => [Number(k), v]))
    );
    const zip = new JSZip();
    zip.file('试题栏讲义.tex', tex);

    try {
      const styRes = await fetch('/mathatlas.sty');
      if (styRes.ok) {
        const styText = await styRes.text();
        zip.file('mathatlas.sty', styText);
      }
    } catch { /* ignore */ }

    const downloadPromises: Promise<void>[] = [];
    imageMap.forEach((newName, hashFilename) => {
      downloadPromises.push(
        fetch(`/api/images/${encodeURIComponent(hashFilename)}`)
          .then(async (res) => {
            if (res.ok) {
              const blob = await res.blob();
              zip.file(`images/${newName}`, blob);
            }
          })
          .catch(() => console.warn(`图片加载失败: ${hashFilename}`))
      );
    });
    await Promise.all(downloadPromises);

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
    a.download = `试题栏_LaTeX_${ts}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ===== LaTeX 导出到本地 =====
  const exportToLocal = async () => {
    if (questions.length === 0) { setMessage('未识别到题目'); return; }
    try {
      const res = await fetch('/api/export-latex', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qids: exportQuestions.map(q => q.qid) }),
      });
      const data = await res.json();
      if (data.ok) {
        setMessage(`✅ 已导出 ${data.count} 道题目 → ${data.folder}`);
      } else {
        setMessage('❌ 导出失败：' + (data.error || '未知错误'));
      }
    } catch (e: any) {
      setMessage('❌ 导出失败：' + e.message);
    }
  };

  // ===== 打包下载 Word =====
  const downloadWord = async () => {
    if (questions.length === 0) { setMessage('未识别到题目'); return; }
    const allContents = await fetchMissing(exportQuestions.map(q => q.qid));
    const imageBinMap = new Map<string, { arrayBuf: ArrayBuffer; ext: string }>();

    const loadAllImages = async () => {
      const allImageHash = new Set<string>();
      const collectImgHash = (text: string) => {
        const obsidianRegex = /!\[\[images\/([^\]|]+)(?:\|\d+)?\]\]/g;
        const mdImageRegex = /!\[[^\]]*\]\(images\/([^)]+)\)/g;
        let res: RegExpExecArray | null;
        while ((res = obsidianRegex.exec(text))) allImageHash.add(res[1]);
        while ((res = mdImageRegex.exec(text))) allImageHash.add(res[1]);
      };

      exportQuestions.forEach(q => {
        const s = allContents[String(q.qid)];
        if (!s) return;
        collectImgHash(s['题目'] ?? '');
        collectImgHash(s['选项'] ?? '');
        collectImgHash(s['答案'] ?? '');
        collectImgHash(s['解析'] ?? '');
        collectImgHash(s['我的备注'] ?? '');
        collectImgHash(s['AI备注'] ?? s['AI 备注'] ?? '');
      });

      const tasks: Promise<void>[] = [];
      const failList: string[] = [];
      for (const hash of allImageHash) {
        tasks.push((async () => {
          try {
            const res = await fetch(`/api/images/${encodeURIComponent(hash)}`);
            if (!res.ok) { failList.push(hash); return; }
            const blob = await res.blob();
            const arrayBuf = await blob.arrayBuffer();
            const ext = hash.split('.').pop() || 'jpg';
            imageBinMap.set(hash, { arrayBuf, ext });
          } catch (err) {
            failList.push(hash);
          }
        })());
      }
      await Promise.all(tasks);
      if (failList.length > 0) {
        setMessage(`⚠️ 存在${failList.length}张图片无法加载`);
      }
    };

    await loadAllImages();

    const buildQuestionParagraphs = (q: typeof exportQuestions[0], idx: number) => {
      const s = allContents[String(q.qid)];
      const paragraphs: Paragraph[] = [];
      const questionNum = idx + 1;

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
            if (beforeText) children.push(new TextRun({ text: beforeText }));

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
        paragraphs.push(new Paragraph({ children: [new TextRun(`#${questionNum} 题目加载失败`)] }));
        return paragraphs;
      }

      paragraphs.push(new Paragraph({
        text: `${questionNum}. ${q.type || '题目'}（${q.source}${q.number}）`,
        heading: HeadingLevel.HEADING_2,
      }));

      paragraphs.push(...textToParagraphs(s['题目']));

      if (s['选项']) {
        paragraphs.push(new Paragraph({ text: '【选项】', heading: HeadingLevel.HEADING_3 }));
        paragraphs.push(...textToParagraphs(s['选项']));
      }

      if (s['答案']) {
        paragraphs.push(new Paragraph({ text: '【答案】', heading: HeadingLevel.HEADING_3 }));
        paragraphs.push(...textToParagraphs(s['答案']));
      }

      if (s['解析']) {
        paragraphs.push(new Paragraph({ text: '【解析】', heading: HeadingLevel.HEADING_3 }));
        paragraphs.push(...textToParagraphs(s['解析']));
      }

      if (s['我的备注']) {
        paragraphs.push(new Paragraph({ text: '【我的备注】', heading: HeadingLevel.HEADING_3 }));
        paragraphs.push(...textToParagraphs(s['我的备注']));
      }

      const aiNote = s['AI 备注'] || s['AI备注'];
      if (aiNote) {
        paragraphs.push(new Paragraph({ text: '【AI备注】', heading: HeadingLevel.HEADING_3 }));
        paragraphs.push(...textToParagraphs(aiNote));
      }

      paragraphs.push(new Paragraph({ children: [new TextRun('——————————————————————')] }));
      return paragraphs;
    };

    const doc = new Document({
      sections: [{
        properties: {},
        children: exportQuestions.flatMap((q, idx) => buildQuestionParagraphs(q, idx)),
      }],
    });

    const buffer = await Packer.toBuffer(doc);
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    const url = URL.createObjectURL(blob);

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
    a.download = `试题栏_Word_${ts}.docx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ===== 清空试题栏 =====
  const clearAll = () => {
    setInput('');
    setMessage('✅ 已清空试题栏');
    setTimeout(() => setMessage(''), 2000);
  };

  // ===== 界面 =====
  return (
    <div className={styles.container}>
      <h1 className={styles.title}>试题栏</h1>

      {/* 工具栏 */}
      <div className={styles.metaBar}>
        <button
          className={styles.saveBtn}
          onClick={copyAsMarkdown}
          style={{ background: '#4a90d9' }}
        >
          📋 复制为 Markdown
        </button>
        <button
          className={styles.saveBtn}
          onClick={downloadZip}
          style={{ background: '#4a90d9' }}
        >
          📦 打包下载 Markdown (.zip)
        </button>
        <button
          className={styles.saveBtn}
          onClick={copyAsLatex}
          style={{ background: '#7b68ee' }}
        >
          📐 复制为 LaTeX
        </button>
        <button
          className={styles.saveBtn}
          onClick={downloadLatexZip}
          style={{ background: '#7b68ee' }}
        >
          📦 打包下载 LaTeX (.zip)
        </button>
        <button
          className={styles.saveBtn}
          onClick={exportToLocal}
          style={{ background: '#7b68ee' }}
        >
          📁 LaTeX 导出到本地
        </button>
        <button
          className={styles.saveBtn}
          onClick={downloadWord}
          style={{ background: '#e67e22' }}
        >
          📄 Word 导出到本地
        </button>
        <button
          className={styles.saveBtn}
          onClick={clearAll}
          style={{ background: '#95a5a6' }}
        >
          🗑️ 清空试题栏
        </button>
        <button
          onClick={() => router.push('/')}
          style={{
            padding: '0.65rem 1.4rem',
            border: '1px solid #999',
            borderRadius: '8px',
            backgroundColor: 'transparent',
            fontSize: '0.92rem',
            cursor: 'pointer',
            transition: '0.2s all',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            marginLeft: 'auto',
          }}
          onMouseOver={(e) => {
            const btn = e.target as HTMLButtonElement;
            btn.style.background = '#edf2ff';
            btn.style.borderColor = 'var(--accent)';
          }}
          onMouseOut={(e) => {
            const btn = e.target as HTMLButtonElement;
            btn.style.background = 'transparent';
            btn.style.borderColor = '#999';
          }}
        >
          ← 返回选题
        </button>
      </div>

      {/* 提示消息 */}
      {message && (
        <div className={message.startsWith('✅') || message.startsWith('⚠') ? styles.msgOk : styles.msgErr}>
          {message}
        </div>
      )}

      {/* 双栏：左输入，右预览 */}
      <div className={styles.columns}>
        {/* 左侧：输入区 */}
        <div className={styles.leftPanel}>
          <div className={styles.panelHeader}>
            题目区 ({questions.length} 题)
            <label className={styles.uploadBtn}>
              {uploading ? '上传中...' : '📷 上传图片'}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) handleUpload(f);
                  e.target.value = '';
                }}
              />
            </label>
          </div>

          <textarea
            ref={textareaRef}
            className={styles.textarea}
            placeholder={`从选题页面勾选题目后点击"加入试题栏"，题目将自动出现在这里…

也可以手动粘贴题目（格式与添加题目页面相同）

==========

（多道题用 ========== 分隔）

💡 截图后 Ctrl+V 可直接粘贴图片
💡 点击右侧卡片可跳转到原文`}
            value={input}
            onChange={e => setInput(e.target.value)}
            onMouseUp={handleCursorMove}
            onKeyUp={handleCursorMove}
            onPaste={e => {
              const items = e.clipboardData?.items;
              if (!items) return;
              for (const item of items) {
                if (item.type.startsWith('image/')) {
                  e.preventDefault();
                  const file = item.getAsFile();
                  if (file) handleUpload(file);
                  return;
                }
              }
            }}
          />
        </div>

        {/* 右侧：预览区 */}
        <div className={styles.rightPanel}>
          <div className={styles.panelHeader}>
            预览 ({questions.length} 题)
            <span style={{ fontSize: '0.75rem', color: '#999', marginLeft: 'auto' }}>
              💡 拖拽排序 · 悬停显示操作按钮
            </span>
          </div>
          <div className={styles.previewList}>
            {questions.length === 0 ? (
              <div className={styles.empty}>
                试题栏为空
                <br />
                <span style={{ fontSize: '0.85rem', color: '#999' }}>
                  请从选题页面勾选题目后加入，或手动粘贴
                </span>
              </div>
            ) : (
              questions.map((q, i) => (
                <div
                  key={i}
                  ref={el => { cardRefs.current[i] = el; }}
                  className={`${styles.card} ${highlightedIndex === i ? styles.cardHighlighted : ''} ${dragOverIndex === i ? styles.cardDragOver : ''}`}
                  draggable
                  onDragStart={(e) => handleDragStart(e, i)}
                  onDragEnd={handleDragEnd}
                  onDragOver={(e) => handleDragOver(e, i)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, i)}
                  onClick={() => handleCardClick(i)}
                  title="点击跳转到原文 | 拖拽可排序"
                  style={{
                    position: 'relative',
                    cursor: dragIndex !== null ? 'grabbing' : 'grab',
                    opacity: dragIndex === i ? 0.4 : 1,
                    transition: 'opacity 0.2s, box-shadow 0.2s',
                    boxShadow: dragOverIndex === i ? '0 0 0 2px var(--accent)' : undefined,
                  }}
                >
                  {/* 操作按钮组 - 始终显示 */}
                  <div
                    style={{
                      position: 'absolute',
                      top: '8px',
                      right: '8px',
                      display: 'flex',
                      gap: '6px',
                      zIndex: 10,
                    }}
                  >
                    <button
                      onClick={(e) => { e.stopPropagation(); moveUp(i); }}
                      disabled={i === 0}
                      title="上移"
                      style={{
                        padding: '4px 10px',
                        fontSize: '0.8rem',
                        border: '1px solid #ccc',
                        borderRadius: '6px',
                        background: '#fff',
                        cursor: i === 0 ? 'not-allowed' : 'pointer',
                        opacity: i === 0 ? 0.3 : 0.85,
                      }}
                    >
                      ↑
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); moveDown(i); }}
                      disabled={i === questions.length - 1}
                      title="下移"
                      style={{
                        padding: '4px 10px',
                        fontSize: '0.8rem',
                        border: '1px solid #ccc',
                        borderRadius: '6px',
                        background: '#fff',
                        cursor: i === questions.length - 1 ? 'not-allowed' : 'pointer',
                        opacity: i === questions.length - 1 ? 0.3 : 0.85,
                      }}
                    >
                      ↓
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); removeQuestion(i); }}
                      title="移除此题"
                      style={{
                        padding: '4px 12px',
                        fontSize: '0.8rem',
                        border: '1px solid #e74c3c',
                        borderRadius: '6px',
                        background: '#fff',
                        color: '#e74c3c',
                        cursor: 'pointer',
                        fontWeight: 600,
                      }}
                    >
                      ✕ 删除
                    </button>
                  </div>

                  {/* 拖动提示 */}
                  <div
                    style={{
                      position: 'absolute',
                      top: '8px',
                      left: '8px',
                      fontSize: '0.7rem',
                      color: '#999',
                      zIndex: 10,
                      pointerEvents: 'none',
                    }}
                  >
                    ⠿ 拖动排序
                  </div>

                  <div className={styles.cardMeta} style={{ paddingRight: '120px' }}>
                    <span className={styles.cardIdx}>{q.yaml.number || `T${i + 1}`}</span>
                    {q.yaml.source && <span className={styles.yamlTag}>{q.yaml.source}</span>}
                    <span className={styles.cardType}>{q.yaml.type || '?'}</span>
                    {(() => {
                      const y = q.yaml;
                      const vals: string[] = [];
                      if (y.grade) vals.push(y.grade);
                      if (y.semester) vals.push(y.semester);
                      if (y.exam_type) vals.push(y.exam_type);
                      if (y.difficulty != null && y.difficulty !== '') vals.push(String(y.difficulty));
                      return vals.map((v, j) => (
                        <span key={j} className={styles.yamlTag}>{v}</span>
                      ));
                    })()}
                  </div>

                  {q.sections['题目'] && (
                    <div className={styles.cardSection}>
                      <MathText text={q.sections['题目']} />
                    </div>
                  )}

                  {q.sections['选项'] && (
                    <div className={styles.cardOption}>
                      <MathText text={q.sections['选项']} />
                    </div>
                  )}

                  {q.sections['答案'] && (
                    <div className={styles.cardAnswer}>
                      <strong>答案：</strong>
                      <MathText text={q.sections['答案']} />
                    </div>
                  )}

                  {q.sections['解析'] && (
                    <details className={styles.cardDetail}>
                      <summary>解析</summary>
                      <MathText text={q.sections['解析']} />
                    </details>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}