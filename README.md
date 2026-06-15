# 灵感雷达

一个面向 UI/UX 设计师的本地灵感搜索控制台。输入一句设计任务后，工具会拆解需求、生成中英文关键词、给出不同平台的搜索词组合，并整理可直接复制的 AI 设计提示词。

## 主要功能

- 设计任务拆解：识别设计类型、主题内容、视觉风格、使用场景和情绪气质。
- 关键词生成：输出中文关键词、英文关键词和组合搜索词。
- 灵感平台入口：支持 Dribbble、Behance、Pinterest、花瓣、Awwwards、FontsInUse、Unsplash。
- 提示词场景：按视觉页、产品界面、图标 Logo、背景素材等场景生成不同提示词。
- 本地规则兜底：不配置大模型也能使用基础关键词和提示词生成。
- 可选模型增强：配置兼容 OpenAI Chat Completions 的接口后，可让模型进一步理解任务语义。

## 技术栈

- Vite
- TypeScript
- 原生 HTML / CSS / DOM
- ESLint

## 本地运行

```bash
npm install
npm run dev
```

启动后打开终端里显示的本地地址，通常是：

```text
http://127.0.0.1:5173/
```

## 常用命令

```bash
npm run dev
```

启动本地开发服务。

```bash
npm run typecheck
```

检查 TypeScript 类型。

```bash
npm run lint
```

运行 ESLint 检查。

```bash
npm run build
```

生成生产构建文件到 `dist/`。

## 大模型配置

项目可以不配置模型直接使用本地规则。如果需要更准确的提示词理解，可以配置大模型接口。

方式一：在页面内填写“大模型配置”。配置会保存在当前浏览器本地，不会提交到仓库。

方式二：复制 `.env.example` 为 `.env`，然后填写：

```bash
DESIGN_ASSISTANT_MODEL_API_URL=https://api.openai.com/v1/chat/completions
DESIGN_ASSISTANT_MODEL_API_KEY=your_api_key
DESIGN_ASSISTANT_MODEL=your_model_name
```

注意：`.env` 已被 `.gitignore` 排除，不要把真实 API Key 上传到 GitHub。

## 项目结构

```text
.
├── index.html
├── src
│   ├── main.ts
│   ├── styles.css
│   ├── types.ts
│   └── lib
│       ├── generateKeywords.ts
│       ├── platformSearch.ts
│       ├── promptAnalysisApi.ts
│       └── rules.ts
├── vite.config.js
├── package.json
├── tsconfig.json
└── eslint.config.js
```

## 在其他电脑上修改

```bash
git clone https://github.com/ElioGHB/-.git
cd -
npm install
npm run dev
```

修改完成后提交并推送：

```bash
git add .
git commit -m "更新说明"
git push
```

开始修改前建议先同步远程最新代码：

```bash
git pull
```

## 发布说明

`dist/` 是构建产物，当前不会提交到仓库。需要部署时先运行：

```bash
npm run build
```

然后将生成的 `dist/` 目录部署到静态站点服务即可。

## 开源协议

本项目基于 MIT License 开源，详见 [LICENSE](./LICENSE)。
如果你在公开项目中使用本工具，欢迎注明来源
