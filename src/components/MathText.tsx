import katex from 'katex';
import { marked } from 'marked';

/** 把图片引用替换为正确的 API 路径 */
function replaceImages(text: string): string {
  // Obsidian 格式 ![[images/xxx|NNN]]
  text = text.replace(
    /!\[\[images\/([^\]|]+)(?:\|(\d+))?\]\]/g,
    (_, filename: string, width?: string) => {
      const widthStyle = width ? `width:${width}px;` : 'max-width:100%;';
      return `<img src="/api/images/${encodeURIComponent(filename)}" alt="${filename}" style="${widthStyle}display:block;margin:0.5rem 0;" />`;
    }
  );
  // 标准 Markdown 格式 ![...](images/xxx.jpg) → 替换为 API 路径（alt 可能为宽度数字）
  text = text.replace(
    /!\[([^\]]*)\]\(images\/([^)]+)\)/g,
    (_, alt: string, filename: string) => {
      const width = parseInt(alt, 10);
      if (!isNaN(width) && width > 0) {
        return `<img src="/api/images/${encodeURIComponent(filename)}" alt="" style="width:${width}px;display:block;margin:0.5rem 0;" />`;
      }
      return `<img src="/api/images/${encodeURIComponent(filename)}" alt="${alt}" style="max-width:100%;display:block;margin:0.5rem 0;" />`;
    }
  );
  return text;
}

/** 把文本中的 \$ 转义恢复为普通的 $ */
const DOLLAR_ESC = '\x00DOLLAR\x00';
const MATH_PLACEHOLDER = '\x00MATH\x00';

interface MathSlot {
  formula: string;
  displayMode: boolean;
}

/** 渲染含图片、Markdown、数学公式的文本 */
function renderContent(text: string): string {
  // 1. 替换图片
  text = replaceImages(text);

  // 2. 保护已转义的 \$
  text = text.replace(/\\\$/g, DOLLAR_ESC);

  // 3. 提取所有 $ 公式块，换成占位符（避免 marked 破坏公式）
  const mathSlots: MathSlot[] = [];
  // 先匹配 $$...$$，再匹配 $...$
  const mathRegex = /(\$\$([\s\S]*?)\$\$|\$([\s\S]*?)\$)/;
  let idx = 0;
  while (true) {
    const m = mathRegex.exec(text);
    if (!m) break;
    const isDisplay = !!m[1]?.startsWith('$$');
    const formula = isDisplay ? m[2] : m[3];
    mathSlots.push({ formula, displayMode: isDisplay });
    text = text.slice(0, m.index) + `${MATH_PLACEHOLDER}${idx}__` + text.slice(m.index + m[0].length);
    idx++;
  }

  // 4. Markdown → HTML
  text = marked.parse(text, { breaks: true }) as string;

  // 5. 恢复 \$ → $
  text = text.replace(new RegExp(DOLLAR_ESC, 'g'), '$');

  // 6. 把占位符替换为 KaTeX 渲染结果
  for (let i = 0; i < mathSlots.length; i++) {
    const slot = mathSlots[i];
    try {
      const html = katex.renderToString(slot.formula, {
        displayMode: slot.displayMode,
        throwOnError: false,
      });
      text = text.replace(`${MATH_PLACEHOLDER}${i}__`, html);
    } catch {
      text = text.replace(`${MATH_PLACEHOLDER}${i}__`, slot.formula);
    }
  }

  return text;
}

export default function MathText({ text }: { text: string }) {
  return (
    <div
      dangerouslySetInnerHTML={{ __html: renderContent(text) }}
      style={{ lineHeight: 2.2, color: 'var(--katex-color)' }}
    />
  );
}
