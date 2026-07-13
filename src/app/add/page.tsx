'use client';
import { useRouter } from 'next/navigation';
import { useState, useMemo, useRef, useCallback } from 'react';
import MathText from '@/components/MathText';
import styles from './page.module.css';
// 导入统一环境变量配置
import { clientEnv } from '@/lib/env';

/**
 * 解析后的题目结构
 */
interface ParsedQuestion {
  sections: Record<string, string>;  // ## 标题 → 内容（如 "题目" → "已知集合A..."）
  yaml: Record<string, any>;        // YAML frontmatter 的键值对（如 source, number, type）
  raw: string;   // 含原始 YAML 的完整文本（预览用）
  body: string;  // 去掉 YAML 后的纯正文（入库用）
  startIndex: number;  // 这道题在原文中的起始字符位置
  endIndex: number;    // 这道题在原文中的结束字符位置（不含分隔符）
}

/** 解析单道题的 YAML 和 sections（公共逻辑，不关心位置） */
function parseOneQuestion(trimmed: string): { yaml: Record<string, any>; body: string; sections: Record<string, string> } {
  // 剥离 YAML frontmatter
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

  // 按 ## 标题拆 sections
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
  console.log('解析结果:', { yaml, body, sections });
  return { yaml, body, sections };
}

/**
 * 拆分所有题目，同时记录每道题在原文中的起止位置
 * 用于后续的双向跳转（点击卡片 → 选中原文，光标移动 → 高亮卡片）
 */
function parseQuestions(text: string): ParsedQuestion[] {
  const results: ParsedQuestion[] = [];
  // 用 exec 循环而非 split，这样可以拿到每道题在原文中的字符位置
  const sepRe = /\n?==========\n?/g;
  let blockStart = 0;  // 当前题目在原文中的起始位置
  let match: RegExpExecArray | null;

  while ((match = sepRe.exec(text)) !== null) {
    const blockEnd = match.index;  // 分隔符之前就是当前题目的结束位置
    const block = text.slice(blockStart, blockEnd).trim();
    if (block) {
      const parsed = parseOneQuestion(block);
      results.push({ ...parsed, raw: block, startIndex: blockStart, endIndex: blockEnd });
    }
    blockStart = match.index + match[0].length;  // 下一道题的起始位置 = 分隔符之后
  }

  // 最后一道题（最后一个分隔符之后）
  const lastBlock = text.slice(blockStart).trim();
  if (lastBlock) {
    const parsed = parseOneQuestion(lastBlock);
    results.push({ ...parsed, raw: lastBlock, startIndex: blockStart, endIndex: text.length });
  }

  return results;
}

