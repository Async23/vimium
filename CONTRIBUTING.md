# 参与 Vimium Async

反馈问题时，请附上 Chrome 和扩展版本、复现步骤，以及可公开访问的示例页面或一段最小
HTML。拉取请求请说明哪些键盘操作会受影响，以及如何验证。[本项目的问题列表](https://github.com/Async23/vimium/issues)

## 从源码安装

```sh
git clone https://github.com/Async23/vimium.git
cd vimium
```

打开 `chrome://extensions`，开启「开发者模式」，点击「加载已解压的扩展程序」并选择仓库根目录。Chrome
直接读取这里的 `manifest.json`。修改代码后，在扩展管理页重新加载扩展，再刷新测试网页。

## 运行测试

安装 Deno 2.9 或更高版本。在仓库根目录运行以下命令。第一条为浏览器测试安装 Puppeteer 对应版本的
Chrome。

```sh
deno run -A puppeteer browsers install chrome
./make.js check
./make.js test
```

也可以设置 `PUPPETEER_EXECUTABLE_PATH` 指向已有的 Chrome 可执行文件。`./make.js test-unit`
只运行单元测试，`./make.js test-dom` 在浏览器中运行 DOM 测试。

涉及点击提示的改动，请在真实网页上按 `f`
并输入提示字符，确认目标控件确实响应。涉及滚动的改动，请在有两个独立滚动区域的页面按
`;fs`，选定其中一个区域后用 `j`、`k` 检查滚动位置。

## 构建 Chrome 扩展包

```sh
./make.js package
```

Chrome 安装包位于 `dist/chrome-store/`。GitHub 发布附件统一命名为
`vimium-async-chrome.zip`，解压后可直接加载。版本号取自根目录的 `manifest.json`。

上游项目另有自己的贡献指南。[Vimium 贡献指南](https://github.com/philc/vimium/blob/master/CONTRIBUTING.md)
