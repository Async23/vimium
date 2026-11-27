# Vimium Async

Vimium Async 是一个面向 Chrome 的 Vimium
分支。你可以用键盘选定要滚动的侧栏或正文，也可以用提示字符操作网页脚本绑定的按钮和标签页。[上游 Vimium](https://github.com/philc/vimium)

## 安装到 Chrome

1. 下载扩展包，解压到准备长期保留的文件夹。[下载 Chrome 扩展包](https://github.com/Async23/vimium/releases/latest/download/vimium-async-chrome.zip)
2. 打开 `chrome://extensions`，开启「开发者模式」，点击「加载已解压的扩展程序」。
3. 选择包含 `manifest.json` 的文件夹。如果已启用原版
   Vimium，请停用原版，避免两个扩展同时响应快捷键。

更新时，用新版文件替换原目录中的扩展文件，然后在扩展管理页点击 Vimium Async
的「重新加载」。如果先前打开的网页有控件缺少提示，刷新该页即可重新识别。

## 两个常用操作

- **选择滚动区域**。在左侧有目录、右侧有正文的页面，依次按
  `;`、`f`、`s`，再输入目录上的提示字符。`j` 和 `k` 就能上下滚动目录。再次按 `;fs` 可以改选正文。
- **用键盘点击控件**。按 `f`
  显示提示，再输入目标上的字符。例如，在小红书个人主页，可以这样切换「笔记」「收藏」「点赞」。扩展在页面内识别点击监听器与框架点击绑定，并用鼠标指针样式判断由父元素统一处理点击的区域。

按 `?` 可以查看当前快捷键。[Vimium 命令参考](https://vimium.github.io/commands/)

## 开发与反馈

[从源码安装、测试和打包](CONTRIBUTING.md) · [反馈问题](https://github.com/Async23/vimium/issues) ·
[版本说明](https://github.com/Async23/vimium/releases)

本项目沿用 Vimium 的 MIT 许可证。[许可证全文](MIT-LICENSE.txt) · [上游作者与贡献者](CREDITS)
