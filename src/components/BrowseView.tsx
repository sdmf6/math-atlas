'use client';

import { useState, useEffect, useRef } from 'react';
import type { QuestionMetaLight } from '@/lib/questions';
import MathText from '@/components/MathText';
import styles from './BrowseView.module.css';

interface BrowseViewProps {
  questions: QuestionMetaLight[];
  loadedContents: Record<number, Record<string, string>>;
  selectedQids: Set<number>;
  loadingQid: number | null;
  onToggleSelect: (qid: number) => void;
  onLoadContent: (qid: number) => void;
  onRefresh: (qid: number) => void;
}

export default function BrowseView({
  questions,
  loadedContents,
  selectedQids,
  loadingQid,
  onToggleSelect,
  onLoadContent,
  onRefresh,
}: BrowseViewProps) {
  const [showAnswer, setShowAnswer] = useState<Record<number, boolean>>({});
  const [showSolution, setShowSolution] = useState<Record<number, boolean>>({});
  const loadedRef = useRef<Set<number>>(new Set());

  // 题干默认可见，加载缺失内容
  useEffect(() => {
    for (const q of questions) {
      if (!loadedContents[q.qid] && !loadedRef.current.has(q.qid)) {
        loadedRef.current.add(q.qid);
        onLoadContent(q.qid);
      }
    }
  }, [questions, loadedContents, onLoadContent]);

  const toggleAnswer = (qid: number) => {
    setShowAnswer(prev => ({ ...prev, [qid]: !prev[qid] }));
  };

  const toggleSolution = (qid: number) => {
    setShowSolution(prev => ({ ...prev, [qid]: !prev[qid] }));
  };

  return (
    <div className={styles.container}>
      {questions.map((q) => {
        const s = loadedContents[q.qid];
        const isLoading = loadingQid === q.qid;
        const isSelected = selectedQids.has(q.qid);

        return (
          <div key={q.qid} className={`${styles.card} ${isSelected ? styles.cardSelected : ''}`}>
            {/* 卡片头部 */}
            <div className={styles.cardHeader}>
              <label className={styles.checkLabel}>
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onToggleSelect(q.qid)}
                />
              </label>
              <span className={styles.source}>{q.source}</span>
              <span className={styles.number}>{q.number}</span>
              <span className={styles.type}>{q.type}</span>
              {q.difficulty != null && (
                <span className={styles.difficulty}>难度 {q.difficulty}</span>
              )}
              <div className={styles.headerActions}>
                {s?.['答案'] && (
                  <button
                    className={`${styles.toggleBtn} ${showAnswer[q.qid] ? styles.toggleBtnActive : ''}`}
                    onClick={e => { e.stopPropagation(); toggleAnswer(q.qid); }}
                  >
                    答案
                  </button>
                )}
                {s?.['解析'] && (
                  <button
                    className={`${styles.toggleBtn} ${showSolution[q.qid] ? styles.toggleBtnActive : ''}`}
                    onClick={e => { e.stopPropagation(); toggleSolution(q.qid); }}
                  >
                    解析
                  </button>
                )}
                {s?.['我的备注'] && (
                  <span className={styles.noteIndicator}>📌</span>
                )}
                <a
                  className={styles.obsidianLink}
                  href={`obsidian://open?vault=${encodeURIComponent((process.env.NEXT_PUBLIC_VAULT_PATH || './demo-vault').split(/[\\\/]/).pop() || '高中数学')}&file=${encodeURIComponent(q.filePath.replace((process.env.NEXT_PUBLIC_VAULT_PATH || './demo-vault') + '\\', '').replace(/\\/g, '/'))}`}
                  title="在 Obsidian 中打开"
                  onClick={e => e.stopPropagation()}
                >
                  📝
                </a>
                <button
                  className={styles.refreshBtn}
                  title="刷新此题"
                  onClick={e => {
                    e.stopPropagation();
                    onRefresh(q.qid);
                  }}
                >
                  🔄
                </button>
              </div>
            </div>

            {/* 题干 — 默认展开 */}
            <div className={styles.questionBody}>
              {isLoading && (
                <div className={styles.loading}>加载中...</div>
              )}
              {s?.['题目'] && (
                <MathText text={s['题目']} />
              )}
              {s?.['选项'] && (
                <MathText text={s['选项']} />
              )}
            </div>

            {/* 答案 */}
            {s?.['答案'] && showAnswer[q.qid] && (
              <div className={styles.foldSection}>
                <div className={styles.foldLabel}>答案</div>
                <div className={styles.foldBody}>
                  <MathText text={s['答案']} />
                </div>
              </div>
            )}

            {/* 解析 */}
            {s?.['解析'] && showSolution[q.qid] && (
              <div className={styles.foldSection}>
                <div className={styles.foldLabel}>解析</div>
                <div className={styles.foldBody}>
                  <MathText text={s['解析']} />
                </div>
              </div>
            )}

            {/* 备注 */}
            {s?.['我的备注'] && (
              <div className={styles.foldSection}>
                <div className={styles.foldLabel}>📌 我的备注</div>
                <div className={styles.foldBody}>
                  <MathText text={s['我的备注']} />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