export default function AddPage() {
  // ===== 状态管理 =====
  const [input, setInput] = useState('');
  const [source, setSource] = useState('');
  const [examType, setExamType] = useState('');
  const [defaultType, setDefaultType] = useState('');
  const router = useRouter();

  // ========== 核心修改：默认年级从环境变量读取 ==========
  const [defaultGrade, setDefaultGrade] = useState(clientEnv.defaultGrade);

  const [defaultSemester, setDefaultSemester] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [uploading, setUploading] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null); // 当前高亮的卡片
  const [conflictList, setConflictList] = useState<{ index: number; number: string; source: string; fileName: string }[] | null>(null); // 冲突列表，null 表示没在冲突检查中
  const pendingListRef = useRef<Record<string, any>[]>([]); // 暂存待入库列表，等用户选择冲突策略后复用

  // ===== DOM 引用 =====
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]); // 每张卡片的 DOM 引用，用于自动滚动

  // ====================== 新增：年级联动配置 ======================
  // 学期下拉选项映射
  const semesterOptionsMap: Record<string, { value: string; label: string }[]> = {
    "初中": [
      { value: "七上", label: "七上" },
      { value: "七下", label: "七下" },
      { value: "八上", label: "八上" },
      { value: "八下", label: "八下" },
      { value: "九上", label: "九上" },
      { value: "九下", label: "九下" },
    ],
    "高中": [
      { value: "高一上", label: "高一上" },
      { value: "高一下", label: "高一下" },
      { value: "高二上", label: "高二上" },
      { value: "高二下", label: "高二下" },
      { value: "高三上", label: "高三上" },
      { value: "高三下", label: "高三下" },
    ]
  };
  // 类别下拉选项映射
  const examTypeOptionsMap: Record<string, { value: string; label: string }[]> = {
    "初中": [
      { value: "中考真题", label: "中考真题" },
      { value: "月考", label: "月考" },
      { value: "期中考试", label: "期中考试" },
      { value: "期末考试", label: "期末考试" },
      { value: "模拟题", label: "模拟题" },
      // { value: "练习题", label: "练习题" },
    ],
    "高中": [
      { value: "高考真题", label: "高考真题" },
      { value: "月考", label: "月考" },
      { value: "期中考试", label: "期中考试" },
      { value: "期末考试", label: "期末考试" },
      { value: "模拟题", label: "模拟题" },
      // { value: "练习题", label: "练习题" },
    ]
  };

  // 根据当前年级自动计算学期、类别下拉列表
  const currentSemesterOptions = useMemo(() => {
    return semesterOptionsMap[defaultGrade] ?? [];
  }, [defaultGrade]);

  const currentExamTypeOptions = useMemo(() => {
    return examTypeOptionsMap[defaultGrade] ?? [];
  }, [defaultGrade]);

  // 切换年级时清空学期、类别，防止不匹配数据
  const handleGradeChange = (val: string) => {
    setDefaultGrade(val);
    setDefaultSemester("");
    setExamType("");
  };
  // =================================================================

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

  // ===== 题目解析（input 变化时自动重新拆分）=====
  const questions = useMemo(() => {
    if (!input.trim()) return [];
    return parseQuestions(input);
  }, [input]);

  // ===== 光标位置变化 → 高亮对应卡片 + 滚动到可见区域 =====
  const handleCursorMove = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta || questions.length === 0) return;
    const pos = ta.selectionStart;
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (pos >= q.startIndex && pos <= q.endIndex) {
        setHighlightedIndex(i);
        // 把对应的预览卡片滚到可见位置
        cardRefs.current[i]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
      }
    }
    setHighlightedIndex(null);
  }, [questions]);

  // ===== 点击预览卡片 → 跳转到原文对应位置 =====
  const handleCardClick = (index: number) => {
    const ta = textareaRef.current;
    if (!ta || index >= questions.length) return;
    const q = questions[index];

    ta.focus();
    ta.setSelectionRange(q.startIndex, q.endIndex);

    // textarea 不会自动跟随 selection，需要手动计算并设置 scrollTop
    // 统计 startIndex 之前的换行数，乘以实际行高得出滚动位置
    const textBefore = input.slice(0, q.startIndex);
    const lineCount = textBefore.split('\n').length;
    // 用 scrollHeight / 总行数 得出实际行高（而非固定值）
    const totalLines = (input.match(/\n/g) || []).length + 1;
    const realLineHeight = ta.scrollHeight / totalLines;
    // 滚动到目标行上方留 3 行上下文
    ta.scrollTop = Math.max(0, (lineCount - 3) * realLineHeight);

    // 同时滚动预览卡片到可见区域
    const cardEl = cardRefs.current[index];
    cardEl?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    setHighlightedIndex(index);
  };

  // ===== 将解析好的题目组装成待入库列表 =====
  const buildQuestionList = (): Record<string, any>[] | null => {
    const list: Record<string, any>[] = [];
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const y = q.yaml;

      const finalType = y.type || defaultType;
      if (!finalType) {
        setMessage(`❌ 第 ${i + 1} 道题缺少题型（YAML 没写，页面也没选默认值）`);
        return null;
      }

      // ========== 核心修改：兜底不再写死高中 ==========
      list.push({
        source: y.source || source.trim(),
        number: y.number || '',
        type: finalType,
        grade: y.grade || defaultGrade,
        semester: y.semester || defaultSemester,
        exam_type: y.exam_type || examType,
        difficulty: y.difficulty != null && y.difficulty !== '' ? Number(y.difficulty) : null,
        knowledge: Array.isArray(y.knowledge) ? y.knowledge : [],
        tags: Array.isArray(y.tags) ? y.tags : [],
        content: q.body,
      });
    }
    return list;
  };

  // ===== 实际执行写入（用户选了冲突策略后调用）=====
  const doSave = async (list: Record<string, any>[], onConflict: string) => {
    setSaving(true);
    setConflictList(null);
    setMessage('');
    try {
      const res = await fetch('/api/add-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questions: list, action: 'write', onConflict }),
      });
      const data = await res.json();
      if (res.ok) {
        const written = data.results.filter((r: any) => !r.skipped).length;
        const skipped = data.results.filter((r: any) => r.skipped).length;
        let msg = `✅ 成功入库 ${written} 道题`;
        if (skipped > 0) msg += `，跳过 ${skipped} 道（文件已存在）`;
        setMessage(msg);
        setInput('');
        setHighlightedIndex(null);
      } else {
        setMessage(`❌ ${data.error || '入库失败'}`);
      }
    } catch {
      setMessage('❌ 网络错误');
    } finally {
      setSaving(false);
    }
  };

  // ===== 入库入口：先检查冲突，再决定是否弹窗 =====
  const handleSave = async () => {
    if (questions.length === 0) { setMessage('未识别到题目'); return; }

    const list = buildQuestionList();
    if (!list) { setSaving(false); return; }

    setSaving(true);
    setMessage('');

    try {
      // 第 1 步：检查哪些文件已存在
      const checkRes = await fetch('/api/add-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questions: list, action: 'check' }),
      });
      const checkData = await checkRes.json();
      const conflicts: { index: number; number: string; source: string; fileName: string }[] = checkData.conflicts || [];

      if (conflicts.length === 0) {
        // 无冲突，直接写入
        await doSave(list, 'overwrite'); // 无冲突时 overwrite/skip 没区别
      } else {
        // 有冲突，暂存列表并弹窗
        pendingListRef.current = list;
        setConflictList(conflicts);
        setSaving(false);
      }
    } catch {
      setMessage('❌ 网络错误');
      setSaving(false);
    }
  };

  // ===== 界面 =====
  return (
    <div className={styles.container}>
      <h1 className={styles.title}>添加题目</h1>

      {/* 顶部元数据设置栏 */}
      <div className={styles.metaBar}>
        <label className={styles.metaLabel}>
          来源
          <input
            className={styles.metaInput}
            placeholder="留空则取 YAML 中的来源"
            value={source}
            onChange={e => setSource(e.target.value)}
          />
        </label>

        <label className={styles.metaLabel}>
          年级
          {/* 下拉选项从 env 列表自动渲染，切换触发重置学期类别 */}
          <select
            className={styles.metaSelect}
            value={defaultGrade}
            onChange={e => handleGradeChange(e.target.value)}
          >
            {clientEnv.gradeList.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </label>

        <label className={styles.metaLabel}>
          学期
          <select
            className={styles.metaSelect}
            value={defaultSemester}
            onChange={e => setDefaultSemester(e.target.value)}
          >
            <option value="">（不设默认）</option>
            {currentSemesterOptions.map(item => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </label>

        <label className={styles.metaLabel}>
          类别
          <select
            className={styles.metaSelect}
            value={examType}
            onChange={e => setExamType(e.target.value)}
          >
            <option value="练习题">练习题</option>
            {/* <option value="">（不设默认）</option> */}
            {currentExamTypeOptions.map(item => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </label>

        <label className={styles.metaLabel}>
          题型
          <select className={styles.metaSelect} value={defaultType} onChange={e => setDefaultType(e.target.value)}>
            <option value="">（不设默认）</option>
            <option value="单选题">单选题</option>
            <option value="多选题">多选题</option>
            <option value="填空题">填空题</option>
            <option value="解答题">解答题</option>
          </select>
        </label>

        <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
          {saving ? '入库中...' : `确认入库 (${questions.length} 题)`}
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
            gap: '6px'
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
          ← 返回首页
        </button>
      </div>

      {/* 提示消息 */}
      {message && (
        <div className={message.startsWith('✅') || message.startsWith('⚠') ? styles.msgOk : styles.msgErr}>
          {message}
        </div>
      )}

      {/* 冲突弹窗：列出同名文件，让用户选择处理方式 */}
      {conflictList && conflictList.length > 0 && (
        <div className={styles.overlay}>
          <div className={styles.dialog}>
            <div className={styles.dialogTitle}>⚠️ 文件冲突</div>
            <div className={styles.dialogBody}>
              以下 {conflictList.length} 道题的文件已存在：
              <ul className={styles.conflictList}>
                {conflictList.map((c, i) => (
                  <li key={i}>{c.fileName}</li>
                ))}
              </ul>
              请选择处理方式：
            </div>
            <div className={styles.dialogActions}>
              <button
                className={styles.dialogBtnSecondary}
                onClick={() => setConflictList(null)}
              >
                取消
              </button>
              <button
                className={styles.dialogBtnSecondary}
                onClick={() => doSave(pendingListRef.current, 'skip')}
              >
                跳过已存在的
              </button>
              <button
                className={styles.dialogBtnPrimary}
                onClick={() => doSave(pendingListRef.current, 'overwrite')}
              >
                覆盖全部
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 双栏：左输入，右预览 */}
      <div className={styles.columns}>
        {/* 左侧：输入区 */}
        <div className={styles.leftPanel}>
          <div className={styles.panelHeader}>
            粘贴区
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
            placeholder={`粘贴 AI 格式化好的题目…

格式示例：
## 题目
已知集合 A = {x | x > 1}，求补集 [选]

## 选项
A．{x | x ≤ 1}
B．{x | x ≥ 1}

## 答案
A

## 解析
…（可选）

==========

（多道题用 ========== 分隔）

💡 截图后 Ctrl+V 可直接粘贴图片
💡 点击右侧卡片可跳转到原文`}
            value={input}
            onChange={e => setInput(e.target.value)}
            onMouseUp={handleCursorMove}   // 鼠标点击/拖选后更新高亮
            onKeyUp={handleCursorMove}     // 键盘移动光标后更新高亮
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
          </div>
          <div className={styles.previewList}>
            {questions.length === 0 ? (
              <div className={styles.empty}>粘贴题目后在此预览</div>
            ) : (
              questions.map((q, i) => (
                <div
                  key={i}
                  ref={el => { cardRefs.current[i] = el; }}
                  className={`${styles.card} ${highlightedIndex === i ? styles.cardHighlighted : ''}`}
                  onClick={() => handleCardClick(i)}
                  title={`点击跳转到原文第 ${q.startIndex + 1} 个字符`}
                >
                  <div className={styles.cardMeta}>
                    <span className={styles.cardIdx}>{q.yaml.number || `T${i + 1}`}</span>
                    {/* 来源紧跟在题号后面 */}
                    {(() => {
                      const src = q.yaml.source || source.trim();
                      if (src) return <span className={styles.yamlTag}>{src}</span>;
                      return null;
                    })()}
                    <span className={styles.cardType}>{q.yaml.type || defaultType || '?'}</span>
                    {(() => {
                      const y = q.yaml;
                      const vals: string[] = [];
                      vals.push(y.grade || defaultGrade);
                      const sem = y.semester || defaultSemester;
                      if (sem) vals.push(sem);
                      const et = y.exam_type || examType;
                      if (et) vals.push(et);
                      const diff = y.difficulty;
                      if (diff != null && diff !== '') vals.push(String(diff));
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