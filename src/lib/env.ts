// src/lib/env.ts
/** 客户端可用环境变量（所有带NEXT_PUBLIC_，tsx组件通用） */
export const clientEnv = {
  vaultPath: process.env.NEXT_PUBLIC_VAULT_PATH ?? "./demo-vault",
  // 默认学段
  defaultGrade: process.env.NEXT_PUBLIC_DEFAULT_GRADE ?? "高中",
  // 学段下拉选项数组
  gradeList: process.env.NEXT_PUBLIC_GRADE_LIST?.split(",") ?? ["初中", "高中"],
  // 默认学科后缀
  defaultSubjectSuffix: process.env.NEXT_PUBLIC_DEFAULT_SUBJECT_SUFFIX ?? "数学",
  // 拼接完整默认分类名称（高中数学）
  get defaultSubject() {
    return `${this.defaultGrade}${this.defaultSubjectSuffix}`;
  },
};

/** 仅服务端API路由可用（route.ts，不含NEXT_PUBLIC前缀） */
export const serverEnv = {
  vaultPath: process.env.VAULT_PATH ?? "./demo-vault",
  defaultGrade: process.env.NEXT_PUBLIC_DEFAULT_GRADE ?? "高中",
};