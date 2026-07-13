:

# MathAtlas

一个轻量的高中数学题库浏览与讲义导出工具。基于 Next.js，以 Obsidian Vault 作为数据源。

---

## 准备工作

电脑上需要装有 **Node.js 18+**：

- 访问 [nodejs.org](https://nodejs.org) 下载 LTS 版本
- 下载后双击安装，默认选项一路下一步即可

---

## 安装与启动

1. 下载本项目代码，解压到本地
2. 在项目文件夹里打开终端（在文件夹地址栏输入 `cmd` 回车即可），依次执行：

```bash
# (网络顺畅就跳过这一步)切换到国内镜像
npm config set registry https://registry.npmmirror.com

# 安装依赖
npm install

# 启动
npm run dev
```

3. 浏览器打开 **http://localhost:3000**
4. 想用「在 Obsidian 中打开」跳转功能的话，用 Obsidian 打开 `demo-vault` 文件夹作为 Vault 即可

项目自带两套示例试卷（2025 全国一卷、二卷），不配置也能直接体验。

---

## 配置自己的题库（可选）

> **注意**：Obsidian Vault 中必须有 `题库` 文件夹，程序只读这个文件夹。配置时填 Vault 根目录即可，程序会自动拼接 `\题库` 和 `\images`。

例如 Vault 结构像这样：

```
高中数学/          ← 填这个路径
├── 题库/          ← 名字不能改
│   ├── 2025全国一卷/
│   └── 2025全国二卷/
└── images/        ← 题目用到的图片
```

复制 `.env.local.example` 为 `.env.local`，用记事本打开，改成你的 Vault 路径：

```
VAULT_PATH=D:\文档\高中数学
NEXT_PUBLIC_VAULT_PATH=D:\文档\高中数学
```

更多细节参见 `demo-vault/` 目录。

---

## 功能

- 按年级、来源、题型、难度、知识点筛选题目
- 勾选题目生成讲义（Markdown / LaTeX 打包下载，含图片）
- 深色/浅色模式切换
- Obsidian 一键跳转
