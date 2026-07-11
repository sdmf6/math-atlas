import katex from 'katex';
import { marked } from 'marked';

/** 把图片引用替换为正确的 API 路径 */
function replaceImages(text: string): string {
  // 1. 处理简写图片 ![alt](hash.jpg) 自动补全 images/ 前缀（修复赋值+参数顺序）
  text = text.replace(/!\[([^\]]*?)\]\(([^)]+)\)/g, (match, alt, filename) => {
    // 自动补全images目录
    const fileHash = filename.startsWith('images/') ? filename.split('/')[1] : filename;
    const widthNum = parseInt(alt, 10);
    let style = 'max-width:100%;display:block;margin:0.5rem 0;';
    if (!isNaN(widthNum) && widthNum > 0) {
      style = `width:${widthNum}px;display:block;margin:0.5rem 0;`;
    }
    return `<img src="/api/images/${encodeURIComponent(fileHash)}" alt="${alt}" style="${style}" />`;
  });

  // 2. 标准格式 ![alt](images/hash.jpg)
  text = text.replace(
    /!\[([^\]]*)\]\(images\/([^)]+)\)/g,
    (_, alt: string, filename: string) => {
      const width = parseInt(alt, 10);
      const style = (!isNaN(width) && width > 0)
        ? `width:${width}px;display:block;margin:0.5rem 0;`
        : 'max-width:100%;display:block;margin:0.5rem 0;';
      return `<img src="/api/images/${encodeURIComponent(filename)}" alt="${alt}" style="${style}" />`;
    }
  );

  // 3. 兼容Obsidian内嵌图片 ![[images/hash.jpg|宽度]]
  text = text.replace(
    /!\[\[images\/([^\]|]+)(?:\|(\d+))?\]\]/g,
    (_, filename: string, width?: string) => {
      const widthStyle = width ? `width:${width}px;` : 'max-width:100%;';
      return `<img src="/api/images/${encodeURIComponent(filename)}" alt="${filename}" style="${widthStyle}display:block;margin:0.5rem 0;" />`;
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
  // 1. 替换所有图片路径
  text = replaceImages(text);

  // 2. 保护已转义的 \$
  text = text.replace(/\\\$/g, DOLLAR_ESC);

  // 3. 提取所有 $ 公式块，换成占位符（避免 marked 破坏公式）
  const mathSlots: MathSlot[] = [];
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